import { state } from './state.js';
import { getSideChar, getLineKey, getFilePathForRow, isEmptyRow } from './dom.js';

// When a row is marked reviewed, visually mark any consecutive blank rows immediately above it.
function propagateReviewedAbove(tr) {
  let prev = tr.previousElementSibling;
  while (prev && prev.classList.contains('diff-line-row')) {
    if (!isEmptyRow(prev)) break;
    prev.classList.add('pr-line-reviewed');
    prev = prev.previousElementSibling;
  }
}

export function setLineVisualState(tr, isReviewed) {
  if (isReviewed) {
    tr.classList.add('pr-line-reviewed');
    propagateReviewedAbove(tr);
  } else {
    tr.classList.remove('pr-line-reviewed');
  }
}

export function applyStateToDOM() {
  const cells = document.querySelectorAll('td.new-diff-line-number[data-line-number]');

  // Track which stored keys were matched exactly, and record the first DOM td per content for fallback.
  const exactMatchedKeys = new Set();     // `${filePath}:${sideChar}:${lineKey}`
  const firstTrByContent = new Map();     // `${filePath}:${sideChar}:${content}` → tr

  for (const td of cells) {
    const tr = td.closest('tr');
    if (!tr || tr.querySelector('td.diff-hunk-cell')) continue;
    const filePath = getFilePathForRow(tr);
    if (!filePath) continue;
    const sides = state.reviewState.get(filePath);
    if (!sides) continue;
    const sideChar = getSideChar(td);
    const lineKey = getLineKey(td);
    if (lineKey === null) continue;

    // Pass 1: exact match
    if (sides[sideChar].has(lineKey)) {
      setLineVisualState(tr, true);
      exactMatchedKeys.add(`${filePath}:${sideChar}:${lineKey}`);
    }

    // Build first-occurrence index for pass 2 fallback
    const content = lineKey.slice(lineKey.indexOf(':') + 1);
    const occKey = `${filePath}:${sideChar}:${content}`;
    if (!firstTrByContent.has(occKey)) firstTrByContent.set(occKey, tr);
  }

  // Pass 2: for stored keys with no exact match, mark the first DOM occurrence with that content.
  for (const [filePath, sides] of state.reviewState) {
    for (const sideChar of ['L', 'R']) {
      for (const lineKey of sides[sideChar]) {
        if (exactMatchedKeys.has(`${filePath}:${sideChar}:${lineKey}`)) continue;
        const content = lineKey.slice(lineKey.indexOf(':') + 1);
        const tr = firstTrByContent.get(`${filePath}:${sideChar}:${content}`);
        if (tr) setLineVisualState(tr, true);
      }
    }
  }
}
