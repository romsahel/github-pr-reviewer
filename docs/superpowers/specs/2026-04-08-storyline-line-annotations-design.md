# Storyline Line Annotations

Add sparse, AI-driven inline annotations to specific diff lines within the storyline integration. Annotations explain non-obvious behavior at the line level — the "why is this line surprising" that chapter narratives don't cover.

## JSON Schema Extension

The `chapters` array gains an optional `lines` field:

```json
{
  "chapters": [
    {
      "title": "Core Logic",
      "narrative": "...",
      "files": ["lib/inbox_settings.ex"],
      "lines": [
        {
          "file": "lib/inbox_settings.ex",
          "side": "R",
          "lineNumber": 170,
          "note": "Query switches from Repo.one to Repo.all — this is what enables per-source lookups."
        }
      ]
    }
  ]
}
```

- `file`: must match one of the chapter's `files`
- `side`: `"L"` (removed) or `"R"` (added)
- `lineNumber`: the line number as shown in GitHub's diff gutter (`data-line-number`)
- `note`: short annotation text (1-2 sentences max)

## Skill Changes

The `/pr-storyline-comment` skill gets an additional instruction in its chapter-writing step: after grouping files and writing narratives, scan each chapter's diff hunks and pick 3-5 lines per chapter where something non-obvious happens. Examples of what to annotate:

- Behavior changes disguised as refactors
- Subtle side effects (e.g., removing `LIMIT 1` changes cardinality)
- Non-obvious patterns (metaprogramming, protocol dispatch)
- Security or correctness implications

Do not annotate: trivial renames, obvious additions, boilerplate, test assertions.

## Extension Changes

### `src/storyline.js`

New function `injectLineAnnotations(data)`:

1. For each chapter's `lines` array, find the target `<tr>` using existing DOM selectors: `td.new-diff-line-number[data-line-number="${lineNumber}"][data-diff-side="${side === 'R' ? 'right' : 'left'}"]` scoped to the file's diff table
2. Create a new `<tr class="pr-storyline-annotation">` with a single `<td colspan="...">` containing the note text
3. Insert it after the target row using `targetRow.after(annotationRow)`
4. On restore (toggle off): remove all `.pr-storyline-annotation` rows

Called from `applyStorylineOrder` after file reordering is complete. Removed in `restoreOriginalOrder` and `removeChapterBanners`.

### `styles.css`

New styles for `.pr-storyline-annotation`:
- Left border accent matching `--pr-storyline-bd` (same blue as chapter banners)
- Muted background using `--pr-storyline-bg`
- Smaller font size, muted text color
- Light/dark theme support via existing token pattern

## Density

Sparse: 3-5 annotations per chapter, targeting only non-obvious lines. The chapter narrative already provides the overview — line annotations are surgical callouts.
