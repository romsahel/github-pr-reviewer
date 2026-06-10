// Render the fixed "Copy thread as prompt" template from a ThreadData object:
// { repo, prUrl, sourceBranch, targetBranch, file, side, startLine, endLine,
//   comments: [{ author, bodyMarkdown }], diff }
// Optional pieces (branches, file, lines, diff) are omitted when null —
// never rendered as empty values.
export function buildPrompt(t) {
  const lines = ['Address the following comment:'];
  lines.push(`**Repository:** \`${t.repo}\``);
  if (t.sourceBranch) {
    lines.push(`**Source branch:** \`${t.sourceBranch}\``);
    lines.push(`Use \`${t.sourceBranch}\` as the working branch when possible.`);
  }
  if (t.targetBranch) lines.push(`**Target branch:** \`${t.targetBranch}\``);
  lines.push(`**Pull request:** ${t.prUrl}`);
  if (t.file) lines.push(`**File:** \`${t.file}\``);
  if (t.startLine != null) {
    lines.push(
      t.endLine != null && t.endLine !== t.startLine
        ? `**Lines ${t.startLine}-${t.endLine}**`
        : `**Line ${t.startLine}**`
    );
  }
  lines.push('', '**Comment thread:**', '');
  for (const c of t.comments) {
    lines.push(`> **${c.author}:**`);
    for (const bodyLine of c.bodyMarkdown.split('\n')) {
      lines.push(bodyLine === '' ? '>' : `> ${bodyLine}`);
    }
    lines.push('>');
  }
  if (t.diff) lines.push('', '**Diff:**', '', '```diff', t.diff, '```');
  return lines.join('\n') + '\n';
}
