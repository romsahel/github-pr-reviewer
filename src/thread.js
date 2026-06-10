import { getFilePathForRow } from './dom.js';
import { getPRMeta } from './pr-meta.js';
import { htmlToMarkdown } from './markdown.js';
import { extractHunk } from './diff-hunk.js';
import { getClassicThreadData, getClassicCommentData } from './thread-classic.js';

// "Comment on line R52" / "Comment on lines R444 to R446" → side + range.
// Returns null for headings without a line reference (file-level comments).
export function parseLineRef(text) {
  const m = text.match(/Comment on lines? ([LR])(\d+)(?: to [LR](\d+))?/);
  if (!m) return null;
  const startLine = Number(m[2]);
  return { side: m[1], startLine, endLine: m[3] ? Number(m[3]) : startLine };
}

// One comment element → {author, bodyMarkdown}, or null when either part is
// missing. Shared by all extraction paths (React /changes, classic threads,
// standalone classic comments) — parameterized by selectors so none of them
// duplicates this logic.
export function extractComment(el, { authorSel, bodySel }) {
  const author = el.querySelector(authorSel)?.textContent.trim();
  const body = el.querySelector(bodySel);
  if (!author || !body) return null;
  return { author, bodyMarkdown: htmlToMarkdown(body) };
}

// Collect ordered comments from a thread container.
export function collectComments(container, { commentSel, authorSel, bodySel }) {
  const comments = [];
  for (const el of container.querySelectorAll(commentSel)) {
    const comment = extractComment(el, { authorSel, bodySel });
    if (comment) comments.push(comment);
  }
  return comments;
}

// Assemble everything the prompt template needs from any clicked comment:
// React review thread (/changes), classic review thread (Conversation tab),
// or a standalone issue-style comment (Conversation tab; copies just that
// comment). Returns null when nothing readable surrounds the element.
export function getThreadData(commentEl) {
  const reactThread = commentEl.closest('[data-testid="review-thread"]');
  const classicThread = reactThread ? null : commentEl.closest('review-thread-collapsible');
  const standaloneComment =
    reactThread || classicThread ? null : commentEl.closest('.timeline-comment-group');
  if (!reactThread && !classicThread && !standaloneComment) return null;
  const meta = getPRMeta();
  if (!meta) return null;
  const data = reactThread
    ? getReactThreadData(reactThread)
    : classicThread
      ? getClassicThreadData(classicThread)
      : getClassicCommentData(standaloneComment);
  if (!data) return null;
  return { ...meta, ...data };
}

// React /changes view: thread sits inside the file's diff table; the line ref
// lives in the closest [data-marker-id] box's h2 heading.
function getReactThreadData(threadEl) {
  const file = getFilePathForRow(threadEl);

  const markerBox = threadEl.closest('[data-marker-id]') ?? threadEl.parentElement;
  const heading = markerBox?.querySelector('h2');
  const ref = heading ? parseLineRef(heading.textContent) : null;

  const comments = collectComments(threadEl, {
    commentSel: '[data-marker-navigation-comment-id]:not([data-marker-navigation-thread-reply])',
    authorSel: 'a[class*="AuthorName"]',
    bodySel: '.markdown-body',
  });
  if (comments.length === 0) return null;

  const diff = ref && file ? extractHunk(file, ref.side, ref.startLine, ref.endLine) : null;

  return {
    file,
    side: ref?.side ?? null,
    startLine: ref?.startLine ?? null,
    endLine: ref?.endLine ?? null,
    comments,
    diff,
  };
}
