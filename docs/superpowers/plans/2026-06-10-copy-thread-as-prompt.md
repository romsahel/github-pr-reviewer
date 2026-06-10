# Copy Thread as Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy thread as prompt" item to the three-dots (kebab) menu of every review comment on GitHub PR `/changes` pages, copying a ready-to-paste AI prompt (PR context + comment thread + diff window) to the clipboard.

**Architecture:** Six new small ES modules under `src/`, bundled by esbuild into `content-script.js`. A capture-phase click listener + `MutationObserver` inject a cloned menu item into GitHub's portaled React dropdown; pure modules build the prompt from DOM-extracted thread data. Node's built-in test runner + jsdom test the extraction/formatting modules against the real saved-page fixture `pr-with-comments.html` (PR tryriot/parrot#16643).

**Tech Stack:** Firefox WebExtension MV2, vanilla ES modules, esbuild, `node --test`, jsdom (dev-only).

**Spec:** `docs/superpowers/specs/2026-06-10-copy-thread-as-prompt-design.md`

**Environment note:** node/npm are mise-managed and may be off PATH. If `npm` is not found, prefix commands with `mise exec -- ` (e.g. `mise exec -- npm test`).

---

## Verified DOM/JSON anchors (from `pr-with-comments.html`, PR #16643)

These were confirmed by inspection before planning — implementers should trust them:

- Kebab button: `button[data-testid="comment-header-hamburger"]`.
- Dropdown: mounts on click as a portal; contains `[role="menu"]` with `[role="menuitem"]` children. It does NOT exist in the DOM until clicked.
- Thread container: `[data-testid="review-thread"]` — lives **inside** the file's `table[data-diff-anchor]` (inside a `<tr>`), so `closest('table[data-diff-anchor]')` reaches the file table.
- Comment blocks: `[data-marker-navigation-comment-id]`; the reply composer also carries that attribute plus `data-marker-navigation-thread-reply="true"` (must be excluded).
- Author: `a[class*="AuthorName"]` inside the comment header (hashed CSS-module class contains `AuthorName__`).
- Body: `.markdown-body` inside the comment block.
- Line heading: an `<h2>` inside the closest `[data-marker-id]` ancestor; text is `Comment on line R52` or `Comment on lines R444 to R446`.
- Hunk rows: `td.diff-text-cell.hunk` with the `@@ -x,y +a,b @@` text in `.diff-text-inner`. Real hunks can span 180+ lines — we do NOT copy whole hunks; we copy a window (3 context lines above through the commented range).
- Code lines: number cell `td.new-diff-line-number[data-line-number][data-diff-side]`, code cell `td.diff-text-cell` with `.diff-text-marker` (`+`/`-`/space) and `.diff-text-inner`. Rows hold one code cell (added/removed) or two (paired left/right); context rows have two number cells pointing at one code cell. Code text is split across syntax-highlight spans — always read `textContent`.
- PR metadata: `script[type="application/json"][data-target="react-app.embeddedData"]` contains `"headBranch"`, `"baseBranch"`, `"number"`. Header fallback: two `<a data-component="BranchName">` anchors, base branch first.
- Fixture ground truth for tests: file `test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs`, heading `Comment on lines R444 to R446`, authors `gaydamakha` then `roamdam`, first body contains `setup_block_threats_workspace`, lines 441–446 are all additions (441 `workspace: workspace,` … 444 `workspace.inbox_settings` …), `baseBranch` = `staging`, `headBranch` = `roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts`.

---

### Task 1: Test infrastructure + `src/prompt.js`

**Goal:** Stand up `node --test` + jsdom testing, commit the fixture, and implement the pure prompt template module with tests.

**Files:**
- Modify: `package.json` (add `"type": "module"`, `test` script, jsdom devDependency)
- Modify: `.gitignore` (ignore `pr-with-comments_files/`)
- Create: `src/prompt.js`
- Create: `tests/helpers/fixture.js`
- Create: `tests/prompt.test.js`
- Commit: `pr-with-comments.html` (test fixture)

**Acceptance Criteria:**
- [ ] `npm test` runs the node test runner over `tests/` and passes
- [ ] `npm run build` still produces `content-script.js` without errors
- [ ] `npm run version` machinery still works (`node -e` stays CommonJS despite `"type": "module"`)
- [ ] `buildPrompt` reproduces the spec's template exactly (header lines, quoted thread, diff fence, trailing newline)

**Verify:** `npm test` → all tests pass; `npm run build` → exits 0

**Steps:**

- [ ] **Step 1: Update package.json and install jsdom**

Add to `package.json` (top level): `"type": "module",` and to `scripts`: `"test": "node --test \"tests/**/*.test.js\""` (the glob MUST be quoted so node — not sh — expands it; `node --test tests/` directory form fails on node v22, and an unquoted glob lets sh silently skip root tests once nested test files exist). Then:

```bash
npm install --save-dev jsdom
```

Sanity-check that the version script's CJS eval still works:

```bash
node -e "const fs=require('fs'); console.log('cjs ok')"
```

Expected: `cjs ok` (node `-e` defaults to CommonJS even with `"type": "module"`).

- [ ] **Step 2: Commit the fixture**

Append `pr-with-comments_files/` to `.gitignore`. Then:

```bash
git add .gitignore package.json package-lock.json
git add -f pr-with-comments.html
```

(`-f` in case a broad ignore rule matches; the saved-page assets dir stays untracked.)

- [ ] **Step 3: Write the fixture helper** — `tests/helpers/fixture.js`:

```js
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

// Parse the saved PR page (tryriot/parrot#16643 /changes) and install the
// browser globals src/ modules use. Call this BEFORE importing src modules —
// src/state.js reads location.href at import time, so use dynamic import() in
// tests after calling this.
export function installFixtureGlobals() {
  const html = readFileSync(new URL('../../pr-with-comments.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/tryriot/parrot/pull/16643/changes' });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  return dom.window;
}
```

- [ ] **Step 4: Write the failing tests** — `tests/prompt.test.js`:

```js
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
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/prompt.js'`

- [ ] **Step 6: Implement** — `src/prompt.js`:

```js
// Render the fixed "Copy thread as prompt" template from a ThreadData object:
// { repo, prUrl, sourceBranch, targetBranch, file, side, startLine, endLine,
//   comments: [{ author, bodyMarkdown }], diff }
// Optional pieces (branches, file, lines, diff) are omitted when null —
// never rendered as empty values.
export function buildPrompt(t) {
  const lines = ['Address the following comment:'];
  lines.push(`**Repository:** \`${t.repo}\``);
  if (t.sourceBranch) {
    lines.push(`**Source branch:** \`${t.sourceBranch}\``);
    lines.push(`Use \`${t.sourceBranch}\` as the working branch when possible.`);
  }
  if (t.targetBranch) lines.push(`**Target branch:** \`${t.targetBranch}\``);
  lines.push(`**Pull request:** ${t.prUrl}`);
  if (t.file) lines.push(`**File:** \`${t.file}\``);
  if (t.startLine != null) {
    lines.push(
      t.endLine != null && t.endLine !== t.startLine
        ? `**Lines ${t.startLine}-${t.endLine}**`
        : `**Line ${t.startLine}**`
    );
  }
  lines.push('', '**Comment thread:**', '');
  for (const c of t.comments) {
    lines.push(`> **${c.author}:**`);
    for (const bodyLine of c.bodyMarkdown.split('\n')) {
      lines.push(bodyLine === '' ? '>' : `> ${bodyLine}`);
    }
    lines.push('>');
  }
  if (t.diff) lines.push('', '**Diff:**', '', '```diff', t.diff, '```');
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 tests)

Run: `npm run build`
Expected: exit 0, `content-script.js` regenerated

- [ ] **Step 8: Commit**

```bash
git add src/prompt.js tests/ package.json package-lock.json .gitignore
git commit -m "feat: prompt template module + node test infrastructure"
```

(`content-script.js` is generated AND gitignored — never commit it.)

---

### Task 2: `src/markdown.js` — HTML → lightweight markdown

**Goal:** Convert a rendered GitHub comment body (`.markdown-body` element) back to lightweight markdown (inline code, links, bold/italic, code blocks, lists, blockquotes).

**Files:**
- Create: `src/markdown.js`
- Test: `tests/markdown.test.js`

**Acceptance Criteria:**
- [ ] `<code>` → backticks; `<a>` → `[text](href)` but @mentions and text-equals-href links stay plain text
- [ ] `<strong>/<b>` → `**…**`, `<em>/<i>` → `*…*`, `<br>` → newline
- [ ] `<pre>` → fenced code block; `<ul>/<ol>` → `- ` / `1. ` lines; paragraphs separated by one blank line
- [ ] Whitespace in text nodes is collapsed (saved/prettified HTML must not leak extra spaces)

**Verify:** `npm test` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests** — `tests/markdown.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/markdown.js'`

- [ ] **Step 3: Implement** — `src/markdown.js`:

```js
// Convert a rendered GitHub comment body (.markdown-body) to lightweight
// markdown. Handles paragraphs, inline code, code blocks, links, bold/italic,
// lists, blockquotes, headings and <br>; anything else degrades to its text.
// Uses numeric nodeType constants so it runs in both the browser and jsdom.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function htmlToMarkdown(root) {
  return blocks(root).join('\n\n').trim();
}

function blocks(el) {
  const out = [];
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const t = child.textContent.trim();
      if (t) out.push(t);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'P') out.push(inline(child).trim());
    else if (tag === 'PRE') out.push('```\n' + child.textContent.replace(/\n$/, '') + '\n```');
    else if (tag === 'UL' || tag === 'OL') out.push(list(child, tag === 'OL'));
    else if (tag === 'BLOCKQUOTE') out.push(quote(child));
    else if (/^H[1-6]$/.test(tag)) out.push('#'.repeat(Number(tag[1])) + ' ' + inline(child).trim());
    else out.push(inline(child).trim());
  }
  return out.filter(Boolean);
}

function list(el, ordered) {
  return Array.from(el.children)
    .filter((li) => li.tagName === 'LI')
    .map((li, i) => (ordered ? `${i + 1}. ` : '- ') + inline(li).trim())
    .join('\n');
}

function quote(el) {
  return blocks(el).join('\n\n').split('\n').map((l) => '> ' + l).join('\n');
}

function inline(el) {
  let out = '';
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      out += child.textContent.replace(/\s+/g, ' ');
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'CODE') out += '`' + child.textContent + '`';
    else if (tag === 'A') out += link(child);
    else if (tag === 'STRONG' || tag === 'B') out += '**' + inline(child) + '**';
    else if (tag === 'EM' || tag === 'I') out += '*' + inline(child) + '*';
    else if (tag === 'BR') out += '\n';
    else if (tag === 'IMG') out += child.getAttribute('alt') || '';
    else out += inline(child);
  }
  return out;
}

function link(a) {
  const text = inline(a).trim();
  const href = a.getAttribute('href') || '';
  // @mentions and bare-URL links read better as plain text in a prompt
  if (!href || text.startsWith('@') || text === href) return text;
  return `[${text}](${href})`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests, Tasks 1+2)

- [ ] **Step 5: Commit**

```bash
git add src/markdown.js tests/markdown.test.js
git commit -m "feat: html-to-markdown converter for comment bodies"
```

---

### Task 3: `src/pr-meta.js` — PR metadata extraction

**Goal:** Resolve repo/owner/PR number/URL and source/target branches once per PR, cached on `state`, from the embedded JSON payload with a header-anchor fallback.

**Files:**
- Create: `src/pr-meta.js`
- Modify: `src/state.js` (add `prMeta: null`)
- Test: `tests/pr-meta.test.js`

**Acceptance Criteria:**
- [ ] `findBranches` (pure) finds `headBranch`/`baseBranch` anywhere in a nested payload
- [ ] `getPRMeta()` on the fixture returns repo `parrot`, PR URL for #16643, source `roman/inb-2778-…`, target `staging`
- [ ] Result is cached on `state.prMeta`; `clearPRMetaCache()` resets it

**Verify:** `npm test` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests** — `tests/pr-meta.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/pr-meta.js'`

- [ ] **Step 3: Implement.** Add `prMeta: null,` to the object in `src/state.js`. Create `src/pr-meta.js`:

```js
import { state } from './state.js';
import { parsePRFromURL } from './dom.js';

// Breadth-first search for the first object carrying headBranch/baseBranch.
// Exported for tests.
export function findBranches(payload) {
  const queue = [payload];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (typeof node.headBranch === 'string' && typeof node.baseBranch === 'string') {
      return { sourceBranch: node.headBranch, targetBranch: node.baseBranch };
    }
    for (const value of Object.values(node)) queue.push(value);
  }
  return null;
}

function branchesFromEmbeddedJSON() {
  const scripts = document.querySelectorAll(
    'script[type="application/json"][data-target="react-app.embeddedData"],' +
      'script[type="application/json"][data-target="react-partial.embeddedData"]'
  );
  for (const script of scripts) {
    try {
      const found = findBranches(JSON.parse(script.textContent));
      if (found) return found;
    } catch {
      // not the payload we want — keep looking
    }
  }
  return null;
}

function branchesFromHeader() {
  // The PR header renders base then head: <a data-component="BranchName">…
  const names = document.querySelectorAll('a[data-component="BranchName"]');
  if (names.length < 2) return null;
  return {
    targetBranch: names[0].textContent.trim(),
    sourceBranch: names[1].textContent.trim(),
  };
}

// Cached per PR; invalidated by clearPRMetaCache() on init/navigation.
export function getPRMeta() {
  if (state.prMeta) return state.prMeta;
  const pr = parsePRFromURL(location.href);
  if (!pr) return null;
  const branches = branchesFromEmbeddedJSON() || branchesFromHeader();
  state.prMeta = {
    owner: pr.owner,
    repo: pr.repo,
    prNumber: pr.prNumber,
    prUrl: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.prNumber}`,
    sourceBranch: branches?.sourceBranch ?? null,
    targetBranch: branches?.targetBranch ?? null,
  };
  return state.prMeta;
}

export function clearPRMetaCache() {
  state.prMeta = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (fixture parse takes a few seconds — jsdom on a 1.2 MB page)

- [ ] **Step 5: Commit**

```bash
git add src/pr-meta.js src/state.js tests/pr-meta.test.js
git commit -m "feat: PR metadata extraction (branches from embedded JSON)"
```

---

### Task 4: `src/diff-hunk.js` — diff window extraction

**Goal:** Serialize the diff window around a commented line range — up to 3 rendered context lines above the start line through the end line — with a synthesized `@@` header.

**Files:**
- Create: `src/diff-hunk.js`
- Test: `tests/diff-hunk.test.js`

**Acceptance Criteria:**
- [ ] `extractHunk(file, 'R', 444, 446)` on the fixture returns a window starting `@@ -0,0 +441,6 @@` with 6 `+` lines (441–446)
- [ ] Lines keep their `+`/`-`/space markers and exact text (read via `textContent` — code is split across syntax spans)
- [ ] Returns `null` when the file table or the commented rows are absent
- [ ] Window never renders a line twice for context rows that carry two number cells

**Verify:** `npm test` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests** — `tests/diff-hunk.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/diff-hunk.js'`

- [ ] **Step 3: Implement** — `src/diff-hunk.js`:

```js
import { tableForFilePath } from './dom.js';

// Rendered context lines included above the commented range.
const CONTEXT_ABOVE = 3;

// Serialize the diff window around a commented line range: up to CONTEXT_ABOVE
// rendered lines above startLine, through endLine. The header is synthesized
// (left-side numbers are not computed — this is prompt context, not a patch).
// Returns null when the table or the commented rows aren't in the DOM.
export function extractHunk(filePath, side, startLine, endLine) {
  const table = tableForFilePath(filePath);
  if (!table) return null;
  const sideAttr = side === 'L' ? 'left' : 'right';

  const rowFor = (n) =>
    table
      .querySelector(`td.new-diff-line-number[data-line-number="${n}"][data-diff-side="${sideAttr}"]`)
      ?.closest('tr');

  let firstRow = null;
  let firstLine = null;
  for (let n = Math.max(1, startLine - CONTEXT_ABOVE); n <= startLine && !firstRow; n++) {
    firstRow = rowFor(n);
    firstLine = n;
  }
  const lastRow = rowFor(endLine) ?? rowFor(startLine);
  if (!firstRow || !lastRow) return null;

  const rows = Array.from(table.querySelectorAll('tr'));
  const from = rows.indexOf(firstRow);
  const to = rows.indexOf(lastRow);
  if (from === -1 || to < from) return null;

  const lines = [];
  for (let i = from; i <= to; i++) lines.push(...serializeRow(rows[i]));
  if (lines.length === 0) return null;

  // Count covers the commented side's window; interleaved deletions are extra
  const header = `@@ -0,0 +${firstLine},${endLine - firstLine + 1} @@`;
  return [header, ...lines].join('\n');
}

// A row holds one code cell (unified added/removed line) or two (paired
// left/right). Context rows have two number cells pointing at one code cell —
// the Set dedupes. Markers: '+', '-', or ''/' ' for context.
function serializeRow(tr) {
  const lines = [];
  const seen = new Set();
  for (const td of tr.querySelectorAll('td.new-diff-line-number[data-line-number]')) {
    const code = td.nextElementSibling;
    if (!code || !code.classList.contains('diff-text-cell')) continue;
    if (code.classList.contains('hunk') || seen.has(code)) continue;
    seen.add(code);
    const marker = code.querySelector('.diff-text-marker')?.textContent || ' ';
    const text = code.querySelector('.diff-text-inner')?.textContent ?? '';
    lines.push(marker + text);
  }
  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. If the exact-count assertions fail, inspect the actual output with `console.log(diff)` in the test — the fixture is ground truth; fix the implementation (not the expected window semantics: 3-above through endLine).

- [ ] **Step 5: Commit**

```bash
git add src/diff-hunk.js tests/diff-hunk.test.js
git commit -m "feat: diff window extraction around commented lines"
```

---

### Task 5: `src/thread.js` — thread assembly

**Goal:** Given any comment element in a thread, assemble the full `ThreadData` object (meta + file + line ref + ordered comments + diff window), with a pure `parseLineRef` helper.

**Files:**
- Create: `src/thread.js`
- Test: `tests/thread.test.js`

**Acceptance Criteria:**
- [ ] `parseLineRef` handles `Comment on line R52`, `Comment on lines R444 to R446`, `L`-side refs, and returns `null` otherwise
- [ ] `getThreadData` on the fixture's R444–446 thread returns file, side `R`, 444–446, authors `['gaydamakha', 'roamdam']`, bodies with inline code preserved, branches, and a diff starting `@@ -0,0 +441,6 @@`
- [ ] The reply composer (`data-marker-navigation-thread-reply`) is never picked up as a comment
- [ ] End-to-end: `buildPrompt(getThreadData(el))` produces the full spec template from the fixture

**Verify:** `npm test` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests** — `tests/thread.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals();
const { parseLineRef, getThreadData } = await import('../src/thread.js');
const { buildPrompt } = await import('../src/prompt.js');
const { clearPRMetaCache } = await import('../src/pr-meta.js');

function findFixtureComment() {
  for (const el of document.querySelectorAll('[data-marker-navigation-comment-id]')) {
    if (el.textContent.includes('setup_block_threats_workspace')) return el;
  }
  return null;
}

test('parseLineRef parses single lines, ranges, and sides', () => {
  assert.deepEqual(parseLineRef('Comment on line R52'), { side: 'R', startLine: 52, endLine: 52 });
  assert.deepEqual(parseLineRef('Comment on lines R444 to R446'), { side: 'R', startLine: 444, endLine: 446 });
  assert.deepEqual(parseLineRef('Comment on lines L10 to L12'), { side: 'L', startLine: 10, endLine: 12 });
  assert.equal(parseLineRef('Some unrelated heading'), null);
});

test('getThreadData assembles the fixture R444-446 thread', () => {
  clearPRMetaCache();
  const el = findFixtureComment();
  assert.ok(el, 'fixture comment not found');
  const t = getThreadData(el);
  assert.ok(t, 'expected thread data');
  assert.equal(t.file, 'test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs');
  assert.equal(t.side, 'R');
  assert.equal(t.startLine, 444);
  assert.equal(t.endLine, 446);
  assert.deepEqual(t.comments.map((c) => c.author), ['gaydamakha', 'roamdam']);
  assert.ok(t.comments[0].bodyMarkdown.includes('setup_block_threats_workspace'));
  assert.ok(t.comments[1].bodyMarkdown.includes('ai_labeling_preference'));
  assert.equal(t.sourceBranch, 'roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts');
  assert.equal(t.targetBranch, 'staging');
  assert.ok(t.diff.startsWith('@@ -0,0 +441,6 @@'));
});

test('end-to-end: buildPrompt renders the fixture thread', () => {
  clearPRMetaCache();
  const out = buildPrompt(getThreadData(findFixtureComment()));
  assert.ok(out.startsWith('Address the following comment:\n'));
  assert.ok(out.includes('**Repository:** `parrot`\n'));
  assert.ok(out.includes('**Lines 444-446**\n'));
  assert.ok(out.includes('> **gaydamakha:**\n'));
  assert.ok(out.includes('```diff\n@@ -0,0 +441,6 @@\n'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/thread.js'`

- [ ] **Step 3: Implement** — `src/thread.js`:

```js
import { getFilePathForRow } from './dom.js';
import { getPRMeta } from './pr-meta.js';
import { htmlToMarkdown } from './markdown.js';
import { extractHunk } from './diff-hunk.js';

// "Comment on line R52" / "Comment on lines R444 to R446" → side + range.
// Returns null for headings without a line reference (file-level comments).
export function parseLineRef(text) {
  const m = text.match(/Comment on lines? ([LR])(\d+)(?: to [LR](\d+))?/);
  if (!m) return null;
  const startLine = Number(m[2]);
  return { side: m[1], startLine, endLine: m[3] ? Number(m[3]) : startLine };
}

// Assemble everything the prompt template needs from any clicked comment in a
// thread. Returns null when the surrounding thread can't be read.
export function getThreadData(commentEl) {
  const threadEl = commentEl.closest('[data-testid="review-thread"]');
  if (!threadEl) return null;
  const meta = getPRMeta();
  if (!meta) return null;

  // Inline threads render inside the file's diff table
  const file = getFilePathForRow(threadEl);

  const markerBox = threadEl.closest('[data-marker-id]') ?? threadEl.parentElement;
  const heading = markerBox?.querySelector('h2');
  const ref = heading ? parseLineRef(heading.textContent) : null;

  const comments = [];
  const commentEls = threadEl.querySelectorAll(
    '[data-marker-navigation-comment-id]:not([data-marker-navigation-thread-reply])'
  );
  for (const el of commentEls) {
    const author = el.querySelector('a[class*="AuthorName"]')?.textContent.trim();
    const body = el.querySelector('.markdown-body');
    if (!author || !body) continue;
    comments.push({ author, bodyMarkdown: htmlToMarkdown(body) });
  }
  if (comments.length === 0) return null;

  const diff = ref && file ? extractHunk(file, ref.side, ref.startLine, ref.endLine) : null;

  return {
    ...meta,
    file,
    side: ref?.side ?? null,
    startLine: ref?.startLine ?? null,
    endLine: ref?.endLine ?? null,
    comments,
    diff,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add src/thread.js tests/thread.test.js
git commit -m "feat: thread data assembly from comment DOM"
```

---

### Task 6: `src/comment-menu.js` — menu injection + wiring + manifest

**Goal:** Inject "Copy thread as prompt" into the kebab dropdown, wire everything into the extension, and verify on a real PR.

**Files:**
- Create: `src/comment-menu.js`
- Modify: `src/main.js` (call `clearPRMetaCache()` + `initCommentMenu()` in `initForCurrentPR`)
- Modify: `src/spa.js` (call `clearPRMetaCache()` in `onURLChange`)
- Modify: `manifest.json` (add `"clipboardWrite"` permission)
- Modify: `CLAUDE.md` (file map + key functions rows for the new modules)

**Acceptance Criteria:**
- [ ] Clicking a comment's kebab on a real PR `/changes` page shows "Copy thread as prompt" styled like the native items
- [ ] Clicking it sets the clipboard to the full template and shows the success toast
- [ ] The item appears exactly once per menu open (no double-injection)
- [ ] Existing line-review behavior (click-to-review, keyboard nav, progress badges) is unchanged
- [ ] All failure paths toast instead of throwing into GitHub's React tree

**Verify:** `npm test` && `npm run build` → pass/exit 0; then manual verification on a real GitHub PR (steps below)

**Steps:**

- [ ] **Step 1: Implement** — `src/comment-menu.js`:

```js
import { getThreadData } from './thread.js';
import { buildPrompt } from './prompt.js';
import { showToast } from './toast.js';

const KEBAB_SELECTOR = 'button[data-testid="comment-header-hamburger"]';

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
    pendingComment = kebab.closest('[data-marker-navigation-comment-id]');
    return;
  }
  // This capture listener fires before our item's own click handler —
  // keep the pending comment alive for it
  if (e.target.closest?.('[data-copy-thread-injected]')) return;
  pendingComment = null;
}

function onMenuMutation(mutations) {
  if (!pendingComment) return;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      const menu = node.matches?.('[role="menu"]') ? node : node.querySelector?.('[role="menu"]');
      if (menu) injectMenuItem(menu);
    }
  }
}

// Clone an existing item so GitHub's hashed ActionList classes keep our entry
// visually native even when class names rotate. cloneNode copies neither
// event listeners nor React fiber expandos, so the clone is inert.
function injectMenuItem(menu) {
  if (menu.querySelector('[data-copy-thread-injected]')) return;
  const template = menu.querySelector('[role="menuitem"]');
  if (!template) return;

  const item = template.cloneNode(true);
  item.setAttribute('data-copy-thread-injected', 'true');
  item.removeAttribute('id');
  item.removeAttribute('href');
  item.removeAttribute('aria-keyshortcuts');
  item.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href'));
  item.querySelectorAll('svg').forEach((svg) => svg.remove());
  setLabel(item, 'Copy thread as prompt');
  item.addEventListener('click', onCopyClick);

  template.parentElement.appendChild(item);
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

async function onCopyClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const comment = pendingComment;
  pendingComment = null;
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
```

- [ ] **Step 2: Wire into the extension.**

In `src/main.js`, add imports and calls:

```js
import { initCommentMenu } from './comment-menu.js';
import { clearPRMetaCache } from './pr-meta.js';
```

Inside `initForCurrentPR()`, after the `state.storageKey = …` line add `clearPRMetaCache();`, and after `bindLineNumberClicks();` add `initCommentMenu();`.

In `src/spa.js`, add `import { clearPRMetaCache } from './pr-meta.js';` and call `clearPRMetaCache();` in `onURLChange()` right after the `state.lastURL = currentURL;` line.

In `manifest.json`, change permissions to:

```json
  "permissions": [
    "storage",
    "tabs",
    "clipboardWrite"
  ],
```

- [ ] **Step 3: Update CLAUDE.md.** Add rows to the file map table:

```markdown
| `src/comment-menu.js` | Injects 'Copy thread as prompt' into comment kebab menus               |
| `src/thread.js`     | Assemble ThreadData (meta, file, lines, comments, diff) from a comment  |
| `src/pr-meta.js`    | PR metadata (repo, number, branches) from embedded JSON, cached         |
| `src/diff-hunk.js`  | Serialize the diff window around commented lines                        |
| `src/markdown.js`   | Rendered comment HTML → lightweight markdown                            |
| `src/prompt.js`     | Fixed "Copy thread as prompt" template renderer                         |
```

And to the key functions table:

```markdown
| `initCommentMenu`                     | `src/comment-menu.js` | Arm kebab-menu injection (once per page session)             |
| `getThreadData`                       | `src/thread.js`  | Comment element → ThreadData for the prompt                       |
| `buildPrompt`                         | `src/prompt.js`  | ThreadData → clipboard prompt string                              |
| `extractHunk`                         | `src/diff-hunk.js`| Diff window (3 context lines above → end of range)               |
| `getPRMeta` / `clearPRMetaCache`      | `src/pr-meta.js` | Cached repo/branches/PR-number lookup                             |
```

Also add a line under "Important conventions": `- **Tests** — \`npm test\` runs \`node --test "tests/**/*.test.js"\` (jsdom against \`pr-with-comments.html\`). Node is mise-managed; use \`mise exec -- npm test\` if npm is off PATH.`

- [ ] **Step 4: Build and run all tests**

Run: `npm test && npm run build`
Expected: all tests pass; build exits 0.

- [ ] **Step 5: Manual verification on a real PR** (the saved fixture can't mount the React dropdown):

1. `about:debugging` → This Firefox → Reload the extension (or Load Temporary Add-on → select `manifest.json`).
2. Open a real PR `/changes` page that has review comments (e.g. https://github.com/tryriot/parrot/pull/16643/changes).
3. Click a review comment's three-dots button → confirm **Copy thread as prompt** appears at the bottom of the menu, styled like the native items, exactly once (open/close the menu twice to check idempotence).
4. Click it → success toast appears; paste the clipboard into an editor → confirm it matches the template (repository, branches, PR URL, file, lines, quoted thread, ```diff window).
5. Click the kebab on a *reply* (not the root comment) → same item, same full-thread output.
6. Regression: click line numbers to mark reviewed, press `r`/`Shift+R`, check progress badges still update.
7. Optional degraded path: a comment on a collapsed/unloaded file should copy with the "Copied (diff unavailable)" toast.

- [ ] **Step 6: Commit**

```bash
git add src/comment-menu.js src/main.js src/spa.js manifest.json CLAUDE.md
git commit -m "feat: 'Copy thread as prompt' kebab menu action"
```

(`content-script.js` is generated AND gitignored — never commit it.)

---

## Self-review notes

- Spec coverage: template (Task 1), HTML→markdown (Task 2), PR metadata + fallbacks (Task 3), diff window (Task 4), thread assembly incl. reply-composer exclusion and file-level comments (Tasks 1+5), injection + clipboard + toast + wiring + manifest (Task 6). Error-handling table is covered by null-propagation in Tasks 3–5 and the toast paths in Task 6.
- The spec's original "full hunk" decision was revised during planning (real hunks reach 180+ lines); the spec file was updated to the 3-context-line window, which is exactly what the user's example output shows.
- Type consistency: `ThreadData` field names (`repo`, `prUrl`, `sourceBranch`, `targetBranch`, `file`, `side`, `startLine`, `endLine`, `comments[].author`, `comments[].bodyMarkdown`, `diff`) are identical across `prompt.js`, `thread.js`, and all tests. `extractHunk(filePath, side, startLine, endLine)` signature matches between Tasks 4 and 5.
