import { state } from './state.js';
import { getFilePathForRow, getSideChar, getLineContent } from './dom.js';
import { getOrCreateFileSides, scheduleSave } from './storage.js';
import { setLineVisualState } from './visual.js';
import { updateFileProgress } from './progress.js';

function handleLineNumberClick(event) {
  const td = event.currentTarget;
  const content = getLineContent(td);
  if (content === null) return;

  const tr = td.closest('tr');
  if (!tr) return;

  // Skip hunk header rows
  if (tr.querySelector('td.diff-hunk-cell')) return;

  const filePath = getFilePathForRow(tr);
  if (!filePath) return;

  const side = getSideChar(td);
  const sides = getOrCreateFileSides(filePath);
  const isNowReviewed = !sides[side].has(content);

  if (isNowReviewed) {
    sides[side].add(content);
  } else {
    sides[side].delete(content);
  }

  setLineVisualState(tr, isNowReviewed);
  updateFileProgress(filePath);
  scheduleSave();
}

export function bindLineNumberClicks(root) {
  root = root || document;
  const cells = root.querySelectorAll('td.new-diff-line-number[data-line-number]');
  for (const td of cells) {
    if (td.dataset.reviewerBound === '1') continue;
    td.dataset.reviewerBound = '1';
    td.addEventListener('click', handleLineNumberClick);
    td.addEventListener('mouseenter', () => { state.lastHoveredTd = td; });

    // Bind the whole row so hovering anywhere on it updates lastHoveredTd
    const tr = td.closest('tr');
    if (tr && !tr.dataset.reviewerRowBound) {
      tr.dataset.reviewerRowBound = '1';
      tr.addEventListener('mouseenter', () => {
        const preferredTd =
          tr.querySelector('td.new-diff-line-number[data-diff-side="right"][data-line-number]') ||
          tr.querySelector('td.new-diff-line-number[data-line-number]');
        if (preferredTd) state.lastHoveredTd = preferredTd;
      });
    }
  }
}
