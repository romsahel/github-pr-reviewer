import { tableForFilePath } from './dom.js';

// Rendered context lines included above the commented range.
const CONTEXT_ABOVE = 3;

// Synthesized hunk header: only the commented side's numbers are computed —
// this is prompt context, not an applyable patch. Shared with the classic
// (Conversation tab) mini-diff serializer in src/thread-classic.js.
export function hunkHeader(side, firstLine, count) {
  return side === 'L' ? `@@ -${firstLine},${count} +0,0 @@` : `@@ -0,0 +${firstLine},${count} @@`;
}

// Serialize the diff window around a commented line range: up to CONTEXT_ABOVE
// rendered lines above startLine, through endLine. The header is synthesized
// (left-side numbers are not computed — this is prompt context, not a patch).
// Returns null when the table or the commented rows aren't in the DOM.
export function extractHunk(filePath, side, startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;
  const table = tableForFilePath(filePath);
  if (!table) return null;
  const sideAttr = side === 'L' ? 'left' : 'right';

  const rowFor = (n) =>
    table
      .querySelector(`td.new-diff-line-number[data-line-number="${n}"][data-diff-side="${sideAttr}"]`)
      ?.closest('tr');

  let firstRow = null;
  let firstLine = null;
  for (let n = Math.max(1, startLine - CONTEXT_ABOVE); n <= startLine && !firstRow; n++) {
    firstRow = rowFor(n);
    firstLine = n;
  }
  const endRow = rowFor(endLine);
  const lastRow = endRow ?? rowFor(startLine);
  if (!firstRow || !lastRow) return null;
  const lastLine = endRow ? endLine : startLine;

  const rows = Array.from(table.querySelectorAll('tr'));
  const from = rows.indexOf(firstRow);
  const to = rows.indexOf(lastRow);
  if (from === -1 || to < from) return null;

  const lines = [];
  for (let i = from; i <= to; i++) lines.push(...serializeRow(rows[i], sideAttr));
  if (lines.length === 0) return null;

  // Count covers the commented side's window; interleaved opposite-side
  // changes are extra.
  const header = hunkHeader(side, firstLine, lastLine - firstLine + 1);
  return [header, ...lines].join('\n');
}

// In split view a context row has TWO distinct code cells (left and right)
// with identical text, so we emit only the requested side's cell. Cells from
// the opposite side are kept only when they are changed lines ('-' for
// right-side requests, '+' for left), so interleaved deletions/additions
// still appear without duplicating context. Unified rows carry one number
// cell per code cell and fall out of the same rule unchanged.
function serializeRow(tr, sideAttr) {
  const lines = [];
  for (const td of tr.querySelectorAll('td.new-diff-line-number[data-line-number]')) {
    const code = td.nextElementSibling;
    if (!code || !code.classList.contains('diff-text-cell')) continue;
    if (code.classList.contains('hunk')) continue;
    const marker = code.querySelector('.diff-text-marker')?.textContent || ' ';
    if (td.getAttribute('data-diff-side') !== sideAttr) {
      const wanted = sideAttr === 'right' ? '-' : '+';
      if (marker !== wanted) continue;
    }
    const text = code.querySelector('.diff-text-inner')?.textContent ?? '';
    lines.push(marker + text);
  }
  return lines;
}
