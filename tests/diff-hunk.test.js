import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals();
const { extractHunk } = await import('../src/diff-hunk.js');

const FILE = 'test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs';

test('extractHunk returns the 3-context window for R444-446', () => {
  const diff = extractHunk(FILE, 'R', 444, 446);
  assert.ok(diff, 'expected a diff string');
  const lines = diff.split('\n');
  assert.equal(lines[0], '@@ -0,0 +441,6 @@');
  assert.equal(lines.length, 7); // header + lines 441..446, all additions
  assert.ok(lines.slice(1).every((l) => l.startsWith('+')));
  assert.ok(diff.includes('+      workspace: workspace,'));
  assert.ok(diff.includes('inbox_settings'));
});

test('single-line comment window', () => {
  const diff = extractHunk(FILE, 'R', 444, 444);
  assert.ok(diff.startsWith('@@ -0,0 +441,4 @@'));
  assert.equal(diff.split('\n').length, 5); // header + 441..444
});

test('returns null for an unknown file', () => {
  assert.equal(extractHunk('does/not/exist.ex', 'R', 1, 2), null);
});

test('returns null for lines not in the diff', () => {
  assert.equal(extractHunk(FILE, 'R', 999999, 999999), null);
});

const ALERT_FILE = 'lib/parrot/inbox/inbox_emails/alerts/email_alert_reporter.ex';

test('split-view context lines are emitted exactly once', () => {
  // R119-120 are split context rows (left+right code cells with identical
  // text); R121-122 are additions. Verified against the fixture DOM.
  const diff = extractHunk(ALERT_FILE, 'R', 122, 122);
  assert.equal(
    diff,
    '@@ -0,0 +119,4 @@\n' +
      '   end\n' +
      ' \n' +
      '+  @doc """\n' +
      "+  Builds the analysis attributes that make a report inherit an alert's",
  );
});

test('header count clamps to the startLine window when endLine row is missing', () => {
  const diff = extractHunk(FILE, 'R', 444, 999999);
  assert.ok(diff, 'expected a diff string');
  assert.ok(diff.startsWith('@@ -0,0 +441,4 @@'), `unexpected header: ${diff.split('\n')[0]}`);
  assert.ok(!diff.includes('999'));
});

test('L-side header puts numbers in the minus slot', () => {
  const diff = extractHunk(ALERT_FILE, 'L', 119, 119);
  assert.ok(diff, 'expected a diff string');
  assert.match(diff.split('\n')[0], /^@@ -\d+,\d+ \+0,0 @@$/);
});

test('returns null for non-integer line numbers', () => {
  assert.equal(extractHunk(FILE, 'R', 1.5, 2), null);
  assert.equal(extractHunk(FILE, 'R', 1, NaN), null);
});
