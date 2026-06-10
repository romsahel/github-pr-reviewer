# GitHub PR Line Reviewer — Developer Notes

## What this is

A Firefox WebExtension (Manifest V2) that lets users mark individual diff lines as
reviewed on GitHub PR `/changes` pages. State persists across page reloads and
navigations using `browser.storage.local`.

## File map

| File                | Role                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `content-script.js` | **Generated** — esbuild output, do not edit directly                         |
| `src/state.js`      | Shared mutable state object                                                   |
| `src/dom.js`        | Pure DOM helpers (no state)                                                   |
| `src/storage.js`    | Storage I/O: serialize/deserialize, load, save, scheduleSave                  |
| `src/visual.js`     | CSS class application, `applyStateToDOM`                                      |
| `src/progress.js`   | Per-file progress badge: `updateFileProgress`, `updateAllFileProgress`        |
| `src/events.js`     | Click/hover binding: `bindLineNumberClicks`                                   |
| `src/keyboard.js`   | Key handlers + mark/navigate functions: `onKeyDown`, `onMessage`              |
| `src/spa.js`        | SPA navigation using Navigation API, diff/URL observers                       |
| `src/comment-menu.js` | Injects 'Copy thread as prompt' into comment kebab menus                    |
| `src/thread.js`     | Assemble ThreadData (meta, file, lines, comments, diff) from a comment        |
| `src/thread-classic.js` | Conversation-tab (classic timeline) thread extraction                |
| `src/pr-meta.js`    | PR metadata (repo, number, branches) from embedded JSON, cached               |
| `src/diff-hunk.js`  | Serialize the diff window around commented lines                              |
| `src/markdown.js`   | Rendered comment HTML → lightweight markdown                                  |
| `src/prompt.js`     | Fixed "Copy thread as prompt" template renderer                               |
| `src/main.js`       | Entry point: `initForCurrentPR` + global listener setup                       |
| `background.js`     | Forwards keyboard commands (`Alt+R`, etc.) to content script                  |
| `styles.css`        | Visual styles: `.pr-line-reviewed`, `.pr-reviewer-progress`, `.pr-line-flash` |
| `options.html/js`   | Stats page: view/export/clear all stored review data                          |
| `manifest.json`     | MV2, Firefox only (`gecko` min 126), matches `*/pull/*` (Conversation + /changes) |
| `github_diff.html`  | Local GitHub diff fixture for manual testing without a live PR                |

## Architecture

### State

```
reviewState: Map<filePath, { L: Set<string|number>, R: Set<string|number> }>
storageKey:  "pr:owner/repo:prNumber"
```

- `L` = left/old side, `R` = right/new side
- Saved to `browser.storage.local` with a 300 ms debounce

### DOM anchors GitHub PR diffs use

- Line number cells: `td.new-diff-line-number[data-line-number][data-diff-side]`
- Code cells (new format): `td.diff-text-cell` containing `<code class="diff-text …"><span class="diff-text-marker">+/-/ </span><div class="diff-text-inner">…</div></code>`
- Code cells (old format): `td.blob-code[data-diff-side]` with `.blob-code-marker` span
- Blank lines: `.diff-text-inner` is an empty `<div>`; detected via `isEmptyLine()` in `src/dom.js`
- Diff table: `table[data-diff-anchor][aria-label="Diff for: <path>"]`
- File region: `div[role="region"]`

See an example in `github_diff.html`

### Key functions (by module)

| Function                              | Module          | Purpose                                                               |
| ------------------------------------- | --------------- | --------------------------------------------------------------------- |
| `serializeState` / `deserializeState` | `src/storage.js`| Map ↔ JSON conversion                                                 |
| `handleLineNumberClick`               | `src/events.js` | Toggle a line reviewed on click (private, used inside bindLineNumberClicks) |
| `applyStateToDOM`                     | `src/visual.js` | Re-apply stored state as CSS classes after load/mutation              |
| `updateFileProgress`                  | `src/progress.js`| Recompute and render the `n/total` badge per file                    |
| `markCurrentLine`                     | `src/keyboard.js`| One-way mark (key `r`)                                               |
| `markAllInFileUntilHere`              | `src/keyboard.js`| Mark all lines above cursor (key `Shift+R`)                          |
| `navigateToUnreviewed`                | `src/keyboard.js`| Jump to next/prev unreviewed row (DOM-class-based, no state lookup)  |
| `bindLineNumberClicks`                | `src/events.js` | Attach click + hover listeners; idempotent via `data-reviewerBound`   |
| `initForCurrentPR`                    | `src/main.js`   | Bootstrap on load                                                     |
| `onURLChange`                         | `src/spa.js`    | Handle GitHub SPA navigation (turbo:load / title mutation / popstate) |
| `initCommentMenu`                     | `src/comment-menu.js` | Arm kebab-menu injection once per page session                  |
| `getThreadData`                       | `src/thread.js` | Comment element → ThreadData                                          |
| `getClassicThreadData`                | `src/thread-classic.js` | Classic review thread → partial ThreadData                      |
| `buildPrompt`                         | `src/prompt.js` | ThreadData → clipboard prompt string                                  |
| `extractHunk`                         | `src/diff-hunk.js` | Diff window: 3 context lines above → end of range                  |
| `getPRMeta` / `clearPRMetaCache`      | `src/pr-meta.js` | Cached repo/branches/PR-number lookup                                |

## Important conventions

- **Use `browser.*` API only** — this is a Firefox extension, not Chrome. Never use `chrome.*` or DOM `localStorage`.
- **GitHub uses Navigation API** — Detect SPA navigation via `window.navigation` events, not Turbo events. Fallbacks: title mutations and popstate.
- **`waitForDiffContent` is critical** — GitHub loads diffs progressively/lazily after page load. Always wait for diff tables to appear before binding events.
- **`applyStateToDOM` is additive** — it only adds `.pr-line-reviewed`, never removes.
  A full reset happens on page navigation.
- **`navigateToUnreviewed` is DOM-based** — it queries `.diff-line-row:not(.pr-line-reviewed)`.
  No need to touch stored state when modifying navigation.
- **Blank lines are ignored** — `isEmptyLine` / `isEmptyRow` (`src/dom.js`) detect lines whose `.diff-text-inner` is empty. Blank lines are excluded from state, progress counts, click handling, keyboard marking, and navigation. They receive `.pr-line-reviewed` visually (via `propagateReviewedAbove` in `src/visual.js`) only when the first non-blank line below them is marked.
- **`github_diff.html`** can be opened locally in Firefox to test DOM interactions without a live GitHub page.
- **Build step required** — edit files in `src/`, then run `npm run build` to regenerate `content-script.js`. Use `npm run watch` for auto-rebuild on save. Never edit `content-script.js` directly.
- **To reload the extension** after changes: `about:debugging` → This Firefox → Reload the extension.
- **Tests** — `npm test` runs `node --test "tests/**/*.test.js"` (jsdom against `pr-with-comments.html` for /changes and `pr-conversation-with-comments.html` for the Conversation tab). Node is mise-managed; use `mise exec -- npm test` if npm is off PATH.

## Storage format (current target: content-based)

```json
{
  "pr:owner/repo:123": {
    "src/app.js": {
      "L": ["line text A", "line text B"],
      "R": ["line text C"]
    }
  }
}
```

Old format used arrays of integers (line numbers). If detected on load, discard silently.
