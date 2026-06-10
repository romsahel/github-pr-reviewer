import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/prompt.js';

const thread = {
  repo: 'parrot',
  prUrl: 'https://github.com/tryriot/parrot/pull/16643',
  sourceBranch: 'roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts',
  targetBranch: 'staging',
  file: 'test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs',
  side: 'R',
  startLine: 444,
  endLine: 446,
  comments: [
    { author: 'gaydamakha', bodyMarkdown: 'Nit: You could import a setup helper `setup_block_threats_workspace` from @test/support/inbound_protections_test_helpers.ex and use it instead' },
    { author: 'roamdam', bodyMarkdown: 'Confirmed, it also provides a tag on `ai_labeling_preference` if I remember correctly' },
  ],
  diff: '@@ -0,0 +441,6 @@\n+      workspace: workspace,\n+      employee: employee\n+    } do\n+      workspace.inbox_settings',
};

test('buildPrompt renders the full template', () => {
  const out = buildPrompt(thread);
  assert.ok(out.startsWith('Address the following comment:\n'));
  assert.ok(out.includes('**Repository:** `parrot`\n'));
  assert.ok(out.includes('**Source branch:** `roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts`\n'));
  assert.ok(out.includes('Use `roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts` as the working branch when possible.\n'));
  assert.ok(out.includes('**Target branch:** `staging`\n'));
  assert.ok(out.includes('**Pull request:** https://github.com/tryriot/parrot/pull/16643\n'));
  assert.ok(out.includes('**File:** `test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs`\n'));
  assert.ok(out.includes('**Lines 444-446**\n'));
  assert.ok(out.includes('**Comment thread:**\n\n> **gaydamakha:**\n> Nit: You could import'));
  assert.ok(out.includes('> **roamdam:**\n> Confirmed,'));
  assert.ok(out.includes('**Diff:**\n\n```diff\n@@ -0,0 +441,6 @@\n+      workspace: workspace,'));
  assert.ok(out.endsWith('```\n'));
});

test('single line renders **Line N**', () => {
  const out = buildPrompt({ ...thread, startLine: 52, endLine: 52 });
  assert.ok(out.includes('**Line 52**\n'));
  assert.ok(!out.includes('**Lines'));
});

test('file-level comment omits the Lines line', () => {
  const out = buildPrompt({ ...thread, startLine: null, endLine: null });
  assert.ok(!out.includes('**Line'));
});

test('missing diff omits the Diff section', () => {
  const out = buildPrompt({ ...thread, diff: null });
  assert.ok(!out.includes('**Diff:**'));
  assert.ok(!out.includes('```diff'));
});

test('missing branches omit branch lines', () => {
  const out = buildPrompt({ ...thread, sourceBranch: null, targetBranch: null });
  assert.ok(!out.includes('**Source branch:**'));
  assert.ok(!out.includes('**Target branch:**'));
  assert.ok(!out.includes('working branch'));
});

test('multi-line bodies are quote-prefixed; blank lines become bare >', () => {
  const out = buildPrompt({ ...thread, comments: [{ author: 'a', bodyMarkdown: 'first\n\nsecond' }], diff: null });
  assert.ok(out.includes('> **a:**\n> first\n>\n> second\n>'));
});
