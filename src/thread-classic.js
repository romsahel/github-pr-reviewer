import { hunkHeader } from './diff-hunk.js';
import { collectComments, extractComment } from './thread.js';

// Extractors for the Conversation tab's classic Rails timeline. Review
// threads are <review-thread-collapsible> elements embedding an old-format
// mini-diff (table.diff-table); standalone issue-style comments are bare
// .timeline-comment-group blocks. The commented range isn't exposed on this
// page, so a thread's line ref is the mini-diff's LAST row (GitHub's anchor
// line) and the diff is the mini-diff serialized verbatim.
//
// thread.js and this module import each other; both export only hoisted
// function declarations used at call time, so the cycle is safe under both
// esbuild and node's ESM loader.

const CLASSIC_COMMENT_SELECTORS = {
  authorSel: 'a.author',
  bodySel: '.comment-body.markdown-body',
};

// Returns the partial ThreadData (no PR meta — the dispatcher merges that),
// or null when the thread has no readable comments.
export function getClassicThreadData(threadEl) {
  const file = threadEl.querySelector('a[href*="/files#diff-"]')?.textContent.trim() || null;

  const comments = collectComments(threadEl, {
    commentSel: '.timeline-comment-group',
    ...CLASSIC_COMMENT_SELECTORS,
  });
  if (comments.length === 0) return null;

  // First table only: the thread's mini-diff precedes the comments;
  // suggested-changes blocks inside comments render their own tables.
  const ref = serializeMiniDiff(threadEl.querySelector('table.diff-table'));

  return {
    file,
    side: ref?.side ?? null,
    startLine: ref?.line ?? null,
    endLine: ref?.line ?? null,
    comments,
    diff: file && ref ? ref.diff : null,
  };
}

// Standalone issue-style comment (a .timeline-comment-group outside any
// review thread): copy JUST the clicked comment — no file/line/diff context
// exists for these. Returns the partial ThreadData or null.
export function getClassicCommentData(groupEl) {
  const comment = extractComment(groupEl, CLASSIC_COMMENT_SELECTORS);
  if (!comment) return null;
  return {
    file: null,
    side: null,
    startLine: null,
    endLine: null,
    comments: [comment],
    diff: null,
  };
}

// Rows are [blob-num][blob-num[data-line-number]][blob-code]; the marker is
// encoded as classes (blob-code-addition / blob-code-deletion), not a span.
// Returns { side, line, diff } from the last row, or null. The hunk header
// is anchored on the last row's side to avoid mixing numbering systems on
// mixed-side mini-diffs, which could yield negative counts.
function serializeMiniDiff(table) {
  if (!table) return null;
  const lines = [];
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    const code = tr.querySelector('td.blob-code');
    if (!code) continue;
    const numCells = tr.querySelectorAll('td.blob-num[data-line-number]');
    const num = numCells[numCells.length - 1];
    if (!num) continue;
    const marker = code.classList.contains('blob-code-deletion')
      ? '-'
      : code.classList.contains('blob-code-addition')
        ? '+'
        : ' ';
    const text = (code.querySelector('.blob-code-inner') ?? code).textContent.replace(/\n+$/, '');
    lines.push(marker + text);
    rows.push({ line: Number(num.getAttribute('data-line-number')), side: marker === '-' ? 'L' : 'R' });
  }
  if (lines.length === 0) return null;
  // Anchor the header on the last row's side: mixed-side mini-diffs would
  // otherwise mix old/new numbering and could yield negative counts.
  const last = rows[rows.length - 1];
  const first = rows.find((r) => r.side === last.side) ?? rows[0];
  const count = Math.max(1, last.line - first.line + 1);
  const diff = [hunkHeader(last.side, first.line, count), ...lines].join('\n');
  return { side: last.side, line: last.line, diff };
}
