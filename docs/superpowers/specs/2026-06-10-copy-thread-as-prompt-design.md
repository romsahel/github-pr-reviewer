# Copy Thread as Prompt — Design

- **Date:** 2026-06-10
- **Status:** Approved design, ready for implementation planning
- **Component:** GitHub PR Line Reviewer (Firefox WebExtension, MV2)

## Summary

Add a **"Copy thread as prompt"** action to the three-dots (kebab) menu of every
review comment on a GitHub PR `/changes` page. Clicking it copies a ready-to-paste
prompt to the clipboard describing the whole comment thread, the PR/branch context,
the file and line range, and the surrounding diff hunk — so the user can paste it
into an AI coding agent to address the review comment.

## Goal / User flow

1. User reads an inline review comment on a PR `/changes` page.
2. User clicks the comment's three-dots (kebab) button.
3. A new **"Copy thread as prompt"** item appears in the native dropdown.
4. On click, the clipboard is set to a formatted prompt (see [Output format](#output-format)) and a toast confirms the copy.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Thread scope | **Whole thread, any comment.** The item appears on every comment's kebab (root or reply) and always copies the entire thread (all comments + replies in order). |
| Body fidelity | **Inline code + links.** Convert the rendered comment HTML to lightweight markdown: preserve `` `inline code` ``, `[links](url)`, bold/italic, fenced code blocks; lists become `- ` lines. |
| Template | **Fixed in code.** Hardcoded to match the example below. Not user-configurable in v1. |
| Page scope | **`/changes` page only** — same match patterns the extension already uses. |
| Diff snippet | **Window around the commented lines**: up to 3 rendered context lines above the start line, through the end line (matches the example, which shows 441–446 for a comment on 444–446). Real hunks can exceed 180 lines, so the full hunk was rejected during planning. |
| Injection approach | **A — native dropdown item**, via click-capture + `MutationObserver` + clone-an-existing-item styling. |
| Trigger pages | Existing content-script match: `https://github.com/*/*/pull/*` and `.../changes*`. |

## Output format

The prompt is built from a fixed template. Target output (the PR/file/line
metadata is from the real `pr-with-comments.html` fixture, PR #16643; the comment
authors and text are illustrative):

````text
Address the following comment:
**Repository:** `parrot`
**Source branch:** `roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts`
Use `roman/inb-2778-use-html-heuristic-to-match-reported-emails-to-alerts` as the working branch when possible.
**Target branch:** `staging`
**Pull request:** https://github.com/tryriot/parrot/pull/16643
**File:** `test/parrot/inbox/reporting/providers/mailgun/mailgun_inbox_email_reporter_test.exs`
**Lines 444-446**

**Comment thread:**

> **mikhail:**
> Nit: You could import a setup helper `setup_block_threats_workspace` from @test/support/inbound_protections_test_helpers.ex and use it instead
>
> **romain.damian:**
> Confirmed, it also provides a tag on `ai_labeling_preference` if I remember correctly
>

**Diff:**

```diff
@@ -0,0 +441,6 @@ defmodule Parrot.Inbox.Reporting.Providers.Mailgun.MailgunInboxEmailReporterTest
+      workspace: workspace,
+      employee: employee
+    } do
+      workspace.inbox_settings
+      |> Changeset.change(ai_labeling_preference: :auto, blocking_threats_enabled_at: DateTime.utc_now())
+      |> Repo.update!()
```
````

### Template rules

- **Repository:** bare repo name (`parrot`), no owner.
- **Source branch / working branch:** the PR head branch. The "Use `<branch>` as the working branch when possible." line repeats the head branch verbatim.
- **Target branch:** the PR base branch.
- **Pull request:** `https://github.com/<owner>/<repo>/pull/<number>`.
- **File:** path from the diff table's `aria-label="Diff for: <path>"`.
- **Lines:** single line → `**Line {n}**`; range → `**Lines {start}-{end}**`. Numbers are the side's line numbers (right/new side by default). File-level comments (no line) omit this line.
- **Comment thread:** one block per comment in DOM order: `> **{author}:**` followed by each body line prefixed with `> `; blank lines inside a body become a bare `>`; comments are separated by a `>` spacer line.
- **Diff:** a fenced ```` ```diff ```` block containing a synthesized header (`@@ -0,0 +<windowStart>,<count> @@` — left-side numbers are not computed, and no trailing function context is emitted even though the worked example above shows one; the bare header is normative) and the window's lines, each kept with its `+`/`-`/space marker. Omitted entirely if the window can't be extracted (see [Error handling](#error-handling)).

## Architecture

The feature is additive and bolts onto the existing content-script pipeline. Edit
files under `src/`, then `npm run build` regenerates `content-script.js` (never edit
`content-script.js` directly).

### New modules

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `src/comment-menu.js` | Injection engine (Approach A). Arms a capture-phase click listener on kebab buttons, observes the dropdown mounting, clones an existing menu item into **"Copy thread as prompt"**, wires the click handler → build prompt → clipboard → toast. Idempotent. | `thread.js`, `prompt.js`, `toast.js` |
| `src/thread.js` | Given a comment element, assemble the thread data object (see [Data model](#data-model)). | `dom.js`, `markdown.js`, `diff-hunk.js`, `pr-meta.js` |
| `src/pr-meta.js` | Parse PR metadata (repo, owner, number, head/base branch) once per PR. Primary source: embedded JSON blob; fallbacks: header `BranchName` anchors + URL. Cached on `state`. | `state.js`, `dom.js` |
| `src/diff-hunk.js` | Locate commented rows by `data-line-number` + `data-diff-side`, walk up to the enclosing `@@` hunk header, serialize marker + line text into a diff string. | `dom.js` |
| `src/markdown.js` | `htmlToMarkdown(el)` — convert a rendered comment body to lightweight markdown. | (pure) |
| `src/prompt.js` | `buildPrompt(thread)` — render the fixed template to a string. | (pure) |

### Wiring

- `src/main.js` `initForCurrentPR()` calls a new `initCommentMenu()` after `bindLineNumberClicks()`. `initCommentMenu()` arms the global kebab click-capture listener and the menu `MutationObserver`.
- `initCommentMenu()` is **guarded to arm its listeners only once per page session** (a module-level flag). Because the listener and observer are attached at `document` level, they survive GitHub SPA navigation, so re-calling `initCommentMenu()` on each navigation is a no-op after the first.
- PR metadata cache (`src/pr-meta.js`) is invalidated/recomputed inside `initForCurrentPR()` (which already re-runs on URL change via `startURLObserver` in `src/spa.js`), so branch/number always reflect the current PR.
- Feedback reuses `src/toast.js`.

### Manifest changes

- Add `"clipboardWrite"` to `permissions`. Clipboard write uses `navigator.clipboard.writeText` under the click's transient user activation.
- No new host permissions; match patterns unchanged.

## Injection mechanics (Approach A)

The kebab menu is React-rendered and **portaled** — it only mounts in the DOM when
clicked and is detached from the comment it belongs to. To put our item inside it:

1. **Record the active comment.** A capture-phase `click` listener on `document`
   detects clicks on (or within) `button[data-testid="comment-header-hamburger"]`.
   From the button, walk up to the owning comment container
   (`[data-marker-navigation-comment-id]` / the `ReviewThreadComment` wrapper) and
   stash it as the "pending" comment.
2. **Detect the menu.** A `MutationObserver` on `document.body` watches for an added
   subtree containing `[role="menu"]` (the ActionList dropdown). When one appears
   shortly after a kebab click, treat it as that comment's menu.
3. **Inject the item.** Prefer the **"Copy markdown"** entry as both the clone
   source and the insertion anchor (our item goes directly under it); fall back to
   the first `[role="menuitem"]` appended at the end. **Cloning** inherits GitHub's
   hashed `prc-ActionList-*` styling; the label is replaced with "Copy thread as
   prompt", the leading icon is repainted as the Octicon copy glyph (keeping native
   size/color attrs), and the clone is inert (no listeners/fibers copied). Guard
   with a marker attribute (`data-copy-thread-injected`) so we never inject twice
   into the same menu.
4. **Handle the click.** On our item's click: read the pending comment, build the
   thread object, render the prompt, `await navigator.clipboard.writeText(...)`,
   toast success, and close the menu.

**Why clone instead of hand-writing markup:** GitHub's ActionList classes are hashed
and change over time. Cloning a sibling item keeps our entry visually native and
resilient to class renames. If no item exists to clone (empty menu), we skip
injection silently.

## Data extraction

All anchors below are confirmed present in the `pr-with-comments.html` /
`example-comment.html` fixtures.

### Data model

```text
ThreadData {
  repo:          string   // "parrot"
  owner:         string   // "tryriot"
  prNumber:      string   // "16643" — regex capture from the URL; only interpolated, never compared numerically
  prUrl:         string   // https://github.com/tryriot/parrot/pull/16643
  sourceBranch:  string   // head branch
  targetBranch:  string   // base branch
  file:          string   // path from "Diff for: <path>"
  side:          "R"|"L"  // from the line-ref heading prefix
  startLine:     number|null
  endLine:       number|null
  comments:      Array<{ author: string, bodyMarkdown: string }>
  diff:          string|null  // serialized hunk, or null if unavailable
}
```

### Sources

| Field | Source |
| --- | --- |
| owner / repo / prNumber | `parsePRFromURL(location.href)` (existing helper) and/or embedded JSON. |
| prUrl | Constructed from owner/repo/number. |
| sourceBranch / targetBranch | Embedded JSON blob: `"headBranch"` / `"baseBranch"`. Fallback: the two `<a data-component="BranchName">` anchors in the PR header (base then head). |
| file | Nearest ancestor `table[aria-label^="Diff for: "]` of the comment; strip the `Diff for: ` prefix. |
| side / startLine / endLine | The thread heading `Comment on line[s] R444 [to R446]` (`h2.InlineReviewThread-module__inlineReviewThreadHeading…`). Parse `[LR]` prefix → side; one or two numbers → range. |
| comments[].author | Per-comment author link `a.ActivityHeader-module__AuthorName…` (text content). |
| comments[].bodyMarkdown | Per-comment `.markdown-body` element → `htmlToMarkdown()`. |
| diff | `src/diff-hunk.js` (below). |

To enumerate the thread's comments from any clicked comment: walk up to the thread
container (`[data-testid="review-thread"]`) and collect every comment block within,
in DOM order.

### Diff hunk extraction (`src/diff-hunk.js`)

1. From the file's diff table, select rows for the commented side using existing
   `dom.js` cell anchors: line-number cells `td.new-diff-line-number[data-line-number][data-diff-side]`.
2. Find the row(s) matching the parsed line range on the matching `data-diff-side`
   (`right` for `R`, `left` for `L`).
3. Collect the **window**: from the first rendered row within 3 lines above the
   start line, through the end-line row. Synthesize the header as
   `@@ -0,0 +<windowStart>,<count> @@` (the real hunk header is not reused — real
   hunks can span 180+ lines, far too much prompt noise; the example's 441–446 is
   exactly this 3-above window).
4. Serialize each row as `<marker><code>` where marker is `+`/`-`/space from the
   diff marker span (`.diff-text-marker` / `.blob-code-marker`) and code is the line
   text from `.diff-text-inner` / `.blob-code-inner`. Reuse `isEmptyLine`/cell
   helpers from `dom.js`.
5. Return the joined string, or `null` if the rows aren't present.

## HTML → markdown conversion (`src/markdown.js`)

`htmlToMarkdown(el)` walks the comment body and emits lightweight markdown:

- `<code>` (inline) → `` `text` ``
- `<pre><code>` → fenced ```` ``` ```` block
- `<a href>` → `[text](href)`
- `<strong>`/`<b>` → `**text**`; `<em>`/`<i>` → `*text*`
- `<li>` → `- text` (one per line); `<p>` → paragraph separated by blank line
- everything else → its text content
- GitHub injects helper classes/attributes (e.g. `rgh-seen-*`, `aria-hidden`) — these are ignored; only structure + text matter.

Output is trimmed and normalized to single blank lines between paragraphs. The
result is then quote-prefixed (`> `) when assembled into the thread block.

## Error handling

| Condition | Behavior |
| --- | --- |
| No item to clone in the dropdown | Skip injection silently (debug log). Feature simply doesn't appear; page never breaks. |
| Menu never observed after click | No-op; the capture listener just clears the pending comment on the next click. |
| Clipboard write rejects | Toast an error ("Couldn't copy thread"); log the error. |
| Diff hunk rows not in DOM (collapsed/outdated diff) | Omit the **Diff:** section; toast "Copied (diff unavailable)". Rest of the prompt is still copied. |
| Branch metadata missing (e.g. cross-fork edge) | Fall back URL → anchors → embedded JSON; if a branch is still unknown, leave that template line out rather than emit an empty value. |
| File-level comment (no line ref) | Omit the **Lines** line. |

All failures are non-fatal and never throw into GitHub's React tree.

## Testing

- **Manual (primary):** verify on a real GitHub PR `/changes` page (the static
  fixtures can't mount the React dropdown): click a kebab, confirm the item
  appears, click it, and verify clipboard contents match the expected prompt for
  the commented thread. (`pr-with-comments.html` is the committed jsdom test
  fixture; `example-comment.html` is an untracked scratch reference.)
- **Pure-function checks:** `markdown.js`, `prompt.js`, and the line-ref parser are
  pure and can be exercised with small Node snippets / fixtures (no DOM). Optional
  lightweight test harness; the repo currently has no test runner, so keep these as
  minimal node scripts unless a runner is added.
- **Regression:** confirm existing line-review behavior (click-to-review, keyboard
  nav, progress badges) is unchanged after `npm run build`.
- **Reload:** `about:debugging` → This Firefox → Reload the extension.

## Out of scope (v1)

- Configurable template / options-page editor.
- Pages other than `/changes` (Conversation tab, classic Files view).
- Capturing review-level (non-inline) comments or PR description.
- A keyboard shortcut for copying the focused thread.

## Open questions

None blocking. The diff-hunk extraction is the highest-risk module (DOM scraping);
if it proves brittle, the prompt still degrades gracefully by omitting the diff.
