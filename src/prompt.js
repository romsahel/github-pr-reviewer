// Render the fixed "Copy thread as prompt" template from a ThreadData object:
// { repo, prUrl, sourceBranch, targetBranch, file, side, startLine, endLine,
//   comments: [{ author, bodyMarkdown }], diff }
// Optional pieces (branch, file, lines, diff) are omitted when null —
// never rendered as empty values.
const INSTRUCTION = [
  'Check if the issue raised in the review thread below is valid — if so, understand the root cause and fix it.',
  "Either way, draft a short reply for me to post, then stop; I'll post it and resolve the thread.",
  "- Fixed: thank the reviewer and say it's fixed. Add one line on why it wasn't done this way originally, " +
    "if there was a reason, and one on what changed only if it isn't what they'd expect " +
    '(the comment was a question, or the fix departs from their suggestion).',
  "- Not fixed: give the reason it isn't valid or won't be fixed in this PR.",
].join('\n');

export function buildPrompt(t) {
  const lines = [INSTRUCTION, ''];
  if (t.file) {
    let where = `At ${t.file}`;
    if (t.startLine != null) {
      where +=
        t.endLine != null && t.endLine !== t.startLine
          ? `, lines ${t.startLine}-${t.endLine}`
          : `, line ${t.startLine}`;
    }
    lines.push(`${where}:`);
  }
  if (t.diff) lines.push('```diff', t.diff, '```');
  if (t.file || t.diff) lines.push('');
  for (const c of t.comments) {
    lines.push(`> **${c.author}:**`);
    for (const bodyLine of c.bodyMarkdown.split('\n')) {
      lines.push(bodyLine === '' ? '>' : `> ${bodyLine}`);
    }
    lines.push('>');
  }
  lines.push('', `PR: ${t.prUrl}`);
  if (t.sourceBranch) lines.push(`Branch: ${t.sourceBranch}`);
  return lines.join('\n') + '\n';
}
