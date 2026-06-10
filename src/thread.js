import { getFilePathForRow } from './dom.js';
import { getPRMeta } from './pr-meta.js';
import { htmlToMarkdown } from './markdown.js';
import { extractHunk } from './diff-hunk.js';

// "Comment on line R52" / "Comment on lines R444 to R446" → side + range.
// Returns null for headings without a line reference (file-level comments).
export function parseLineRef(text) {
  const m = text.match(/Comment on lines? ([LR])(\d+)(?: to [LR](\d+))?/);
  if (!m) return null;
  const startLine = Number(m[2]);
  return { side: m[1], startLine, endLine: m[3] ? Number(m[3]) : startLine };
}

// Assemble everything the prompt template needs from any clicked comment in a
// thread. Returns null when the surrounding thread can't be read.
export function getThreadData(commentEl) {
  const threadEl = commentEl.closest('[data-testid="review-thread"]');
  if (!threadEl) return null;
  const meta = getPRMeta();
  if (!meta) return null;

  // Inline threads render inside the file's diff table
  const file = getFilePathForRow(threadEl);

  const markerBox = threadEl.closest('[data-marker-id]') ?? threadEl.parentElement;
  const heading = markerBox?.querySelector('h2');
  const ref = heading ? parseLineRef(heading.textContent) : null;

  const comments = [];
  const commentEls = threadEl.querySelectorAll(
    '[data-marker-navigation-comment-id]:not([data-marker-navigation-thread-reply])'
  );
  for (const el of commentEls) {
    const author = el.querySelector('a[class*="AuthorName"]')?.textContent.trim();
    const body = el.querySelector('.markdown-body');
    if (!author || !body) continue;
    comments.push({ author, bodyMarkdown: htmlToMarkdown(body) });
  }
  if (comments.length === 0) return null;

  const diff = ref && file ? extractHunk(file, ref.side, ref.startLine, ref.endLine) : null;

  return {
    ...meta,
    file,
    side: ref?.side ?? null,
    startLine: ref?.startLine ?? null,
    endLine: ref?.endLine ?? null,
    comments,
    diff,
  };
}
