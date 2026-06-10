# Copy Thread as Prompt — Conversation Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Copy thread as prompt" kebab action work on the PR Conversation tab's classic-timeline review threads, reusing the existing prompt pipeline with zero duplication.

**Architecture:** One new extractor (`src/thread-classic.js`) reads the classic `review-thread-collapsible` markup (file from header link, line/side/diff from the embedded mini-diff); `src/thread.js` dispatches on thread type; `src/comment-menu.js` extends kebab detection and menu-mutation matching to cover lazy `details-menu` dropdowns. `prompt.js` / `markdown.js` / `pr-meta.js` / `toast.js` are untouched.

**Tech Stack:** Firefox WebExtension MV2, vanilla ES modules, esbuild, `node --test` + jsdom against saved-page fixtures.

**Spec:** `docs/superpowers/specs/2026-06-10-copy-thread-conversation-tab-design.md`

**Environment note:** node/npm are mise-managed. If `npm` is off PATH: `export PATH="$HOME/.local/share/mise/shims:$PATH"`. Never edit or commit `content-script.js` (generated + gitignored). Branch: `feat/copy-thread-conversation-tab`.

---

## Verified DOM facts (fixture `pr-conversation-with-comments.html`, outlook-addin-phishing-reporter#268)

- Thread wrapper: `<review-thread-collapsible class="review-thread-component js-comment-container …">`; standalone comments live outside it (in `.js-comment.js-updatable-content` timeline items).
- File path = header link `a[href*="/files#diff-"]` **text** (`index.html`). No line info anywhere except the mini-diff.
- Mini-diff: `table.diff-table` rows `[td.blob-num][td.blob-num[data-line-number]][td.blob-code]`; marker encoded as classes (`blob-code-addition` / `blob-code-deletion`); text in `.blob-code-inner` (read `textContent`).
- Comments: `.timeline-comment-group` per comment; author `a.author`; body `.comment-body.markdown-body`.
- Kebab: `summary.timeline-comment-action` + sibling `<details-menu role="menu" src=…>` that exists upfront but lazy-loads items (`include-fragment`); items carry `role="menuitem"` once loaded; menus may also be **preloaded** (populated before the click via hover preload).
- Two rendered threads: lines 60–63 (1 comment, `romsahel`) and lines 137–140 (3 comments, `cubic-dev-ai`, `romsahel`, `cubic-dev-ai`). The "outlook_version is mislabeled" comment is believed to be in the 137–140 thread — **the implementer must verify with a probe before pinning line-number assertions** (semantics are fixed: startLine=endLine=last row, header from first row; only the literal numbers may need correcting).
- Branches in embedded JSON: `roman/legacy-beacon-metadata` → `staging`. Repo `outlook-addin-phishing-reporter`, owner `tryriot`, PR 268.

---

### Task 1: Fixture + shared helpers (refactor, no behavior change)

**Goal:** Commit the conversation-tab fixture, parameterize the fixture helper, and extract the shared `hunkHeader` and `collectComments` helpers the classic extractor will reuse.

**Files:**
- Modify: `.gitignore` (ignore `pr-conversation-with-comments_files/`)
- Commit: `pr-conversation-with-comments.html` (untracked fixture at repo root — do NOT modify it)
- Delete: `probe-conv.mjs` (throwaway exploration script)
- Modify: `tests/helpers/fixture.js` (named fixtures)
- Modify: `src/diff-hunk.js` (extract + export `hunkHeader`)
- Modify: `src/thread.js` (extract + export `collectComments`)
- Modify: `tests/diff-hunk.test.js` (hunkHeader unit test)

**Acceptance Criteria:**
- [ ] `npm test` → all 36 existing tests still pass plus 1 new (37 total)
- [ ] `installFixtureGlobals()` (no args) behaves exactly as before; `installFixtureGlobals('conversation')` loads the new fixture with URL `https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268`
- [ ] `extractHunk` output unchanged (existing diff-hunk tests green); `hunkHeader('R', 441, 6)` → `@@ -0,0 +441,6 @@`, `hunkHeader('L', 118, 2)` → `@@ -118,2 +0,0 @@`
- [ ] React path of `getThreadData` unchanged (existing thread tests green) with comment collection now going through `collectComments`

**Verify:** `npm test` → 37/37 pass

**Steps:**

- [ ] **Step 1: Fixture housekeeping**

Append `pr-conversation-with-comments_files/` on its own line to `.gitignore`. Then:

```bash
rm -f probe-conv.mjs
git add .gitignore
git add -f pr-conversation-with-comments.html
```

- [ ] **Step 2: Rewrite `tests/helpers/fixture.js`** with EXACTLY:

```js
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const FIXTURES = {
  // /changes tab of tryriot/parrot#16643 (React diff view)
  changes: {
    file: '../../pr-with-comments.html',
    url: 'https://github.com/tryriot/parrot/pull/16643/changes',
  },
  // Conversation tab of tryriot/outlook-addin-phishing-reporter#268 (classic timeline)
  conversation: {
    file: '../../pr-conversation-with-comments.html',
    url: 'https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268',
  },
};

// Parse a saved PR page and install the browser globals src/ modules use.
// Call this BEFORE importing src modules — src/state.js reads location.href
// at import time, so use dynamic import() in tests after calling this.
export function installFixtureGlobals(name = 'changes') {
  const { file, url } = FIXTURES[name];
  const html = readFileSync(new URL(file, import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  return dom.window;
}
```

- [ ] **Step 3: Write the failing hunkHeader test.** In `tests/diff-hunk.test.js`, add `hunkHeader` to the dynamic import line:

```js
const { extractHunk, hunkHeader } = await import('../src/diff-hunk.js');
```

and append:

```js
test('hunkHeader formats both sides', () => {
  assert.equal(hunkHeader('R', 441, 6), '@@ -0,0 +441,6 @@');
  assert.equal(hunkHeader('L', 118, 2), '@@ -118,2 +0,0 @@');
});
```

Run: `npm test` → the new test FAILS (`hunkHeader is not a function`); everything else green.

- [ ] **Step 4: Extract `hunkHeader` in `src/diff-hunk.js`.** Add the exported helper above `extractHunk`:

```js
// Synthesized hunk header: only the commented side's numbers are computed —
// this is prompt context, not an applyable patch. Shared with the classic
// (Conversation tab) mini-diff serializer in src/thread-classic.js.
export function hunkHeader(side, firstLine, count) {
  return side === 'L' ? `@@ -${firstLine},${count} +0,0 @@` : `@@ -0,0 +${firstLine},${count} @@`;
}
```

In `extractHunk`, replace:

```js
  const count = lastLine - firstLine + 1;
  const header =
    side === 'L' ? `@@ -${firstLine},${count} +0,0 @@` : `@@ -0,0 +${firstLine},${count} @@`;
```

with:

```js
  const header = hunkHeader(side, firstLine, lastLine - firstLine + 1);
```

(Keep the `// Count covers the commented side's window…` comment above it.)

- [ ] **Step 5: Extract `extractComment` + `collectComments` in `src/thread.js`.** Add the exported helpers above `getThreadData`:

```js
// One comment element → {author, bodyMarkdown}, or null when either part is
// missing. Shared by all extraction paths (React /changes, classic threads,
// standalone classic comments) — parameterized by selectors so none of them
// duplicates this logic.
export function extractComment(el, { authorSel, bodySel }) {
  const author = el.querySelector(authorSel)?.textContent.trim();
  const body = el.querySelector(bodySel);
  if (!author || !body) return null;
  return { author, bodyMarkdown: htmlToMarkdown(body) };
}

// Collect ordered comments from a thread container.
export function collectComments(container, { commentSel, authorSel, bodySel }) {
  const comments = [];
  for (const el of container.querySelectorAll(commentSel)) {
    const comment = extractComment(el, { authorSel, bodySel });
    if (comment) comments.push(comment);
  }
  return comments;
}
```

Replace the inline loop in `getThreadData` (the `const comments = []; … for (const el of commentEls) { … }` block) with:

```js
  const comments = collectComments(threadEl, {
    commentSel: '[data-marker-navigation-comment-id]:not([data-marker-navigation-thread-reply])',
    authorSel: 'a[class*="AuthorName"]',
    bodySel: '.markdown-body',
  });
```

(The `if (comments.length === 0) return null;` line stays.)

- [ ] **Step 6: Verify and commit**

Run: `npm test`
Expected: 37/37 pass (36 existing + hunkHeader).

```bash
git add tests/helpers/fixture.js src/diff-hunk.js src/thread.js tests/diff-hunk.test.js .gitignore
git commit -m "refactor: shared hunkHeader/collectComments helpers + conversation-tab fixture"
```

(`pr-conversation-with-comments.html` was staged in Step 1 and lands in this commit.)

---

### Task 2: `src/thread-classic.js` + dispatch in `src/thread.js`

**Goal:** Extract ThreadData from classic Conversation-tab review threads AND standalone issue-style comments, routing `getThreadData` between the three worlds.

**Files:**
- Create: `src/thread-classic.js`
- Modify: `src/thread.js` (dispatch)
- Test: `tests/thread-classic.test.js`

**Acceptance Criteria:**
- [ ] `getThreadData` on the fixture's "outlook_version" comment returns repo `outlook-addin-phishing-reporter`, branches `roman/legacy-beacon-metadata`→`staging`, file `index.html`, side `R`, `startLine === endLine ===` the thread's last mini-diff row, 3 comments (`cubic-dev-ai`, `romsahel`, `cubic-dev-ai`), and a diff whose header starts at the first mini-diff row with all `+` lines
- [ ] The standalone "monitoring functions" comment yields ThreadData with exactly ONE comment and `file`/`side`/`startLine`/`endLine`/`diff` all null
- [ ] Full-pipeline `buildPrompt` renders `**Line N**` + ```diff fence for the thread, and renders NO File/Lines/Diff sections for the standalone comment
- [ ] React path untouched: all existing tests green

**Verify:** `npm test` → 41/41 pass

**Steps:**

- [ ] **Step 1: Probe the fixture to pin ground truth.** Before writing assertions, run a throwaway probe (delete after) confirming WHICH thread holds the "is mislabeled on Outlook" comment and its mini-diff line numbers:

```bash
node --input-type=module -e "
import { installFixtureGlobals } from './tests/helpers/fixture.js';
installFixtureGlobals('conversation');
for (const t of document.querySelectorAll('review-thread-collapsible')) {
  if (!t.textContent.includes('is mislabeled on Outlook')) continue;
  const nums = [...t.querySelectorAll('td.blob-num[data-line-number]')].map((n) => n.getAttribute('data-line-number'));
  console.log('lines:', nums.join(','), '| authors:', [...t.querySelectorAll('a.author')].map((a) => a.textContent.trim()).join(','));
}
"
```

Expected: `lines: 137,138,139,140 | authors: cubic-dev-ai,romsahel,cubic-dev-ai`. If the numbers differ, use the ACTUAL first/last numbers in the test below (semantics fixed: Line = last row, header from first row); if the authors differ, use the actual authors. Do not weaken the assertion shapes.

- [ ] **Step 2: Write the failing tests** — `tests/thread-classic.test.js` (adjust only the literals Step 1 corrected):

```js
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
  assert.ok(out.includes('> monitoring functions') || out.includes('monitoring functions'));
  assert.ok(!out.includes('**File:**'));
  assert.ok(!out.includes('**Line'));
  assert.ok(!out.includes('**Diff:**'));
});
```

Note: `commentIn` matches `.timeline-comment-group` blocks — standalone issue
comments are also rendered as one `.timeline-comment-group` (inside a
`.js-comment` timeline item, outside any `review-thread-collapsible`).

Run: `npm test` → new file FAILS (`Cannot find module '../src/thread-classic.js'` arrives in Step 3; at this point the dispatch doesn't exist so `getThreadData` returns null → assertions fail). Existing 37 stay green.

- [ ] **Step 3: Create `src/thread-classic.js`** with EXACTLY:

```js
import { hunkHeader } from './diff-hunk.js';
import { collectComments, extractComment } from './thread.js';

// Extractor for the Conversation tab's classic Rails timeline, where review
// threads are <review-thread-collapsible> elements embedding an old-format
// mini-diff (table.diff-table). The commented range isn't exposed on this
// page, so the line ref is the mini-diff's LAST row (GitHub's anchor line)
// and the diff is the mini-diff serialized verbatim.
//
// thread.js and this module import each other; both export only hoisted
// function declarations used at call time, so the cycle is safe under both
// esbuild and node's ESM loader.

// Returns the partial ThreadData (no PR meta — the dispatcher merges that),
// or null when the thread has no readable comments.
export function getClassicThreadData(threadEl) {
  const file = threadEl.querySelector('a[href*="/files#diff-"]')?.textContent.trim() || null;

  const comments = collectComments(threadEl, {
    commentSel: '.timeline-comment-group',
    authorSel: 'a.author',
    bodySel: '.comment-body.markdown-body',
  });
  if (comments.length === 0) return null;

  // First table only: the thread's mini-diff precedes the comments;
  // suggested-changes blocks inside comments render their own tables.
  const ref = serializeMiniDiff(threadEl.querySelector('table.diff-table'));

  return {
    file,
    side: ref?.side ?? null,
    startLine: ref?.line ?? null,
    endLine: ref?.line ?? null,
    comments,
    diff: file && ref ? ref.diff : null,
  };
}

// Standalone issue-style comment (a .timeline-comment-group outside any
// review thread): copy JUST the clicked comment — no file/line/diff context
// exists for these. Returns the partial ThreadData or null.
export function getClassicCommentData(groupEl) {
  const comment = extractComment(groupEl, {
    authorSel: 'a.author',
    bodySel: '.comment-body.markdown-body',
  });
  if (!comment) return null;
  return {
    file: null,
    side: null,
    startLine: null,
    endLine: null,
    comments: [comment],
    diff: null,
  };
}

// Rows are [blob-num][blob-num[data-line-number]][blob-code]; the marker is
// encoded as classes (blob-code-addition / blob-code-deletion), not a span.
// Returns { side, line, diff } from the last row, or null.
function serializeMiniDiff(table) {
  if (!table) return null;
  const lines = [];
  let firstLine = null;
  let last = null;
  for (const tr of table.querySelectorAll('tr')) {
    const code = tr.querySelector('td.blob-code');
    if (!code) continue;
    const numCells = tr.querySelectorAll('td.blob-num[data-line-number]');
    const num = numCells[numCells.length - 1];
    if (!num) continue;
    const marker = code.classList.contains('blob-code-deletion')
      ? '-'
      : code.classList.contains('blob-code-addition')
        ? '+'
        : ' ';
    const text = (code.querySelector('.blob-code-inner') ?? code).textContent.replace(/\n+$/, '');
    lines.push(marker + text);
    const n = Number(num.getAttribute('data-line-number'));
    if (firstLine === null) firstLine = n;
    last = { line: n, side: marker === '-' ? 'L' : 'R' };
  }
  if (lines.length === 0 || last === null) return null;
  const diff = [hunkHeader(last.side, firstLine, last.line - firstLine + 1), ...lines].join('\n');
  return { side: last.side, line: last.line, diff };
}
```

- [ ] **Step 4: Add the dispatch in `src/thread.js`.** Add the import:

```js
import { getClassicThreadData, getClassicCommentData } from './thread-classic.js';
```

Replace the whole body of `getThreadData` with:

```js
// Assemble everything the prompt template needs from any clicked comment:
// React review thread (/changes), classic review thread (Conversation tab),
// or a standalone issue-style comment (Conversation tab; copies just that
// comment). Returns null when nothing readable surrounds the element.
export function getThreadData(commentEl) {
  const reactThread = commentEl.closest('[data-testid="review-thread"]');
  const classicThread = reactThread ? null : commentEl.closest('review-thread-collapsible');
  const standaloneComment =
    reactThread || classicThread ? null : commentEl.closest('.timeline-comment-group');
  if (!reactThread && !classicThread && !standaloneComment) return null;
  const meta = getPRMeta();
  if (!meta) return null;
  const data = reactThread
    ? getReactThreadData(reactThread)
    : classicThread
      ? getClassicThreadData(classicThread)
      : getClassicCommentData(standaloneComment);
  if (!data) return null;
  return { ...meta, ...data };
}
```

Move the previous React-specific body (file lookup, marker-box heading, `collectComments` call, `extractHunk`) into a new module-private function that takes the thread element and returns the partial (no meta):

```js
// React /changes view: thread sits inside the file's diff table; the line ref
// lives in the closest [data-marker-id] box's h2 heading.
function getReactThreadData(threadEl) {
  const file = getFilePathForRow(threadEl);

  const markerBox = threadEl.closest('[data-marker-id]') ?? threadEl.parentElement;
  const heading = markerBox?.querySelector('h2');
  const ref = heading ? parseLineRef(heading.textContent) : null;

  const comments = collectComments(threadEl, {
    commentSel: '[data-marker-navigation-comment-id]:not([data-marker-navigation-thread-reply])',
    authorSel: 'a[class*="AuthorName"]',
    bodySel: '.markdown-body',
  });
  if (comments.length === 0) return null;

  const diff = ref && file ? extractHunk(file, ref.side, ref.startLine, ref.endLine) : null;

  return {
    file,
    side: ref?.side ?? null,
    startLine: ref?.startLine ?? null,
    endLine: ref?.endLine ?? null,
    comments,
    diff,
  };
}
```

(`parseLineRef` stays exported and unchanged.)

- [ ] **Step 5: Verify and commit**

Run: `npm test`
Expected: 40/40 pass (37 + 3 new). The existing `tests/thread.test.js` exercises the React path through the new dispatch — it must stay green untouched.

```bash
git add src/thread-classic.js src/thread.js tests/thread-classic.test.js
git commit -m "feat: classic conversation-tab thread extraction with type dispatch"
```

---

### Task 3: Conversation-tab kebab injection in `src/comment-menu.js`

**Goal:** Detect classic kebabs (review-thread comments AND standalone issue-style comments), handle lazy and preloaded `details-menu` population, and exercise the full copy pipeline in tests.

**Files:**
- Modify: `src/comment-menu.js`
- Test: `tests/comment-menu-classic.test.js`
- Modify: `CLAUDE.md` (file map + key functions + fixture note)

**Acceptance Criteria:**
- [ ] Classic kebab clicks record the `.timeline-comment-group` for both review-thread comments and standalone comments
- [ ] Items landing later inside the pre-existing `details-menu` trigger injection (lazy include-fragment case)
- [ ] A menu already populated at click time gets the item synchronously (preload case)
- [ ] Clicking the injected item copies the classic thread's prompt (file `index.html`, diff fence); on a standalone comment it copies just that comment (no File/Lines/Diff)
- [ ] All React-path tests stay green; `npm run build` exits 0
- [ ] No second injection pipeline exists — same `injectMenuItem` serves both worlds

**Verify:** `npm test && npm run build` → 44/44 pass, build exit 0

**Steps:**

- [ ] **Step 1: Write the failing tests** — `tests/comment-menu-classic.test.js`:

```js
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
```

Run: `npm test` → the 3 new tests FAIL (classic kebabs unrecognized); 41 others green.

- [ ] **Step 2: Extend `src/comment-menu.js`.** Three changes, no new pipeline:

(a) Selector — replace the `KEBAB_SELECTOR` constant:

```js
// React /changes kebab + classic Conversation-tab kebab
const KEBAB_SELECTOR =
  'button[data-testid="comment-header-hamburger"], summary.timeline-comment-action';
```

(b) Pending-comment resolution — replace `onDocumentClick` with:

```js
function onDocumentClick(e) {
  const kebab = e.target.closest?.(KEBAB_SELECTOR);
  if (kebab) {
    pendingComment = commentForKebab(kebab);
    // Classic <details> menus may already be populated (hover preload), in
    // which case no mutation will follow the click — inject right away. The
    // lazy include-fragment case is covered by the observer instead.
    const menu = kebab.parentElement?.querySelector('details-menu[role="menu"]');
    if (pendingComment && menu?.querySelector('[role="menuitem"]')) injectMenuItem(menu);
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
```

(c) Mutation matching — in `onMenuMutation`, replace the menu-resolution line:

```js
      const menu = node.matches?.('[role="menu"]') ? node : node.querySelector?.('[role="menu"]');
```

with:

```js
      // closest() covers the node being a menu, being inside one (items
      // landing in a lazy classic details-menu), or containing one (React
      // portal mount).
      const menu = node.closest?.('[role="menu"]') ?? node.querySelector?.('[role="menu"]');
```

Nothing else changes — `injectMenuItem`, `setLabel`, `onCopyClick` serve both worlds as-is.

- [ ] **Step 3: Update `CLAUDE.md`.** File map: add `| `src/thread-classic.js` | Conversation-tab (classic timeline) thread extraction |` after the `src/thread.js` row. Key functions: add `| `getClassicThreadData` | `src/thread-classic.js` | Classic review thread → partial ThreadData |`. In the Tests convention bullet, mention both fixtures: `pr-with-comments.html` (/changes) and `pr-conversation-with-comments.html` (Conversation tab).

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build`
Expected: 44/44 pass; build exit 0; `grep -c "timeline-comment-action" content-script.js` ≥ 1.

```bash
git add src/comment-menu.js tests/comment-menu-classic.test.js CLAUDE.md
git commit -m "feat: 'Copy thread as prompt' on the Conversation tab"
```

- [ ] **Step 5: Manual verification (user, in Firefox)** — reload the extension (`about:debugging`), open a real PR Conversation tab: review-thread kebab shows the item (after the menu's items load) and copies the template with file/Line/diff; a standalone issue-comment kebab shows it too and copies JUST that comment (no File/Lines/Diff); `/changes` tab behavior unchanged.

---

## Self-review notes

- Scope was revised at user request during planning: standalone issue-style comments ARE in scope and copy just the clicked comment (spec updated in the same commit). Review threads keep whole-thread behavior.
- Spec coverage: three-way dispatch + Line-from-last-row + mini-diff serialization + single-comment extraction (Task 2), reuse boundaries (`hunkHeader`/`extractComment`/`collectComments` extraction Task 1; single injection pipeline Task 3), error handling via null-propagation (null fields → omitted sections; existing toast paths unchanged), both fixtures committed with `_files/` ignored (Task 1), probe script deleted (Task 1).
- Type consistency: `getClassicThreadData(threadEl)` and `getClassicCommentData(groupEl)` both return the partial `{file, side, startLine, endLine, comments, diff}`; the dispatcher merges `getPRMeta()` — matching the React partial's shape exactly. `hunkHeader(side, firstLine, count)` used identically in both serializers.
- Circular import (`thread.js` ⇄ `thread-classic.js`) is function-declaration-only and call-time-resolved — safe in esbuild and node ESM; noted in the module comment.
- Test counts: 36 → 37 (Task 1) → 41 (Task 2) → 44 (Task 3).
