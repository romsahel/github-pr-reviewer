import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals();
// Dynamic import AFTER globals: src/state.js reads location.href at import time
const { findBranches, getPRMeta, clearPRMetaCache } = await import('../src/pr-meta.js');
const { state } = await import('../src/state.js');

test('findBranches finds nested head/base branches', () => {
  const payload = { x: [{ y: { headBranch: 'feat/a', baseBranch: 'main', other: 1 } }] };
  assert.deepEqual(findBranches(payload), { sourceBranch: 'feat/a', targetBranch: 'main' });
  assert.equal(findBranches({ nothing: 'here' }), null);
});

test('getPRMeta reads the fixture embedded JSON', () => {
  clearPRMetaCache();
  const meta = getPRMeta();
  assert.equal(meta.owner, 'tryriot');
  assert.equal(meta.repo, 'parrot');
  assert.equal(meta.prUrl, 'https://github.com/tryriot/parrot/pull/16643');
  assert.equal(meta.sourceBranch, 'roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts');
  assert.equal(meta.targetBranch, 'staging');
});

test('getPRMeta caches on state and clearPRMetaCache resets', () => {
  clearPRMetaCache();
  assert.equal(state.prMeta, null);
  const meta = getPRMeta();
  assert.equal(state.prMeta, meta);
  assert.equal(getPRMeta(), meta);
  clearPRMetaCache();
  assert.equal(state.prMeta, null);
});

test('falls back to header BranchName anchors when embedded JSON is absent', () => {
  clearPRMetaCache();
  const scripts = document.querySelectorAll(
    'script[type="application/json"][data-target="react-app.embeddedData"],' +
      'script[type="application/json"][data-target="react-partial.embeddedData"]'
  );
  const saved = Array.from(scripts, (s) => [s, s.textContent]);
  for (const [s] of saved) s.textContent = '{}';
  try {
    const meta = getPRMeta();
    assert.equal(meta.sourceBranch, 'roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts');
    assert.equal(meta.targetBranch, 'staging');
  } finally {
    for (const [s, text] of saved) s.textContent = text;
    clearPRMetaCache();
  }
});

test('does not cache when branches are unresolved', () => {
  clearPRMetaCache();
  const nodes = document.querySelectorAll(
    'script[type="application/json"][data-target="react-app.embeddedData"],' +
      'script[type="application/json"][data-target="react-partial.embeddedData"],' +
      'a[data-component="BranchName"]'
  );
  const saved = Array.from(nodes, (n) => [n, n.parentNode, n.nextSibling]);
  for (const [n] of saved) n.remove();
  try {
    const meta = getPRMeta();
    assert.equal(meta.sourceBranch, null);
    assert.equal(state.prMeta, null); // unresolved result must not be cached
  } finally {
    for (const [n, parent, next] of saved) parent.insertBefore(n, next);
    clearPRMetaCache();
  }
});
