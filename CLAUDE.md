# GitHub PR Line Reviewer — Developer Notes

## What this is
A Firefox WebExtension (Manifest V2) that lets users mark individual diff lines as
reviewed on GitHub PR `/changes` pages. State persists across page reloads and
navigations using `browser.storage.local`.

## File map
| File | Role |
|---|---|
| `content-script.js` | All core logic — state, DOM binding, keyboard nav |
| `background.js` | Forwards keyboard commands (`Alt+R`, etc.) to content script |
| `styles.css` | Visual styles: `.pr-line-reviewed`, `.pr-reviewer-progress`, `.pr-line-flash` |
| `options.html/js` | Stats page: view/export/clear all stored review data |
| `manifest.json` | MV2, Firefox only (`gecko` min 126), matches `*/pull/*/changes*` |
| `github_diff.html` | Local GitHub diff fixture for manual testing without a live PR |

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
- Code cells: `td.blob-code[data-diff-side]`
- Diff marker (inside code cell): `.blob-code-marker` span (+/-/space)
- Diff table: `table[data-diff-anchor][aria-label="Diff for: <path>"]`
- File region: `div[role="region"]`

### Key functions in `content-script.js`
| Function | Lines | Purpose |
|---|---|---|
| `serializeState` / `deserializeState` | ~22–43 | Map ↔ JSON conversion |
| `handleLineNumberClick` | ~138 | Toggle a line reviewed on click |
| `applyStateToDOM` | ~177 | Re-apply stored state as CSS classes after load/mutation |
| `updateFileProgress` | ~223 | Recompute and render the `n/total` badge per file |
| `markCurrentLine` | ~336 | One-way mark (key `r`) |
| `markAllInFileUntilHere` | ~354 | Mark all lines above cursor (key `Shift+R`) |
| `navigateToUnreviewed` | ~394 | Jump to next/prev unreviewed row (DOM-class-based, no state lookup) |
| `bindLineNumberClicks` | ~115 | Attach click + hover listeners; idempotent via `data-reviewerBound` |
| `initForCurrentPR` | ~549 | Bootstrap on load |
| `onURLChange` | ~503 | Handle GitHub SPA navigation (turbo:load / title mutation / popstate) |

## Important conventions
- **Use `browser.*` API only** — this is a Firefox extension, not Chrome. Never use
  `chrome.*` or DOM `localStorage`.
- **`applyStateToDOM` is additive** — it only adds `.pr-line-reviewed`, never removes.
  A full reset happens on page navigation.
- **`navigateToUnreviewed` is DOM-based** — it queries `.diff-line-row:not(.pr-line-reviewed)`.
  No need to touch stored state when modifying navigation.
- **`github_diff.html`** can be opened locally in Firefox to test DOM interactions
  without a live GitHub page.
- **No build step** — plain JS/CSS, loaded directly by the extension.
- **To reload the extension** after changes: `about:debugging` → This Firefox →
  Reload the extension.

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
