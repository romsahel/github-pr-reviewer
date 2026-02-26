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

  const exactMatchedKeys = new Set();  // `${filePath}:${sideChar}:${lineKey}`
  const exactMatchedTrs = new Set();   // trs already marked via exact match
  const trsByContent = new Map();      // `${filePath}:${sideChar}:${content}` → tr[] (DOM order)

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
      exactMatchedTrs.add(tr);
    }

    // Build per-content DOM occurrence list for pass 2 fallback
    const content = lineKey.slice(lineKey.indexOf(':') + 1);
    const occKey = `${filePath}:${sideChar}:${content}`;
    if (!trsByContent.has(occKey)) trsByContent.set(occKey, []);
    trsByContent.get(occKey).push(tr);
  }

  // Pass 2: group unmatched stored keys by content, then mark the first N available occurrences
  // (skipping rows already covered by exact matches), where N = number of unmatched keys.
  const fallbackCounts = new Map(); // occKey → number of stored keys needing fallback
  for (const [filePath, sides] of state.reviewState) {
    for (const sideChar of ['L', 'R']) {
      for (const lineKey of sides[sideChar]) {
        if (exactMatchedKeys.has(`${filePath}:${sideChar}:${lineKey}`)) continue;
        const content = lineKey.slice(lineKey.indexOf(':') + 1);
        const occKey = `${filePath}:${sideChar}:${content}`;
        fallbackCounts.set(occKey, (fallbackCounts.get(occKey) || 0) + 1);
      }
    }
  }

  for (const [occKey, count] of fallbackCounts) {
    const trs = trsByContent.get(occKey) || [];
    let marked = 0;
    for (const tr of trs) {
      if (marked >= count) break;
      if (exactMatchedTrs.has(tr)) continue;
      setLineVisualState(tr, true);
      marked++;
    }
  }
}
