import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

const window = installFixtureGlobals('conversation');
globalThis.MutationObserver = window.MutationObserver;
globalThis.KeyboardEvent = window.KeyboardEvent;

const { initCommentMenu } = await import('../src/comment-menu.js');

const tick = () => new Promise((r) => setTimeout(r, 0));

function classicKebab(text) {
  for (const group of document.querySelectorAll('.timeline-comment-group')) {
    if (group.textContent.includes(text)) {
      return group.querySelector('summary.timeline-comment-action');
    }
  }
  return null;
}

test('lazy details-menu gets the item when items load, and copies the classic thread', async () => {
  initCommentMenu();
  const kebab = classicKebab('is mislabeled on Outlook');
  assert.ok(kebab, 'classic kebab not found');
  const menu = kebab.parentElement.querySelector('details-menu');
  assert.ok(menu, 'details-menu not found');

  kebab.dispatchEvent(new window.Event('click', { bubbles: true }));
  // simulate the include-fragment resolving AFTER the click
  menu.innerHTML = '<button role="menuitem" class="dropdown-item">Copy link</button>';
  await tick();

  const items = menu.querySelectorAll('[data-copy-thread-injected]');
  assert.equal(items.length, 1);
  assert.equal(items[0].textContent, 'Copy thread as prompt');

  let copied = null;
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (s) => { copied = s; } } },
    configurable: true,
  });
  items[0].dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(copied, 'clipboard not written');
  assert.ok(copied.startsWith('Address the following comment:\n'));
  assert.ok(copied.includes('**File:** `index.html`'));
  assert.ok(copied.includes('```diff'));
});

test('preloaded (already populated) menu gets the item synchronously on kebab click', () => {
  const kebab = classicKebab('is mislabeled on Outlook');
  const menu = kebab.parentElement.querySelector('details-menu');
  // populated by the previous test; remove our item to simulate a fresh, preloaded menu
  menu.querySelector('[data-copy-thread-injected]')?.remove();
  kebab.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(menu.querySelectorAll('[data-copy-thread-injected]').length, 1);
});

test('standalone comment kebab copies just that comment', async () => {
  const standalone = [...document.querySelectorAll('.js-comment')].find((c) =>
    c.textContent.includes('monitoring functions outside')
  );
  const kebab = standalone?.querySelector('summary.timeline-comment-action');
  assert.ok(kebab, 'standalone kebab not found');
  const menu = kebab.parentElement.querySelector('details-menu');
  assert.ok(menu, 'standalone details-menu not found');

  kebab.dispatchEvent(new window.Event('click', { bubbles: true }));
  menu.innerHTML = '<button role="menuitem" class="dropdown-item">Copy link</button>';
  await tick();

  const items = menu.querySelectorAll('[data-copy-thread-injected]');
  assert.equal(items.length, 1);

  let copied = null;
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (s) => { copied = s; } } },
    configurable: true,
  });
  items[0].dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(copied, 'clipboard not written');
  assert.ok(copied.includes('monitoring functions'));
  assert.ok(!copied.includes('**File:**'));
  assert.ok(!copied.includes('**Diff:**'));
});
