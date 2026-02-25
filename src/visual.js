import { state } from './state.js';
import { getSideChar, getLineContent, getFilePathForRow, isEmptyRow } from './dom.js';

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
  for (const td of cells) {
    const tr = td.closest('tr');
    if (!tr || tr.querySelector('td.diff-hunk-cell')) continue;
    const filePath = getFilePathForRow(tr);
    if (!filePath) continue;
    const sides = state.reviewState.get(filePath);
    if (!sides) continue;
    const content = getLineContent(td);
    if (content !== null && sides[getSideChar(td)].has(content)) {
      setLineVisualState(tr, true);
    }
  }
}
