import { state } from './state.js';
import { getSideChar, getLineKey, getFilePathForRow, isEmptyLine, isEmptyRow } from './dom.js';

// When a row is marked reviewed, visually mark any consecutive blank rows immediately above it.
function propagateReviewedAbove(tr) {
  let prev = tr.previousElementSibling;
  while (prev && prev.classList.contains('diff-line-row')) {
    if (!isEmptyRow(prev)) break;
    prev.classList.add('pr-line-reviewed');
    prev = prev.previousElementSibling;
  }
}

// Line-number cells in a row that can be reviewed (non-neutral, non-blank).
// A unified-view row has one; a split-view row pairing a deletion with an addition has two.
export function markableCells(tr) {
  return Array.from(tr.querySelectorAll('td.new-diff-line-number[data-line-number]:not(.diff-line-number-neutral)'))
    .filter(td => !isEmptyLine(td));
}

// A side is marked on its own cells (line number + code cell) so a split-view row can show
// one side reviewed and the other not. The row is reviewed only once every side is.
export function setLineVisualState(td, isReviewed) {
  const tr = td.closest('tr');
  if (!tr) return;
  for (const cell of [td, td.nextElementSibling]) {
    if (cell) cell.classList.toggle('pr-side-reviewed', isReviewed);
  }
  const cells = markableCells(tr);
  if (cells.length > 0 && cells.every(c => c.classList.contains('pr-side-reviewed'))) {
    tr.classList.add('pr-line-reviewed');
    propagateReviewedAbove(tr);
  } else {
    tr.classList.remove('pr-line-reviewed');
  }
}

export function applyStateToDOM() {
  const cells = document.querySelectorAll('td.new-diff-line-number[data-line-number]');

  const exactMatchedKeys = new Set();  // `${filePath}:${sideChar}:${lineKey}`
  const exactMatchedTds = new Set();   // cells already marked via exact match
  const tdsByContent = new Map();      // `${filePath}:${sideChar}:${content}` → td[] (DOM order)

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
      setLineVisualState(td, true);
      exactMatchedKeys.add(`${filePath}:${sideChar}:${lineKey}`);
      exactMatchedTds.add(td);
    }

    // Build per-content DOM occurrence list for pass 2 fallback
    const content = lineKey.slice(lineKey.indexOf(':') + 1);
    const occKey = `${filePath}:${sideChar}:${content}`;
    if (!tdsByContent.has(occKey)) tdsByContent.set(occKey, []);
    tdsByContent.get(occKey).push(td);
  }

  // Pass 2: group unmatched stored keys by content, then mark the first N available occurrences
  // (skipping cells already covered by exact matches), where N = number of unmatched keys.
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
    const tds = tdsByContent.get(occKey) || [];
    let marked = 0;
    for (const td of tds) {
      if (marked >= count) break;
      if (exactMatchedTds.has(td)) continue;
      setLineVisualState(td, true);
      marked++;
    }
  }
}
