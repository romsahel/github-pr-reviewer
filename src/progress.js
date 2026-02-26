import { state } from './state.js';
import { tableForFilePath, getSideChar, getLineKey, isEmptyLine } from './dom.js';

export function updateFileProgress(filePath) {
  const table = tableForFilePath(filePath);
  if (!table) return;

  // Count total unique (side, lineNumber) pairs visible in DOM, and reviewed ones by content
  const cells = table.querySelectorAll('td.new-diff-line-number[data-line-number]:not(.diff-line-number-neutral)');
  const sides = state.reviewState.get(filePath) || { L: new Set(), R: new Set() };
  const seen = new Set();
  let totalLines = 0, reviewedCount = 0;
  for (const td of cells) {
    if (isEmptyLine(td)) continue;
    const key = td.getAttribute('data-diff-side') + ':' + td.getAttribute('data-line-number');
    if (seen.has(key)) continue;
    seen.add(key);
    totalLines++;
    const lineKey = getLineKey(td);
    if (lineKey !== null && sides[getSideChar(td)].has(lineKey)) reviewedCount++;
  }

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
    const viewedBtn = region && region.querySelector('button[aria-label="Not Viewed"]');
    if (viewedBtn) viewedBtn.click();
  } else if (reviewedCount > 0) {
    badge.className = 'pr-reviewer-progress partial';
  } else {
    badge.className = 'pr-reviewer-progress empty';
  }
}

export function updateAllFileProgress() {
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
