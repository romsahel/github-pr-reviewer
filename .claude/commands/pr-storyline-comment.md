---
name: pr-storyline-comment
description: Analyze a PR's changes, group files into dependency-ordered chapters with narratives, and post as a structured comment for the GitHub PR Line Reviewer extension
---

# PR Storyline Comment

Post a structured storyline comment on a GitHub PR so the **GitHub PR Line Reviewer** extension can reorder files into a narrative reading order with chapter annotations.

## Invocation

```
/pr-storyline-comment <PR_NUMBER>
```

The PR number is required.

## Process

### 1. Gather Context

1. Run `gh pr view <number> --json title,body,author,baseRefName,headRefName,changedFiles,additions,deletions` for PR metadata
2. Run `gh pr diff <number>` for the full diff
3. If the PR body references a Linear ticket (pattern: `INB-\d+`, `SON-\d+`, etc.), fetch ticket details for business context

### 2. Filter Out Noise

Exclude these files entirely — do not create chapters for them:

- Generated OpenAPI specs (e.g., `riot_openapi.json`)
- Translation files (`priv/gettext/**`)
- Lock files (`mix.lock`, `package-lock.json`, `yarn.lock`)
- Auto-generated schema dumps

### 3. Classify and Order Files

Group changed files into logical layers, then order chapters by dependency flow:

1. **Data Model** — Migrations, schemas
2. **Core Logic** — Context modules, domain services, workers/jobs
3. **API / Interface** — Controllers, views, plugs, router changes
4. **Configuration** — Config files, application setup
5. **Tests** — Mirror the order of the code they test

Within each layer, order by dependency: if module A defines a struct that module B uses, A comes first.

When changes span multiple layers for the same feature slice, prefer grouping by feature slice over strict layer ordering.

### 4. Build Dependency Graph

Before writing chapters:

- Identify new structs, types, or functions introduced in the diff
- Map which other changed files consume them
- Use this graph to determine chapter ordering and to write cross-references

### 5. Write Chapter Narratives

For each chapter:

- **Title**: Short, descriptive (e.g., "Data Model", "Evidence Highlighting Logic")
- **Narrative**: HTML string displayed inline on the GitHub diff page. Use formatting to make it scannable:
  - `<code>` for function names, module names, variables
  - `<strong>` for key concepts or warnings
  - `<em>` for emphasis
  - `<ul><li>` for listing multiple points
  - Keep it concise — the narrative is shown directly, not behind a fold
  - Cross-reference other chapters (e.g., "builds on the struct from Chapter 1")
  - Explain the "why", not just the "what"
- **Files**: List file paths exactly as they appear in the GitHub diff

Keep narratives proportional: a simple rename needs one sentence, a new GenServer needs a paragraph.

### 5b. Add Line Annotations

For each chapter, scan the diff hunks and pick 3-5 lines where something non-obvious happens. Add these as a `lines` array on the chapter.

**What to annotate:**
- Behavior changes disguised as refactors (e.g., removing `LIMIT 1` changes query cardinality)
- Subtle side effects
- Non-obvious patterns (metaprogramming, protocol dispatch, macro usage)
- Security or correctness implications

**Do NOT annotate:** trivial renames, obvious additions, boilerplate, test assertions, import changes.

Each annotation needs:
- `file`: the file path (must be in the chapter's `files` list)
- `side`: `"R"` for added/right side, `"L"` for removed/left side
- `lineNumber`: the line number as it appears in GitHub's diff gutter
- `note`: 1-2 sentence explanation of why this line matters

### 6. Check for Existing Comment

Before posting, check if a storyline comment already exists:

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments --jq '.[] | select(.body | contains("data-pr-storyline")) | .id'
```

- If found: update the existing comment using `gh api repos/{owner}/{repo}/issues/comments/{id} -X PATCH -f body="..."`
- If not found: create a new comment using `gh pr comment <number> --body "..."`

### 7. Post the Comment

Format the comment body as:

```html
<details><summary>PR Storyline</summary>
<pre data-pr-storyline>
{JSON}
</pre>
</details>
```

### JSON Schema

```json
{
  "version": 1,
  "pr": { "owner": "string", "repo": "string", "number": 123 },
  "summary": "1-2 sentence summary of the PR",
  "chapters": [
    {
      "title": "Chapter Title",
      "narrative": "Explanation of why these changes exist and how they connect to other chapters.",
      "files": ["path/to/file1.ex", "path/to/file2.ex"],
      "lines": [
        {
          "file": "path/to/file1.ex",
          "side": "R",
          "lineNumber": 42,
          "note": "Short explanation of why this line is non-obvious or important."
        }
      ]
    }
  ]
}
```

### 8. Output

Print a confirmation with the PR URL and the number of chapters created.
