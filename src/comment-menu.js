import { getThreadData } from './thread.js';
import { buildPrompt } from './prompt.js';
import { showToast } from './toast.js';

// React /changes kebab + classic Conversation-tab kebab
const KEBAB_SELECTOR =
  'button[data-testid="comment-header-hamburger"], summary.timeline-comment-action';

// Octicon "copy" (16x16) — painted into the cloned item's existing icon slot
// so size/color classes stay native.
const COPY_ICON_PATHS =
  '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>' +
  '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>';

let armed = false;
let pendingComment = null;

// Arm once per page session: the kebab dropdown is a React portal that only
// mounts on click, so we record which comment's kebab was clicked (capture
// phase) and inject our item when the menu appears. Document-level listeners
// survive GitHub SPA navigation — re-calling this is a no-op.
export function initCommentMenu() {
  if (armed) return;
  armed = true;
  document.addEventListener('click', onDocumentClick, true);
  new MutationObserver(onMenuMutation).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function onDocumentClick(e) {
  const kebab = e.target.closest?.(KEBAB_SELECTOR);
  if (kebab) {
    pendingComment = commentForKebab(kebab);
    // Classic <details> menus may already be populated (hover preload), in
    // which case no mutation will follow the click — inject right away.
    // Items still inside an unresolved <include-fragment> are the loading
    // skeleton (GitHub ships a static "Quote reply" fallback in there): the
    // fragment replaces its contents on load, which would take our clone
    // with it — that lazy case is covered by the observer instead.
    const menu = kebab.parentElement?.querySelector('details-menu[role="menu"]');
    const loaded =
      menu &&
      [...menu.querySelectorAll('[role="menuitem"]')].some(
        (item) => !item.closest('include-fragment')
      );
    if (pendingComment && loaded) injectMenuItem(menu);
    return;
  }
  pendingComment = null;
}

// React /changes comments carry a marker id; classic Conversation-tab
// comments (review-thread members AND standalone issue-style comments) are
// .timeline-comment-group blocks — thread.js decides whole-thread vs
// single-comment extraction from the surrounding markup.
function commentForKebab(kebab) {
  return (
    kebab.closest('[data-marker-navigation-comment-id]') ??
    kebab.closest('.timeline-comment-group')
  );
}

function onMenuMutation(mutations) {
  if (!pendingComment) return;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      // closest() covers the node being a menu, being inside one (items
      // landing in a lazy classic details-menu), or containing one (React
      // portal mount).
      const menu = node.closest?.('[role="menu"]') ?? node.querySelector?.('[role="menu"]');
      if (menu) injectMenuItem(menu);
    }
  }
}

// Clone an existing item so GitHub's hashed ActionList classes keep our entry
// visually native even when class names rotate. cloneNode copies neither
// event listeners nor React fiber expandos, so the clone is inert.
function injectMenuItem(menu) {
  if (menu.querySelector('[data-copy-thread-injected]')) {
    // Already served — also drop the pending comment so a slow-loading other
    // menu (classic include-fragment) can't pick up a stale binding later.
    pendingComment = null;
    return;
  }
  // Prefer "Copy markdown" as both the clone source and the insertion anchor
  // so our item sits right under it and inherits the closest styling.
  const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  const anchor = menuItems.find((el) => /copy markdown/i.test(el.textContent));
  const template = anchor ?? menuItems[0];
  if (!template) {
    // Nothing to clone — drop the pending comment so a later unrelated menu
    // can't receive an injection bound to a stale thread.
    console.debug('[PR Reviewer] No menu item to clone, skipping injection');
    pendingComment = null;
    return;
  }
  const comment = pendingComment;
  if (!comment) return;

  const item = template.cloneNode(true);
  item.setAttribute('data-copy-thread-injected', 'true');
  item.removeAttribute('id');
  item.removeAttribute('href');
  item.removeAttribute('aria-keyshortcuts');
  item.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href'));
  // Repaint the leading icon as the copy glyph; drop any extra svgs (e.g.
  // trailing submenu chevrons). Items without an icon slot just stay textual.
  const icon = item.querySelector('svg');
  if (icon) {
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.innerHTML = COPY_ICON_PATHS;
  }
  item.querySelectorAll('svg').forEach((svg) => {
    if (svg !== icon) svg.remove();
  });
  item.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // The clone's aria refs point at ids we just stripped — without this cleanup
  // screen readers would resolve them to the template item's spans and
  // announce the wrong label.
  for (const el of [item, ...item.querySelectorAll('[aria-labelledby], [aria-describedby]')]) {
    el.removeAttribute('aria-labelledby');
    el.removeAttribute('aria-describedby');
  }
  item.setAttribute('aria-label', 'Copy thread as prompt');
  setLabel(item, 'Copy thread as prompt');
  // Closure-bind the comment so repeated activations keep working and stale
  // clicks elsewhere can't swap the thread out from under us. Known
  // limitation: the cloned item isn't part of React's roving focus, so it's
  // mouse-only for now.
  item.addEventListener('click', (e) => onCopyClick(e, comment));

  if (anchor) anchor.after(item);
  else template.parentElement.appendChild(item);
  pendingComment = null;
}

// Walk down the chain of elements carrying the item's full text and replace
// the deepest one, leaving the ActionList layout spans intact.
function setLabel(item, text) {
  let node = item;
  for (;;) {
    const child = Array.from(node.children).find(
      (c) => c.textContent.trim() !== '' && c.textContent.trim() === node.textContent.trim()
    );
    if (!child) break;
    node = child;
  }
  node.textContent = text;
}

async function onCopyClick(e, comment) {
  e.preventDefault();
  e.stopPropagation();
  let thread = null;
  try {
    thread = comment ? getThreadData(comment) : null;
  } catch (err) {
    console.error('[PR Reviewer] Thread extraction failed', err);
  }
  if (!thread) {
    showToast("Couldn't read comment thread");
    return;
  }
  try {
    await navigator.clipboard.writeText(buildPrompt(thread));
    showToast(thread.diff ? 'Copied thread as prompt' : 'Copied (diff unavailable)');
  } catch (err) {
    console.error('[PR Reviewer] Clipboard write failed', err);
    showToast("Couldn't copy thread");
  }
  // Best effort: our clone has no React handler, so ask the menu to close
  e.target
    .closest('[role="menu"]')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}
