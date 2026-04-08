# PR Storyline Integration

Integrate Claude's `/pr-storyline` analysis with the GitHub PR Line Reviewer extension so that files on a PR's `/changes` tab are reordered into a narrative reading order with chapter annotations — keeping the native GitHub diff UI.

## Flow

1. User runs `/pr-storyline-comment 123` in Claude Code
2. Skill analyzes the PR diff, groups files into dependency-ordered chapters, writes narratives
3. Skill posts a collapsed `<details>` comment on the PR containing a structured JSON
4. User visits the PR's `/changes` tab in Firefox
5. Extension fetches the conversation page (same-origin), extracts the JSON from `[data-pr-storyline]`
6. Extension reorders file regions in the DOM to match chapter order and injects chapter banners
7. A toggle button lets the user switch between storyline and default order

## Two independent pieces

### Piece 1: Skill (`/pr-storyline-comment`)

A new skill in this repo (`skills/pr-storyline-comment/SKILL.md`) that takes a PR number and:

1. Fetches PR metadata via `gh pr view <number> --json title,body,author,baseRefName,headRefName`
2. Fetches diff via `gh pr diff <number>`
3. Classifies files into logical layers (data model, core logic, API, config, tests)
4. Builds a dependency graph between changed files
5. Orders files into chapters with titles and narratives
6. Posts the comment via `gh pr comment <number> --body "..."`

If a storyline comment already exists (previous run), edits the existing comment via `gh api repos/{owner}/{repo}/issues/{number}/comments` rather than posting a duplicate.

Key difference from `/pr-storyline`: no HTML, no review agents, no diff rendering. Just analysis + ordering + narratives + one API call. Much faster.

### Piece 2: Extension changes

New module `src/storyline.js` integrated into the existing architecture.

## JSON Schema

Posted inside the PR comment as:

```html
<details>
  <summary>PR Storyline</summary>
  <pre data-pr-storyline>
{ JSON here }
</pre
  >
</details>
```

JSON structure:

```json
{
  "version": 1,
  "pr": { "owner": "acme", "repo": "app", "number": 123 },
  "summary": "Adds evidence highlighting with new schema, context, and API endpoint.",
  "chapters": [
    {
      "title": "Data Model",
      "narrative": "Introduces the Evidence schema and migration. The `status` enum drives visibility rules used in Chapter 2.",
      "files": [
        "priv/repo/migrations/20240601_create_evidence.exs",
        "lib/app/evidence.ex"
      ]
    },
    {
      "title": "Core Logic",
      "narrative": "The EvidenceContext module builds on the schema from Chapter 1. Uses Oban for async processing.",
      "files": [
        "lib/app/evidence_context.ex",
        "lib/app/workers/evidence_worker.ex"
      ]
    }
  ]
}
```

- `version` for future schema changes
- `files` arrays match GitHub's diff file paths (`button[data-file-path]` / `aria-label="Diff for: ..."`)
- Files not listed in any chapter remain at the bottom in original order
- Cross-references in narratives are plain text (e.g., "Chapter 2"); extension auto-links them

## Extension Architecture

### `src/storyline.js`

**Data fetching & caching:**

- `fetchStoryline(owner, repo, prNumber)` — fetches the conversation page (`/owner/repo/pull/123`), parses out `pre[data-pr-storyline]`, returns parsed JSON or `null`. Same-origin fetch, no CORS issues, works for private repos (user is already authenticated via cookies).
- Caches result in `browser.storage.local` under `storyline:owner/repo:123`
- Re-fetches if cached storyline is older than 1 hour

**DOM reordering:**

- `applyStorylineOrder(storylineData)` — finds each file's `div[role="region"]` by matching file paths against `button[data-file-path]`, reorders them using `insertBefore` on their parent container
- Files not in any chapter stay at the bottom in original order
- Stores references to original DOM order for toggle restore

**Chapter banners:**

- Injects `div.pr-storyline-chapter` before each chapter's first file region
- Contains chapter number + title in bold
- Collapsible narrative via `<details>` (collapsed by default)
- Cross-references like "Chapter 2" auto-linked to scroll to that chapter's banner

**Toggle button:**

- Added near the top of the diff page (near file filter controls)
- Toggles between storyline order and default order
- When toggling off: removes chapter banners, restores original DOM order
- State persisted in `browser.storage.local`

**Auto-activation:**

- On page load, if a storyline comment is detected, storyline mode activates automatically
- Toggle provides escape hatch to default order

### Integration with existing modules

- Called from `initForCurrentPR()` in `src/main.js` after existing init
- `MutationObserver` in `src/spa.js` re-applies storyline order when new diffs lazy-load (moves new file regions into their chapter position)
- No changes to review state, progress, or keyboard navigation — those work on whatever DOM order is present

## Styles

Follows existing theme token pattern with light/dark variants:

**Chapter banners:**

- New tokens: `--pr-storyline-chapter-bg`, `--pr-storyline-chapter-fg`, `--pr-storyline-chapter-bd`
- Full-width bar matching GitHub file header weight
- Left border accent using `--pr-indicator-color` (existing blue)

**Toggle button:**

- Matches GitHub's diff toolbar button style
- Active state indicates storyline mode is on

**Narrative text:**

- Muted color, slightly smaller font
- Cross-reference links styled like GitHub internal links

No new animations — should feel native to GitHub's UI.
