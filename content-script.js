/* GitHub PR Line-by-Line Reviewer — content script */
(function () {
  'use strict';

  // ── 1. State ──────────────────────────────────────────────────────────────

  let storageKey = null;
  // reviewState: Map<filePath, { L: Set<number>, R: Set<number> }>
  let reviewState = new Map();
  let saveTimer = null;
  let lastHoveredTd = null;
  let diffObserver = null;
  let urlObserver = null;
  let lastURL = location.href;

  // ── 2. Storage module ─────────────────────────────────────────────────────

  function buildStorageKey(owner, repo, prNumber) {
    return `pr:${owner}/${repo}:${prNumber}`;
  }

  function serializeState(state) {
    const obj = {};
    for (const [filePath, sides] of state) {
      obj[filePath] = {
        L: Array.from(sides.L).sort((a, b) => a - b),
        R: Array.from(sides.R).sort((a, b) => a - b),
      };
    }
    return obj;
  }

  function deserializeState(obj) {
    const map = new Map();
    if (!obj || typeof obj !== 'object') return map;
    for (const [filePath, sides] of Object.entries(obj)) {
      map.set(filePath, {
        L: new Set(Array.isArray(sides.L) ? sides.L : []),
        R: new Set(Array.isArray(sides.R) ? sides.R : []),
      });
    }
    return map;
  }

  async function loadState(key) {
    try {
      const result = await browser.storage.local.get(key);
      return deserializeState(result[key]);
    } catch (e) {
      console.warn('[PR Reviewer] Failed to load state:', e);
      return new Map();
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistState, 300);
  }

  async function persistState() {
    if (!storageKey) return;
    try {
      await browser.storage.local.set({ [storageKey]: serializeState(reviewState) });
    } catch (e) {
      console.warn('[PR Reviewer] Failed to save state:', e);
    }
  }

  function getOrCreateFileSides(filePath) {
    if (!reviewState.has(filePath)) {
      reviewState.set(filePath, { L: new Set(), R: new Set() });
    }
    return reviewState.get(filePath);
  }

  // ── 3. URL / DOM parsing ──────────────────────────────────────────────────

  function parsePRFromURL(url) {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], prNumber: m[3] };
  }

  function getFilePathForRow(tr) {
    const table = tr.closest('table[data-diff-anchor]');
    if (!table) return null;

    // Primary: aria-label="Diff for: <path>"
    const label = table.getAttribute('aria-label');
    if (label) {
      const prefix = 'Diff for: ';
      if (label.startsWith(prefix)) return label.slice(prefix.length).trim();
    }

    // Fallback: button[data-file-path] inside the file header region
    const region = table.closest('div[role="region"]');
    if (region) {
      const btn = region.querySelector('button[data-file-path]');
      if (btn) return btn.getAttribute('data-file-path');
    }

    return null;
  }

  function getSideChar(td) {
    const side = td.getAttribute('data-diff-side');
    if (side === 'right') return 'R';
    if (side === 'left') return 'L';
    // Fallback: if no side attribute, treat as right (new file)
    return 'R';
  }

  // ── 4. Event binding ──────────────────────────────────────────────────────

  function bindLineNumberClicks(root) {
    root = root || document;
    const cells = root.querySelectorAll('td.new-diff-line-number[data-line-number]');
    for (const td of cells) {
      if (td.dataset.reviewerBound === '1') continue;
      td.dataset.reviewerBound = '1';
      td.addEventListener('click', handleLineNumberClick);
      td.addEventListener('mouseenter', () => { lastHoveredTd = td; });

      // Bind the whole row so hovering anywhere on it updates lastHoveredTd
      const tr = td.closest('tr');
      if (tr && !tr.dataset.reviewerRowBound) {
        tr.dataset.reviewerRowBound = '1';
        tr.addEventListener('mouseenter', () => {
          const preferredTd =
            tr.querySelector('td.new-diff-line-number[data-diff-side="right"][data-line-number]') ||
            tr.querySelector('td.new-diff-line-number[data-line-number]');
          if (preferredTd) lastHoveredTd = preferredTd;
        });
      }
    }
  }

  function handleLineNumberClick(event) {
    const td = event.currentTarget;
    const lineNum = parseInt(td.getAttribute('data-line-number'), 10);
    if (isNaN(lineNum)) return;

    const tr = td.closest('tr');
    if (!tr) return;

    // Skip hunk header rows
    if (tr.querySelector('td.diff-hunk-cell')) return;

    const filePath = getFilePathForRow(tr);
    if (!filePath) return;

    const side = getSideChar(td);
    const sides = getOrCreateFileSides(filePath);
    const isNowReviewed = !sides[side].has(lineNum);

    if (isNowReviewed) {
      sides[side].add(lineNum);
    } else {
      sides[side].delete(lineNum);
    }

    setLineVisualState(tr, isNowReviewed);
    updateFileProgress(filePath);
    scheduleSave();
  }

  // ── 5. Visual state ───────────────────────────────────────────────────────

  function setLineVisualState(tr, isReviewed) {
    if (isReviewed) {
      tr.classList.add('pr-line-reviewed');
    } else {
      tr.classList.remove('pr-line-reviewed');
    }
  }

  function applyStateToDOM() {
    for (const [filePath, sides] of reviewState) {
      const table = tableForFilePath(filePath);

      if (!table) continue;

      for (const [sideChar, lineSet] of [['L', sides.L], ['R', sides.R]]) {
        const diffSide = sideChar === 'L' ? 'left' : 'right';
        for (const lineNum of lineSet) {
          const td = table.querySelector(
            `td.new-diff-line-number[data-diff-side="${diffSide}"][data-line-number="${lineNum}"]`
          );
          if (td) {
            const tr = td.closest('tr');
            if (tr) setLineVisualState(tr, true);
          }
        }
      }
    }
  }

  function findTableByFilePath(filePath) {
    // Fallback: search all file regions for matching button[data-file-path]
    const regions = document.querySelectorAll('div[role="region"]');
    for (const region of regions) {
      const btn = region.querySelector('button[data-file-path]');
      if (btn && btn.getAttribute('data-file-path') === filePath) {
        return region.querySelector('table[data-diff-anchor]');
      }
    }
    return null;
  }

  // aria-label attribute value contains special chars — use attribute selector safely
  function tableForFilePath(filePath) {
    const label = 'Diff for: ' + filePath;
    // Search all tables with data-diff-anchor attribute
    const tables = document.querySelectorAll('table[data-diff-anchor]');
    for (const t of tables) {
      if (t.getAttribute('aria-label') === label) return t;
    }
    return findTableByFilePath(filePath);
  }

  // ── 6. File progress ──────────────────────────────────────────────────────

  function updateFileProgress(filePath) {
    const table = tableForFilePath(filePath);
    if (!table) return;

    // Count total unique (side, lineNumber) pairs visible in DOM
    const cells = table.querySelectorAll('td.new-diff-line-number[data-line-number]');
    const seen = new Set();
    let totalLines = 0;
    for (const td of cells) {
      const key = td.getAttribute('data-diff-side') + ':' + td.getAttribute('data-line-number');
      if (!seen.has(key)) {
        seen.add(key);
        totalLines++;
      }
    }

    const sides = reviewState.get(filePath) || { L: new Set(), R: new Set() };
    const reviewedCount = sides.L.size + sides.R.size;

    // Find or create the progress badge in the file header
    let badge = table.parentElement
      ? table.parentElement.querySelector('.pr-reviewer-progress')
      : null;

    // Look wider: the file region container
    const region = table.closest('div[role="region"]');
    if (!badge && region) {
      badge = region.querySelector('.pr-reviewer-progress');
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'pr-reviewer-progress';

      // Insert after the file name h3 or at top of the region header
      let inserted = false;
      if (region) {
        const h3 = region.querySelector('h3, [data-component="DiffFileHeader"]');
        if (h3) {
          h3.insertAdjacentElement('afterend', badge);
          inserted = true;
        }
        if (!inserted) {
          // Try inserting near the file path button
          const btn = region.querySelector('button[data-file-path]');
          if (btn) {
            btn.insertAdjacentElement('afterend', badge);
            inserted = true;
          }
        }
        if (!inserted) {
          region.prepend(badge);
        }
      }
    }

    if (totalLines === 0) {
      badge.className = 'pr-reviewer-progress empty';
      badge.textContent = '0 lines';
      return;
    }

    badge.textContent = `${reviewedCount}/${totalLines}`;
    if (reviewedCount === totalLines) {
      badge.className = 'pr-reviewer-progress complete';
    } else if (reviewedCount > 0) {
      badge.className = 'pr-reviewer-progress partial';
    } else {
      badge.className = 'pr-reviewer-progress empty';
    }
  }

  function updateAllFileProgress() {
    // Collect file paths from all tables
    const tables = document.querySelectorAll('table[data-diff-anchor]');
    const seenPaths = new Set();
    for (const table of tables) {
      const label = table.getAttribute('aria-label') || '';
      let filePath = null;
      if (label.startsWith('Diff for: ')) {
        filePath = label.slice('Diff for: '.length).trim();
      } else {
        const region = table.closest('div[role="region"]');
        const btn = region && region.querySelector('button[data-file-path]');
        if (btn) filePath = btn.getAttribute('data-file-path');
      }
      if (filePath && !seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        updateFileProgress(filePath);
      }
    }
  }

  // ── 7. Keyboard navigation ────────────────────────────────────────────────

  function showToast(message) {
    let toast = document.getElementById('pr-reviewer-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pr-reviewer-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  function toggleCurrentLine() {
    if (!lastHoveredTd) return;
    lastHoveredTd.click();
  }

  function markCurrentLine() {
    if (!lastHoveredTd) return;
    const td = lastHoveredTd;
    const lineNum = parseInt(td.getAttribute('data-line-number'), 10);
    if (isNaN(lineNum)) return;
    const tr = td.closest('tr');
    if (!tr || tr.querySelector('td.diff-hunk-cell')) return;
    const filePath = getFilePathForRow(tr);
    if (!filePath) return;
    const side = getSideChar(td);
    const sides = getOrCreateFileSides(filePath);
    if (sides[side].has(lineNum)) return; // already reviewed
    sides[side].add(lineNum);
    setLineVisualState(tr, true);
    updateFileProgress(filePath);
    scheduleSave();
  }

  function markAllInFileUntilHere() {
    if (!lastHoveredTd) return;
    const anchorTr = lastHoveredTd.closest('tr');
    if (!anchorTr) return;
    const filePath = getFilePathForRow(anchorTr);
    if (!filePath) return;
    const table = tableForFilePath(filePath);
    if (!table) return;

    const allRows = Array.from(table.querySelectorAll('tr.diff-line-row'));
    let changed = false;

    for (const tr of allRows) {
      if (tr.querySelector('td.diff-hunk-cell')) {
        if (tr === anchorTr) break;
        continue;
      }

      const tds = tr.querySelectorAll('td.new-diff-line-number[data-line-number]');
      for (const td of tds) {
        const lineNum = parseInt(td.getAttribute('data-line-number'), 10);
        if (isNaN(lineNum)) continue;
        const side = getSideChar(td);
        const sides = getOrCreateFileSides(filePath);
        if (!sides[side].has(lineNum)) {
          sides[side].add(lineNum);
          changed = true;
        }
      }
      setLineVisualState(tr, true);

      if (tr === anchorTr) break;
    }

    if (changed) {
      updateFileProgress(filePath);
      scheduleSave();
    }
  }

  function navigateToUnreviewed(direction) {
    // Collect diff rows that are not reviewed and not hunk headers
    const rows = Array.from(
      document.querySelectorAll('tr.diff-line-row:not(.pr-line-reviewed)')
    ).filter(tr => !tr.querySelector('td.diff-hunk-cell'));

    if (rows.length === 0) {
      showToast('All lines reviewed!');
      return;
    }

    const viewportMid = window.innerHeight / 2 + window.scrollY;
    let target = null;

    if (direction === 'next') {
      // First row whose top edge is below viewport middle
      target = rows.find(tr => tr.getBoundingClientRect().top + window.scrollY > viewportMid);
      if (!target) target = rows[0]; // wrap
    } else {
      // Last row whose top edge is above viewport middle
      const before = rows.filter(tr => tr.getBoundingClientRect().top + window.scrollY < viewportMid);
      target = before.length > 0 ? before[before.length - 1] : rows[rows.length - 1];
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('pr-line-flash');
    // Force reflow to restart animation
    void target.offsetWidth;
    target.classList.add('pr-line-flash');
    setTimeout(() => target.classList.remove('pr-line-flash'), 1200);
  }

  function onKeyDown(event) {
    // Skip when typing in form elements
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    const key = event.key;

    if (key === 'r' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      markCurrentLine();
      return;
    }

    if (key === 'R' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      markAllInFileUntilHere();
      return;
    }

    if (key === 'N' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      navigateToUnreviewed('next');
      return;
    }

    if (key === 'P' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      navigateToUnreviewed('prev');
      return;
    }
  }

  // Handle commands forwarded from background script
  function onMessage(message) {
    if (message && message.type === 'command') {
      switch (message.command) {
        case 'toggle-reviewed':
          toggleCurrentLine();
          break;
        case 'next-unreviewed':
          navigateToUnreviewed('next');
          break;
        case 'prev-unreviewed':
          navigateToUnreviewed('prev');
          break;
      }
    }
  }

  // ── 8. SPA navigation ─────────────────────────────────────────────────────

  let debounceTimer = null;
  function debounce(fn, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  const onDiffMutation = debounce(function () {
    bindLineNumberClicks();
    applyStateToDOM();
    updateAllFileProgress();
  }, 150);

  function startDiffObserver() {
    if (diffObserver) diffObserver.disconnect();

    const container = document.querySelector('[data-testid="progressive-diffs-list"]')
      || document.querySelector('.js-diff-progressive-container')
      || document.body;

    diffObserver = new MutationObserver(onDiffMutation);
    diffObserver.observe(container, { childList: true, subtree: true });
  }

  async function onURLChange() {
    const currentURL = location.href;
    if (currentURL === lastURL) return;
    lastURL = currentURL;

    // Disconnect existing diff observer
    if (diffObserver) {
      diffObserver.disconnect();
      diffObserver = null;
    }

    const pr = parsePRFromURL(currentURL);
    if (!pr) return;

    const newKey = buildStorageKey(pr.owner, pr.repo, pr.prNumber);
    if (newKey !== storageKey) {
      storageKey = newKey;
      reviewState = await loadState(storageKey);
    }

    bindLineNumberClicks();
    applyStateToDOM();
    updateAllFileProgress();
    startDiffObserver();
  }

  function startURLObserver() {
    // GitHub uses Turbo/Hotwire — listen for turbo:load
    document.addEventListener('turbo:load', onURLChange);

    // Fallback: observe title changes
    if (urlObserver) urlObserver.disconnect();
    const titleEl = document.querySelector('title');
    if (titleEl) {
      urlObserver = new MutationObserver(() => {
        if (location.href !== lastURL) onURLChange();
      });
      urlObserver.observe(titleEl, { childList: true });
    }

    // Fallback: popstate (back/forward navigation)
    window.addEventListener('popstate', onURLChange);
  }

  // ── 9. Initialization ─────────────────────────────────────────────────────

  async function initForCurrentPR() {
    const pr = parsePRFromURL(location.href);
    if (!pr) return;

    storageKey = buildStorageKey(pr.owner, pr.repo, pr.prNumber);
    reviewState = await loadState(storageKey);

    bindLineNumberClicks();
    applyStateToDOM();
    updateAllFileProgress();
    startDiffObserver();
  }

  document.addEventListener('keydown', onKeyDown);
  browser.runtime.onMessage.addListener(onMessage);
  startURLObserver();
  initForCurrentPR();
})();
