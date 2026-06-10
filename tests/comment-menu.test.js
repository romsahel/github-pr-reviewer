import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

const window = installFixtureGlobals();
globalThis.MutationObserver = window.MutationObserver;
globalThis.KeyboardEvent = window.KeyboardEvent;

const { initCommentMenu } = await import('../src/comment-menu.js');

const tick = () => new Promise((r) => setTimeout(r, 0));

function clickKebab() {
  // Pick the kebab belonging to the gaydamakha thread (the one whose comment
  // mentions setup_block_threats_workspace) — the fixture's first kebab
  // belongs to a different thread.
  const kebab = Array.from(
    document.querySelectorAll('button[data-testid="comment-header-hamburger"]')
  ).find((k) =>
    k
      .closest('[data-marker-navigation-comment-id]')
      ?.textContent.includes('setup_block_threats_workspace')
  );
  assert.ok(kebab, 'fixture kebab not found');
  kebab.dispatchEvent(new window.Event('click', { bubbles: true }));
  return kebab;
}

function mountFakeMenu() {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.innerHTML =
    '<span role="menuitem" id="lnk"><svg class="octicon" width="16" height="16"><path d="M1 1"></path></svg><span>Copy link</span></span>' +
    '<span role="menuitem" id="tpl" aria-labelledby="lbl" href="/x">' +
    '<svg class="octicon" width="16" height="16"><path d="M2 2"></path></svg><span id="lbl">Copy markdown</span></span>' +
    '<span role="menuitem" id="del"><span>Delete</span></span>';
  document.body.appendChild(menu);
  return menu;
}

test('injects a labeled, aria-sane item once and copies the thread prompt', async () => {
  initCommentMenu();
  initCommentMenu(); // idempotent arming

  clickKebab();
  const menu = mountFakeMenu();
  await tick();

  const items = menu.querySelectorAll('[data-copy-thread-injected]');
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.textContent, 'Copy thread as prompt');
  assert.equal(item.getAttribute('aria-label'), 'Copy thread as prompt');
  assert.equal(item.hasAttribute('aria-labelledby'), false);
  assert.equal(item.hasAttribute('id'), false);

  // positioned right under "Copy markdown"
  assert.ok(
    item.previousElementSibling?.textContent.includes('Copy markdown'),
    'item should sit directly after the Copy markdown entry'
  );

  // keeps a single icon, repainted as the Octicon copy glyph (native size attrs kept)
  const icons = item.querySelectorAll('svg');
  assert.equal(icons.length, 1);
  assert.ok(icons[0].innerHTML.includes('M0 6.75'), 'icon should be the copy glyph');
  assert.equal(icons[0].getAttribute('width'), '16');

  // second mutation on the same menu must not double-inject
  menu.appendChild(document.createElement('span'));
  await tick();
  assert.equal(menu.querySelectorAll('[data-copy-thread-injected]').length, 1);

  // clicking the item copies the prompt (clipboard stubbed)
  let copied = null;
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (s) => { copied = s; } } },
    configurable: true,
  });
  item.dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(copied, 'clipboard.writeText not called');
  assert.ok(copied.startsWith('Address the following comment:\n'));
  assert.ok(copied.includes('> **gaydamakha:**'));

  // double-click safety: a second activation re-copies the SAME thread (no false error)
  copied = null;
  item.dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(copied && copied.includes('> **gaydamakha:**'), 'second activation should still copy');

  menu.remove();
});

test('no injection when no kebab was clicked', async () => {
  document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
  const menu = mountFakeMenu();
  await tick();
  assert.equal(menu.querySelectorAll('[data-copy-thread-injected]').length, 0);
  menu.remove();
});
