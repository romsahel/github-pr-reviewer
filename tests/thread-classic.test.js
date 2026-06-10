import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals('conversation');
const { getThreadData } = await import('../src/thread.js');
const { buildPrompt } = await import('../src/prompt.js');
const { clearPRMetaCache } = await import('../src/pr-meta.js');

function commentIn(text) {
  for (const el of document.querySelectorAll('.timeline-comment-group')) {
    if (el.textContent.includes(text)) return el;
  }
  return null;
}

test('assembles a classic conversation-tab review thread', () => {
  clearPRMetaCache();
  const el = commentIn('is mislabeled on Outlook');
  assert.ok(el, 'fixture comment not found');
  const t = getThreadData(el);
  assert.ok(t, 'expected thread data');
  assert.equal(t.repo, 'outlook-addin-phishing-reporter');
  assert.equal(t.prUrl, 'https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268');
  assert.equal(t.sourceBranch, 'roman/legacy-beacon-metadata');
  assert.equal(t.targetBranch, 'staging');
  assert.equal(t.file, 'index.html');
  assert.equal(t.side, 'R');
  assert.equal(t.startLine, 140);
  assert.equal(t.endLine, 140);
  assert.deepEqual(t.comments.map((c) => c.author), ['cubic-dev-ai', 'romsahel', 'cubic-dev-ai']);
  assert.ok(t.comments.some((c) => c.bodyMarkdown.includes('outlook_version')));
  assert.ok(t.diff.startsWith('@@ -0,0 +137,4 @@'));
  assert.ok(t.diff.split('\n').slice(1).every((l) => l.startsWith('+')));
});

test('standalone conversation comments yield just that comment', () => {
  clearPRMetaCache();
  const el = commentIn('monitoring functions outside');
  assert.ok(el, 'standalone comment not found');
  const t = getThreadData(el);
  assert.ok(t, 'expected single-comment thread data');
  assert.equal(t.comments.length, 1);
  assert.ok(t.comments[0].bodyMarkdown.includes('monitoring functions'));
  assert.equal(t.file, null);
  assert.equal(t.startLine, null);
  assert.equal(t.diff, null);
  assert.equal(t.repo, 'outlook-addin-phishing-reporter');
});

test('end-to-end: buildPrompt renders the classic thread', () => {
  clearPRMetaCache();
  const out = buildPrompt(getThreadData(commentIn('is mislabeled on Outlook')));
  assert.ok(out.includes('**Repository:** `outlook-addin-phishing-reporter`\n'));
  assert.ok(out.includes('**File:** `index.html`\n'));
  assert.ok(out.includes('**Line 140**\n'));
  assert.ok(out.includes('> **romsahel:**\n'));
  assert.ok(out.includes('```diff\n@@ -0,0 +137,4 @@\n'));
});

test('end-to-end: standalone comment prompt has no File/Lines/Diff sections', () => {
  clearPRMetaCache();
  const out = buildPrompt(getThreadData(commentIn('monitoring functions outside')));
  assert.ok(out.startsWith('Address the following comment:\n'));
  assert.ok(out.includes('**Pull request:** https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268\n'));
  assert.ok(out.includes('monitoring functions'));
  assert.ok(!out.includes('**File:**'));
  assert.ok(!out.includes('**Line'));
  assert.ok(!out.includes('**Diff:**'));
});

test('mixed deletion/addition mini-diff anchors the header on the last row side', async () => {
  // Synthetic classic thread: old-side deletions (L120-121) then a new-side
  // addition (R98) — header must follow the LAST row's side and never go negative.
  const host = document.createElement('div');
  host.innerHTML = `
    <review-thread-collapsible>
      <a href="/tryriot/x/pull/1/files#diff-abc">lib/example.js</a>
      <table class="diff-table">
        <tr><td class="blob-num" data-line-number="120"></td><td class="blob-num empty-cell"></td><td class="blob-code blob-code-deletion"><span class="blob-code-inner">old line A</span></td></tr>
        <tr><td class="blob-num" data-line-number="121"></td><td class="blob-num empty-cell"></td><td class="blob-code blob-code-deletion"><span class="blob-code-inner">old line B</span></td></tr>
        <tr><td class="blob-num empty-cell"></td><td class="blob-num" data-line-number="98"></td><td class="blob-code blob-code-addition"><span class="blob-code-inner">new line</span></td></tr>
      </table>
      <div class="timeline-comment-group">
        <a class="author">someone</a>
        <div class="comment-body markdown-body"><p>mixed diff comment</p></div>
      </div>
    </review-thread-collapsible>`;
  document.body.appendChild(host);
  try {
    const t = getThreadData(host.querySelector('.timeline-comment-group'));
    assert.ok(t, 'expected thread data');
    assert.equal(t.side, 'R');
    assert.equal(t.startLine, 98);
    const header = t.diff.split('\n')[0];
    assert.equal(header, '@@ -0,0 +98,1 @@');
    assert.ok(!header.includes('-21'), 'no negative counts');
    assert.equal(t.diff.split('\n').length, 4); // header + 3 rows
  } finally {
    host.remove();
    clearPRMetaCache();
  }
});
