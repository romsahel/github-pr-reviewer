import { state } from './state.js';
import { getFilePathForRow, getSideChar, getLineKey, tableForFilePath, isEmptyLine, isEmptyRow } from './dom.js';
import { getOrCreateFileSides, scheduleSave } from './storage.js';
import { setLineVisualState } from './visual.js';
import { updateFileProgress } from './progress.js';
import { showToast, checkMilestone } from './toast.js';

function toggleCurrentLine() {
  if (!state.lastHoveredTd) return;
  state.lastHoveredTd.click();
}

function markCurrentLine() {
  if (!state.lastHoveredTd) return;
  const td = state.lastHoveredTd;
  if (isEmptyLine(td)) return;
  const lineKey = getLineKey(td);
  if (lineKey === null) return;
  const tr = td.closest('tr');
  if (!tr || tr.querySelector('td.diff-hunk-cell')) return;
  const filePath = getFilePathForRow(tr);
  if (!filePath) return;
  const side = getSideChar(td);
  const sides = getOrCreateFileSides(filePath);
  if (sides[side].has(lineKey)) return; // already reviewed
  const prev = state.totalLinesEver;
  sides[side].add(lineKey);
  state.totalLinesEver++;
  setLineVisualState(tr, true);
  updateFileProgress(filePath);
  scheduleSave();
  checkMilestone(prev);
}

function markAllInFileUntilHere() {
  if (!state.lastHoveredTd) return;
  const anchorTr = state.lastHoveredTd.closest('tr');
  if (!anchorTr) return;
  const filePath = getFilePathForRow(anchorTr);
  if (!filePath) return;
  const table = tableForFilePath(filePath);
  if (!table) return;

  const allRows = Array.from(table.querySelectorAll('tr.diff-line-row'));
  const anchorIdx = allRows.indexOf(anchorTr);
  if (anchorIdx === -1) return;

  // Start from just after the closest already-reviewed row above the anchor.
  // If no reviewed row exists above, start from the top of the file.
  let startIdx = 0;
  for (let i = anchorIdx - 1; i >= 0; i--) {
    if (allRows[i].classList.contains('pr-line-reviewed')) {
      startIdx = i + 1;
      break;
    }
  }

  let newCount = 0;

  for (let i = startIdx; i <= anchorIdx; i++) {
    const tr = allRows[i];
    if (tr.querySelector('td.diff-hunk-cell')) continue;
    if (isEmptyRow(tr)) continue;

    const tds = tr.querySelectorAll('td.new-diff-line-number[data-line-number]:not(.diff-line-number-neutral)');
    if (tds.length === 0) continue; // context-only row, skip
    for (const td of tds) {
      const lineKey = getLineKey(td);
      if (lineKey === null) continue;
      const side = getSideChar(td);
      const sides = getOrCreateFileSides(filePath);
      if (!sides[side].has(lineKey)) {
        sides[side].add(lineKey);
        newCount++;
      }
    }
    setLineVisualState(tr, true);
  }

  if (newCount > 0) {
    const prev = state.totalLinesEver;
    state.totalLinesEver += newCount;
    updateFileProgress(filePath);
    scheduleSave();
    checkMilestone(prev);
  }
}

function toggleFileViewed() {
  if (!state.lastHoveredTd) return;
  const table = state.lastHoveredTd.closest('table[data-diff-anchor]');
  if (!table) return;
  const region = table.closest('div[role="region"]');
  if (!region) return;
  const btn = region.querySelector('button[aria-label="Not Viewed"], button[aria-label="Viewed"]');
  if (btn) btn.click();
}

function navigateToUnreviewed(direction) {
  // Collect diff rows that are not reviewed and not hunk headers
  const rows = Array.from(
    document.querySelectorAll('tr.diff-line-row:not(.pr-line-reviewed)')
  ).filter(tr => !tr.querySelector('td.diff-hunk-cell') && !isEmptyRow(tr));

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

export function onKeyDown(event) {
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
export function onMessage(message) {
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
      case 'toggle-file-viewed':
        toggleFileViewed();
        break;
    }
  }
}
