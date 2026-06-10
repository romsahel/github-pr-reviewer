import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals();
const { parseLineRef, getThreadData } = await import('../src/thread.js');
const { buildPrompt } = await import('../src/prompt.js');
const { clearPRMetaCache } = await import('../src/pr-meta.js');

function findFixtureComment() {
  for (const el of document.querySelectorAll('[data-marker-navigation-comment-id]')) {
    if (el.textContent.includes('setup_block_threats_workspace')) return el;
  }
  return null;
}

test('parseLineRef parses single lines, ranges, and sides', () => {
  assert.deepEqual(parseLineRef('Comment on line R52'), { side: 'R', startLine: 52, endLine: 52 });
  assert.deepEqual(parseLineRef('Comment on lines R444 to R446'), { side: 'R', startLine: 444, endLine: 446 });
  assert.deepEqual(parseLineRef('Comment on lines L10 to L12'), { side: 'L', startLine: 10, endLine: 12 });
  assert.equal(parseLineRef('Some unrelated heading'), null);
});

test('getThreadData assembles the fixture R444-446 thread', () => {
  clearPRMetaCache();
  const el = findFixtureComment();
  assert.ok(el, 'fixture comment not found');
  const t = getThreadData(el);
  assert.ok(t, 'expected thread data');
  assert.equal(t.file, 'test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs');
  assert.equal(t.side, 'R');
  assert.equal(t.startLine, 444);
  assert.equal(t.endLine, 446);
  assert.deepEqual(t.comments.map((c) => c.author), ['gaydamakha', 'roamdam']);
  assert.ok(t.comments[0].bodyMarkdown.includes('setup_block_threats_workspace'));
  assert.ok(t.comments[1].bodyMarkdown.includes('ai_labeling_preference'));
  assert.equal(t.sourceBranch, 'roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts');
  assert.equal(t.targetBranch, 'staging');
  assert.ok(t.diff.startsWith('@@ -0,0 +441,6 @@'));
});

test('end-to-end: buildPrompt renders the fixture thread', () => {
  clearPRMetaCache();
  const out = buildPrompt(getThreadData(findFixtureComment()));
  assert.ok(out.startsWith('Address the following comment:\n'));
  assert.ok(out.includes('**Repository:** `parrot`\n'));
  assert.ok(out.includes('**Lines 444-446**\n'));
  assert.ok(out.includes('> **gaydamakha:**\n'));
  assert.ok(out.includes('```diff\n@@ -0,0 +441,6 @@\n'));
});
