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
  assert.ok(out.startsWith('Check if the issue raised in the review thread below is valid'));
  assert.ok(out.includes("draft a reply with the reason and stop; I'll post it and resolve the thread.\n"));
  assert.ok(out.includes('\nAt test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs, lines 444-446:\n```diff\n@@ -0,0 +441,6 @@\n+      workspace: workspace,'));
  assert.ok(out.includes('> **gaydamakha:**\n> Nit: You could import'));
  assert.ok(out.includes('> **roamdam:**\n> Confirmed,'));
  assert.ok(out.endsWith('\nPR: https://github.com/tryriot/parrot/pull/16643\nBranch: roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts\n'));
  assert.ok(!out.includes('staging'));
});

test('single line renders ", line N:"', () => {
  const out = buildPrompt({ ...thread, startLine: 52, endLine: 52 });
  assert.ok(out.includes('_test.exs, line 52:\n'));
});

test('file-level comment omits the line', () => {
  const out = buildPrompt({ ...thread, startLine: null, endLine: null });
  assert.ok(out.includes('_test.exs:\n'));
  assert.ok(!out.includes(', line'));
});

test('missing diff omits the diff block', () => {
  const out = buildPrompt({ ...thread, diff: null });
  assert.ok(!out.includes('```diff'));
});

test('missing source branch omits the Branch line', () => {
  const out = buildPrompt({ ...thread, sourceBranch: null });
  assert.ok(!out.includes('Branch:'));
});

test('multi-line bodies are quote-prefixed; blank lines become bare >', () => {
  const out = buildPrompt({ ...thread, comments: [{ author: 'a', bodyMarkdown: 'first\n\nsecond' }], diff: null });
  assert.ok(out.includes('> **a:**\n> first\n>\n> second\n>'));
});
