# Copy Thread as Prompt — Conversation Tab — Design

- **Date:** 2026-06-10
- **Status:** Approved design, ready for implementation planning
- **Component:** GitHub PR Line Reviewer (Firefox WebExtension, MV2)
- **Extends:** `2026-06-10-copy-thread-as-prompt-design.md` (the `/changes` version, shipped in 1.1.23)

## Summary

Make the **"Copy thread as prompt"** kebab action work on the PR **Conversation
tab** (`https://github.com/<owner>/<repo>/pull/<n>`), where review threads are
rendered in the classic Rails timeline, not the React `/changes` view. Same
prompt template, same clipboard/toast behavior.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Scope | **Review threads + standalone issue-style comments.** Review threads copy the **whole thread** (file/line/diff included). Standalone conversation comments (issue-style comments, PR description, review summaries) copy **just the clicked comment** — repo/branches/PR URL + that one comment; File/Lines/Diff omitted (the template already drops null fields). *(Revised from "review threads only" at user request during planning.)* |
| Lines field | **`Line N`** where N = the mini-diff's **last row** line number (GitHub's anchor semantics). The commented range is not exposed on this page; the full mini-diff in the Diff section preserves surrounding lines. |
| Diff | Serialize the thread's **embedded mini-diff** verbatim (it is GitHub's own window around the comment). No `extractHunk` here — this page has no full diff tables. |
| Architecture | **Approach A — extend the existing pipeline.** One new extractor module; `thread.js` dispatches on thread type; everything else reused. |
| Code reuse | **Hard constraint: no duplication of the `/changes` implementation.** See [Reuse boundaries](#reuse-boundaries). |

## Verified DOM facts (fixture `pr-conversation-with-comments.html`, outlook-addin-phishing-reporter#268)

The Conversation tab is the **classic Rails timeline** (inside `rails-partial` /
`turbo-frame`s), not the React view:

- Thread wrapper: `<review-thread-collapsible class="review-thread-component js-comment-container js-resolvable-timeline-thread" data-resolved="…">`. 4 in the fixture; collapsed/resolved ones render empty until expanded (turbo-frame lazy load) — no kebab until then.
- File path: thread header link `a[href*="/files#diff-"]`; its **text** is the path (`index.html`). The href anchor is a path hash (`#diff-<sha256>`) — carries no line info.
- **No "Comment on line(s)" heading exists.** Line info comes only from the mini-diff rows.
- Mini-diff: `table.diff-table.js-diff-table` rows of `[td.blob-num.empty-cell?][td.blob-num[data-line-number]][td.blob-code]`. Marker is encoded as **classes** (`blob-num-addition` / `blob-num-deletion` / context), not a marker span. Code text in `.blob-code-inner` (syntax spans — read `textContent`).
- Comments: `.timeline-comment-group` per comment (inside `.js-comments-holder`); author `a.author`; body `.comment-body.markdown-body`.
- Kebab: `<summary class="timeline-comment-action">` per comment, with a sibling `<details-menu role="menu" src="…">` that exists upfront but **lazy-loads its items** via `include-fragment` when opened. Items carry `role="menuitem"` once loaded.
- Standalone comments (e.g. "Maybe you should move all the monitoring functions…") live in `.js-comment.js-updatable-content` timeline items **outside** any `review-thread-collapsible` → scope exclusion is one `closest()` call.
- PR metadata: the same embedded JSON payloads carry `"headBranch"` / `"baseBranch"` (`roman/legacy-beacon-metadata` → `staging` in the fixture) — `pr-meta.js` works unchanged.
- The React anchors from `/changes` (`comment-header-hamburger`, `[data-testid="review-thread"]`, `data-marker-navigation-comment-id`) appear **zero** times on this page.

## Architecture

### Reuse boundaries

Untouched and reused as-is: `src/prompt.js`, `src/markdown.js`, `src/pr-meta.js`,
`src/toast.js`, `src/dom.js`. Explicit anti-duplication rules:

1. `src/comment-menu.js` keeps a **single** injection pipeline (clone → strip →
   label → icon → closure-bound click → toast). Only kebab *detection* and menu
   *mutation matching* extend; no second injector.
2. The `@@ -0,0 +<first>,<count> @@` header synthesis moves from `extractHunk`
   into an exported helper in `src/diff-hunk.js`: `hunkHeader(side, firstLine,
   count)` → `@@ -0,0 +<first>,<count> @@` for `R`, `@@ -<first>,<count> +0,0 @@`
   for `L`. Reused by the classic serializer; `extractHunk` behavior unchanged.
3. The author+body collection loop in `src/thread.js` is parameterized by
   selectors (one helper, two selector sets) instead of being copy-pasted into
   the classic extractor.

### Changes by file

| File | Change |
| --- | --- |
| `src/thread.js` | `getThreadData(commentEl)` dispatches: `[data-testid="review-thread"]` ancestor → existing React path; `review-thread-collapsible` ancestor → `getClassicThreadData`; bare `.timeline-comment-group` ancestor (standalone issue-style comment) → `getClassicCommentData`; none → null. Shared helpers: `extractComment(el, {authorSel, bodySel})` (one comment) and `collectComments(container, {commentSel, authorSel, bodySel})` (loop over `extractComment`) — used by all paths, no duplicated loops. |
| `src/thread-classic.js` (new) | `getClassicThreadData(threadEl)`: file from header link text; serialize `table.diff-table` (marker from cell classes, text from `.blob-code-inner`); `startLine = endLine =` last row's `data-line-number`, side `L` if that row is a deletion else `R`; comments via the shared helper. `getClassicCommentData(groupEl)`: just the clicked comment via `extractComment`; file/side/lines/diff all null. Both return the partial ThreadData (the dispatcher merges `getPRMeta()`). |
| `src/diff-hunk.js` | Extract + export `hunkHeader(firstLine, count)` (and the L-side variant) so both serializers share header formatting. No behavior change. |
| `src/comment-menu.js` | (a) `KEBAB_SELECTOR` adds `summary.timeline-comment-action`; (b) pending-comment resolution falls back `[data-marker-navigation-comment-id]` → `.timeline-comment-group` (review-thread members AND standalone comments — `thread.js` decides whole-thread vs single-comment); (c) `onMenuMutation` also matches added nodes whose `closest('[role="menu"]')` exists (items landing in a pre-existing lazy `details-menu`); (d) preloaded menus inject synchronously on click, skipping menuitems still inside an unresolved `include-fragment` skeleton. |

### ThreadData (unchanged shape)

Classic path fills the same fields the React path does. `side`/`startLine`/`endLine`
use the last-mini-diff-row decision; `diff` is the serialized mini-diff with a
synthesized header; optional fields stay null-omitted by `buildPrompt`.

### Injection flow on the Conversation tab

1. User clicks `summary.timeline-comment-action` → capture listener records the
   `.timeline-comment-group` (review-thread member or standalone — both in scope).
2. The `<details>` opens; `details-menu` fetches its items via `include-fragment`.
3. The body MutationObserver fires as items land inside the existing
   `[role="menu"]` → same `injectMenuItem` clones an item ("Copy markdown" anchor
   preferred, first `[role="menuitem"]` fallback), labels it, paints the copy
   octicon, binds the captured comment.
4. Click → `getThreadData` (classic path) → `buildPrompt` → clipboard → toast.
   Re-opening the same menu re-uses the already-injected item (the
   `data-copy-thread-injected` guard); each comment owns its own `details-menu`,
   so the closure-bound comment stays correct.

## Error handling

Same null-propagation contract as the `/changes` version:

| Condition | Behavior |
| --- | --- |
| File link missing | `file: null` → File line omitted; diff omitted (needs both). |
| Mini-diff table missing/empty | `diff: null`, `startLine/endLine/side: null` → sections omitted, "Copied (diff unavailable)" toast. |
| No `.timeline-comment-group` with author+body | `getThreadData` → null → "Couldn't read comment thread" toast. |
| Standalone comment | In scope: copies just that comment (repo/branches/PR URL + body); File/Lines/Diff omitted; "Copied (diff unavailable)" toast variant applies (no diff by construction). |
| Collapsed/resolved thread | No rendered kebab until expanded — naturally inert. |
| Menu items fail to lazy-load | No `[role="menuitem"]` to clone → skip + debug log + pending cleared (existing guard). |

Nothing throws into GitHub's page; all failures end in a toast or a silent skip.

## Testing

- Commit `pr-conversation-with-comments.html` as a second jsdom fixture (ignore
  its `pr-conversation-with-comments_files/` dir). Fixture URL for jsdom:
  `https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268`.
- New tests (mirroring the existing suites):
  - **Classic extraction:** the *outlook_version* thread → file `index.html`,
    `Line` = last mini-diff row, side `R`, 3 comments with authors
    `cubic-dev-ai, romsahel, cubic-dev-ai`, diff lines all `+` with synthesized
    header; end-to-end `buildPrompt` renders the full template.
  - **Standalone single-comment copy:** the *monitoring functions* standalone
    comment → ThreadData with exactly one comment, file/lines/diff null;
    `buildPrompt` renders repo/branches/PR URL + the quoted comment with no
    File/Lines/Diff sections.
  - **Lazy-menu injection:** fake pre-existing `details-menu[role="menu"]` that
    fills after the kebab click → item injected once, click copies the classic
    thread's prompt.
  - **Regression:** all 36 existing tests stay green (React path untouched).
- Manual: real PR Conversation tab — kebab on a review-thread comment shows the
  item and copies the full template; a standalone comment kebab shows it and
  copies just that comment (no File/Lines/Diff); `/changes` behavior unchanged.
- Delete the throwaway `probe-conv.mjs`.

## Out of scope (v1)

- Recovering the true multi-line commented range (not exposed on this page).
- Outdated-thread special-casing (they render the same mini-diff; treated identically).
- Keyboard reachability of the injected item (same limitation as `/changes`).
