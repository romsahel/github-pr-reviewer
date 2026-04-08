import { state } from './state.js';
import { parsePRFromURL } from './dom.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STORYLINE_STORAGE_PREFIX = 'storyline:';

// ── State ───────────────────────────────────────────────────────────────────
let storylineData = null;
let storylineActive = false;
let originalOrder = []; // regions in original DOM order
let reorderingInProgress = false;

// ── Fetch & Cache ───────────────────────────────────────────────────────────

function buildStorylineCacheKey(owner, repo, prNumber) {
  return `${STORYLINE_STORAGE_PREFIX}${owner}/${repo}:${prNumber}`;
}

async function fetchStorylineFromPage(owner, repo, prNumber) {
  // Fetch the PR conversation page and extract raw markdown from edit form textareas
  const url = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
  try {
    const resp = await fetch(url, { credentials: 'same-origin' });
    console.log('[PR Reviewer] Storyline fetch:', resp.status, resp.ok, resp.url);
    if (!resp.ok) return null;
    const html = await resp.text();
    console.log('[PR Reviewer] Storyline html:', html);
    // Match by the surrounding details/summary structure — GitHub strips data-* attributes
    const match = html.match(/<summary>PR Storyline<\/summary>\s*<pre[^>]*>\s*([\s\S]*?)\s*<\/pre>/);
    console.log('[PR Reviewer] Storyline match:', match);
    if (match) {
      // GitHub injects attributes like class="notranslate" and dir="auto" into
      // HTML tags inside the JSON values — these contain unescaped quotes that
      // break JSON.parse. Strip all HTML tag attributes before decoding.
      const cleaned = match[1]
        .replace(/<(\w+)\s+[^>]*>/g, '<$1>')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return JSON.parse(cleaned);
    }
    return null;
  } catch (e) {
    console.warn('[PR Reviewer] Failed to fetch storyline:', e);
    return null;
  }
}

async function getCachedStoryline(cacheKey) {
  try {
    const result = await browser.storage.local.get(cacheKey);
    const cached = result[cacheKey];
    if (!cached) return undefined; // no cache entry
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return undefined; // expired
    return cached.data; // may be null (no storyline exists)
  } catch {
    return undefined;
  }
}

async function cacheStoryline(cacheKey, data) {
  try {
    await browser.storage.local.set({
      [cacheKey]: { data, timestamp: Date.now() },
    });
  } catch (e) {
    console.warn('[PR Reviewer] Failed to cache storyline:', e);
  }
}

export async function fetchStoryline(owner, repo, prNumber) {
  const cacheKey = buildStorylineCacheKey(owner, repo, prNumber);
  const cached = await getCachedStoryline(cacheKey);
  console.log('cached', JSON.stringify(cached, null, 2));
  if (cached) return cached;

  const data = await fetchStorylineFromPage(owner, repo, prNumber);
  await cacheStoryline(cacheKey, data);
  return data;
}

// ── DOM Reordering ──────────────────────────────────────────────────────────

function getFilePathFromRegion(region) {
  const btn = region.querySelector('button[data-file-path]');
  if (btn) return btn.getAttribute('data-file-path');
  const table = region.querySelector('table[data-diff-anchor]');
  if (table) {
    const label = table.getAttribute('aria-label') || '';
    if (label.startsWith('Diff for: ')) return label.slice('Diff for: '.length).trim();
  }
  return null;
}

function findFileWrapper(filePath) {
  const container = getDiffContainer();
  if (!container) return null;
  const regions = container.querySelectorAll('div[role="region"]');
  for (const region of regions) {
    const btn = region.querySelector('button[data-file-path]');
    if (btn && btn.getAttribute('data-file-path') === filePath) return getFileWrapper(region);
    const table = region.querySelector('table[data-diff-anchor]');
    if (table) {
      const label = table.getAttribute('aria-label') || '';
      if (label === `Diff for: ${filePath}`) return getFileWrapper(region);
    }
  }
  return null;
}

// Get the direct-child wrapper of the diff container that holds a given region
function getFileWrapper(region) {
  const container = getDiffContainer();
  if (!container) return null;
  let el = region;
  while (el && el.parentElement !== container) {
    el = el.parentElement;
  }
  return el;
}

function saveOriginalOrder() {
  const container = getDiffContainer();
  if (!container) return;
  // Save the container's direct children (wrappers) in their original order
  const children = Array.from(container.children).filter(c => c.tagName === 'DIV');
  if (children.length === 0) return;

  if (originalOrder.length === 0) {
    originalOrder = children;
    console.log('[PR Reviewer] saveOriginalOrder: saved', originalOrder.length, 'wrappers');
  } else {
    for (const child of children) {
      if (!originalOrder.includes(child)) {
        originalOrder.push(child);
      }
    }
  }
}

function getDiffContainer() {
  return document.querySelector('[data-testid="progressive-diffs-list"]')
    || document.querySelector('.js-diff-progressive-container');
}

function removeChapterBanners() {
  document.querySelectorAll('.pr-storyline-chapter').forEach(el => el.remove());
}

export function applyStorylineOrder(data) {
  if (!data || !data.chapters) return;
  reorderingInProgress = true;

  const container = getDiffContainer();
  if (!container) return;

  saveOriginalOrder();
  removeChapterBanners();

  // Build set of chapter file paths
  const chapterFilePaths = new Set();
  for (const chapter of data.chapters) {
    for (const f of chapter.files) chapterFilePaths.add(f);
  }

  // Collect ungrouped wrappers before we start moving things
  const ungroupedWrappers = [];
  for (const wrapper of Array.from(container.children)) {
    if (wrapper.tagName !== 'DIV') continue;
    const region = wrapper.querySelector('div[role="region"]') || (wrapper.getAttribute('role') === 'region' ? wrapper : null);
    if (!region) {
      ungroupedWrappers.push(wrapper);
      continue;
    }
    const filePath = getFilePathFromRegion(region);
    if (!filePath || !chapterFilePaths.has(filePath)) {
      ungroupedWrappers.push(wrapper);
    }
  }

  // Move chapter files into order, injecting banners
  for (let i = 0; i < data.chapters.length; i++) {
    const chapter = data.chapters[i];
    const banner = createChapterBanner(i + 1, chapter, data.chapters.length);
    container.appendChild(banner);

    for (const filePath of chapter.files) {
      const wrapper = findFileWrapper(filePath);
      if (wrapper) container.appendChild(wrapper);
    }
  }

  // Move ungrouped files to the bottom
  for (const wrapper of ungroupedWrappers) {
    container.appendChild(wrapper);
  }

  removeLineAnnotations();
  injectLineAnnotations(data);
  reorderingInProgress = false;
}

function createChapterBanner(chapterNum, chapter, totalChapters) {
  const banner = document.createElement('div');
  banner.className = 'pr-storyline-chapter';
  banner.id = `pr-storyline-chapter-${chapterNum}`;

  const header = document.createElement('div');
  header.className = 'pr-storyline-chapter-header';
  header.innerHTML = `<span class="pr-storyline-chapter-number">${chapterNum}/${totalChapters}</span> ${escapeHtml(chapter.title)}`;
  banner.appendChild(header);

  if (chapter.narrative) {
    const narrative = document.createElement('div');
    narrative.className = 'pr-storyline-chapter-narrative';
    narrative.innerHTML = autoLinkChapterRefs(chapter.narrative);
    banner.appendChild(narrative);
  }

  return banner;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function autoLinkChapterRefs(html) {
  return html.replace(/Chapter (\d+)/g, (match, num) => {
    return `<a href="#pr-storyline-chapter-${num}" class="pr-storyline-chapter-link">${match}</a>`;
  });
}

// ── Line Annotations ────────────────────────────────────────────────────────

function removeLineAnnotations() {
  document.querySelectorAll('.pr-storyline-annotation').forEach(el => el.remove());
}

function injectLineAnnotations(data) {
  if (!data || !data.chapters) return;
  for (const chapter of data.chapters) {
    if (!chapter.lines) continue;
    for (const line of chapter.lines) {
      const row = findDiffRow(line.file, line.side, line.lineNumber);
      if (!row) continue;
      const annotationRow = document.createElement('tr');
      annotationRow.className = 'pr-storyline-annotation';
      const td = document.createElement('td');
      td.colSpan = row.children.length;
      td.textContent = line.note;
      annotationRow.appendChild(td);
      row.after(annotationRow);
    }
  }
}

function findDiffRow(filePath, side, lineNumber) {
  const diffSide = side === 'R' ? 'right' : 'left';
  // Find the file's table
  const tables = document.querySelectorAll('table[data-diff-anchor]');
  for (const table of tables) {
    const label = table.getAttribute('aria-label') || '';
    const region = table.closest('div[role="region"]');
    const btn = region && region.querySelector('button[data-file-path]');
    const tableFilePath = label.startsWith('Diff for: ')
      ? label.slice('Diff for: '.length).trim()
      : (btn ? btn.getAttribute('data-file-path') : null);
    if (tableFilePath !== filePath) continue;
    // Find the specific line
    const td = table.querySelector(
      `td.new-diff-line-number[data-line-number="${lineNumber}"][data-diff-side="${diffSide}"]`
    );
    if (td) return td.closest('tr');
  }
  return null;
}

// ── Restore Original Order ──────────────────────────────────────────────────

function restoreOriginalOrder() {
  reorderingInProgress = true;
  removeLineAnnotations();
  removeChapterBanners();
  const container = getDiffContainer();
  console.log('[PR Reviewer] restoreOriginalOrder: container=', container, 'originalOrder.length=', originalOrder.length);
  if (!container) { reorderingInProgress = false; return; }
  // Re-append regions in original order
  for (const region of originalOrder) {
    console.log('[PR Reviewer] restore: moving region', getFilePathFromRegion(region), 'parentElement=', region.parentElement === container);
    container.appendChild(region);
  }
  // Log final order
  const finalRegions = container.querySelectorAll(':scope > div[role="region"]');
  console.log('[PR Reviewer] restore done, final region count:', finalRegions.length, 'order:', Array.from(finalRegions).map(r => getFilePathFromRegion(r)));
  reorderingInProgress = false;
}

// ── Toggle ──────────────────────────────────────────────────────────────────

function createToggleButton() {
  const existing = document.querySelector('.pr-storyline-toggle');
  if (existing) return existing;

  const btn = document.createElement('button');
  btn.className = 'pr-storyline-toggle active';
  btn.textContent = 'Storyline';
  btn.title = 'Toggle storyline order (Shift+click to re-fetch)';
  btn.addEventListener('click', (e) => toggleStoryline(e.shiftKey));

  // Insert into the PR files toolbar, before the file controls (viewed/review button)
  const toolbar = document.querySelector('section[class*="PullRequestFilesToolbar"]');
  if (toolbar) {
    // Insert before the right-side controls (viewed progress / review button)
    const rightControls = toolbar.querySelector('div[class*="file-controls"]')
      || toolbar.lastElementChild;
    if (rightControls) {
      rightControls.parentElement.insertBefore(btn, rightControls);
    } else {
      toolbar.appendChild(btn);
    }
  } else {
    // Fallback: insert before the diff container
    const container = getDiffContainer();
    if (container) container.parentElement.insertBefore(btn, container);
  }

  return btn;
}

function updateToggleButton() {
  const btn = document.querySelector('.pr-storyline-toggle');
  if (!btn) return;
  btn.classList.toggle('active', storylineActive);
}

async function toggleStoryline(forceRefresh = false) {
  if (forceRefresh) {
    const pr = parsePRFromURL(location.href);
    if (pr) {
      const cacheKey = buildStorylineCacheKey(pr.owner, pr.repo, pr.prNumber);
      await browser.storage.local.remove(cacheKey);
      const data = await fetchStoryline(pr.owner, pr.repo, pr.prNumber);
      if (data) {
        storylineData = data;
        if (storylineActive) {
          // Re-apply with fresh data
          applyStorylineOrder(storylineData);
        }
        console.log('[PR Reviewer] Storyline re-fetched');
        return;
      }
    }
  }

  if (storylineActive) {
    restoreOriginalOrder();
    storylineActive = false;
  } else if (storylineData) {
    applyStorylineOrder(storylineData);
    storylineActive = true;
  }
  updateToggleButton();
}

// ── Init ────────────────────────────────────────────────────────────────────

export async function initStoryline() {
  const pr = parsePRFromURL(location.href);
  if (!pr) return;

  storylineData = await fetchStoryline(pr.owner, pr.repo, pr.prNumber);
  if (!storylineData) return;

  console.log('[PR Reviewer] Storyline found, activating');
  createToggleButton();

  // Save original order before first reorder
  const container = getDiffContainer();
  console.log('[PR Reviewer] initStoryline container:', container);
  if (container) {
    const directRegions = container.querySelectorAll(':scope > div[role="region"]');
    const allRegions = container.querySelectorAll('div[role="region"]');
    console.log('[PR Reviewer] direct child regions:', directRegions.length, 'all nested regions:', allRegions.length);
    // Log the container's direct children types
    console.log('[PR Reviewer] container children:', Array.from(container.children).map(c => c.tagName + '[role=' + c.getAttribute('role') + ']'));
  }
  saveOriginalOrder();

  storylineActive = true;
  applyStorylineOrder(storylineData);
}

function waitForDiffRegions() {
  return new Promise((resolve) => {
    const container = getDiffContainer();
    if (!container) { resolve(); return; }
    const observer = new MutationObserver(() => {
      const regions = container.querySelectorAll(':scope > div[role="region"]');
      if (regions.length > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    // Timeout after 10s
    setTimeout(() => { observer.disconnect(); resolve(); }, 10000);
  });
}

export function reapplyStoryline() {
  if (reorderingInProgress || !storylineActive || !storylineData) return;
  const container = getDiffContainer();
  if (!container) return;
  // Check if any new wrappers appeared that we haven't tracked
  const currentChildren = Array.from(container.children).filter(c => c.tagName === 'DIV' && !c.classList.contains('pr-storyline-chapter'));
  const hasNew = currentChildren.some(c => !originalOrder.includes(c));
  if (hasNew) {
    saveOriginalOrder();
    applyStorylineOrder(storylineData);
  }
}

export function resetStoryline() {
  storylineData = null;
  storylineActive = false;
  originalOrder = [];
  removeChapterBanners();
  const btn = document.querySelector('.pr-storyline-toggle');
  if (btn) btn.remove();
}
