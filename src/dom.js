export function parsePRFromURL(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], prNumber: m[3] };
}

export function getFilePathForRow(tr) {
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

export function getSideChar(td) {
  const side = td.getAttribute('data-diff-side');
  if (side === 'right') return 'R';
  if (side === 'left') return 'L';
  // Fallback: if no side attribute, treat as right (new file)
  return 'R';
}

export function getLineContent(td) {
  return td.nextElementSibling?.textContent ?? null;
}

export function isEmptyLine(td) {
  const codeCell = td.nextElementSibling;
  if (!codeCell) return false;
  // New GitHub format: actual content lives in .diff-text-inner (the +/- marker is a sibling span)
  const inner = codeCell.querySelector('.diff-text-inner');
  if (inner) return inner.textContent === '';
  // Old GitHub format: strip .blob-code-marker then check for whitespace
  const marker = codeCell.querySelector('.blob-code-marker');
  const text = codeCell.textContent;
  return (marker ? text.slice(marker.textContent.length) : text).trim() === '';
}

export function isEmptyRow(tr) {
  const tds = tr.querySelectorAll('td.new-diff-line-number[data-line-number]:not(.diff-line-number-neutral)');
  if (tds.length === 0) return false;
  return Array.from(tds).every(isEmptyLine);
}

export function findTableByFilePath(filePath) {
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
export function tableForFilePath(filePath) {
  const label = 'Diff for: ' + filePath;
  // Search all tables with data-diff-anchor attribute
  const tables = document.querySelectorAll('table[data-diff-anchor]');
  for (const t of tables) {
    if (t.getAttribute('aria-label') === label) return t;
  }
  return findTableByFilePath(filePath);
}
