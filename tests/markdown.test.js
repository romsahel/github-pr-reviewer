import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { htmlToMarkdown } from '../src/markdown.js';

function body(html) {
  const dom = new JSDOM(`<div id="b">${html}</div>`);
  return dom.window.document.getElementById('b');
}

test('inline code', () => {
  assert.equal(htmlToMarkdown(body('<p>use <code>foo()</code> here</p>')), 'use `foo()` here');
});

test('links become markdown links', () => {
  assert.equal(htmlToMarkdown(body('<p>see <a href="https://x.dev">docs</a></p>')), 'see [docs](https://x.dev)');
});

test('@mentions stay plain text', () => {
  assert.equal(htmlToMarkdown(body('<p><a href="/u">@u</a> hi</p>')), '@u hi');
});

test('bold and italic', () => {
  assert.equal(htmlToMarkdown(body('<p><strong>b</strong> and <em>i</em></p>')), '**b** and *i*');
});

test('paragraphs separated by one blank line', () => {
  assert.equal(htmlToMarkdown(body('<p>one</p><p>two</p>')), 'one\n\ntwo');
});

test('unordered and ordered lists', () => {
  assert.equal(htmlToMarkdown(body('<ul><li>a</li><li>b</li></ul>')), '- a\n- b');
  assert.equal(htmlToMarkdown(body('<ol><li>a</li><li>b</li></ol>')), '1. a\n2. b');
});

test('code blocks become fenced blocks', () => {
  assert.equal(htmlToMarkdown(body('<pre><code>x = 1\ny = 2\n</code></pre>')), '```\nx = 1\ny = 2\n```');
});

test('blockquotes are > prefixed', () => {
  assert.equal(htmlToMarkdown(body('<blockquote><p>quoted</p></blockquote>')), '> quoted');
});

test('prettified whitespace is collapsed', () => {
  assert.equal(htmlToMarkdown(body('<p>\n  spread\n  over   lines\n</p>')), 'spread over lines');
});

test('br produces a newline', () => {
  assert.equal(htmlToMarkdown(body('<p>a<br>b</p>')), 'a\nb');
});

test('github highlight-div code blocks keep newlines and fences', () => {
  assert.equal(
    htmlToMarkdown(body('<div class="highlight highlight-source-js"><pre class="notranslate">const x = 1;\nconst y = 2;</pre></div>')),
    '```\nconst x = 1;\nconst y = 2;\n```'
  );
});

test('null root returns empty string', () => {
  assert.equal(htmlToMarkdown(null), '');
});
