# GitHub PR Line-by-Line Reviewer

A Firefox extension that lets you mark individual diff lines as reviewed while going through a pull request. State persists across reloads and navigations.

## Features

- **Click any line number** to mark it as reviewed (light blue highlight + ✓)
- **Click again** to unmark
- **Keyboard shortcuts** (work anywhere on the diff row, no need to hover the line number):
  - `r` — mark the hovered line as reviewed
  - `Shift+R` — mark all lines up to and including the current line (in the current file)
  - `Shift+N` / `Shift+P` — jump to next / previous unreviewed line
- **Per-file progress badge** showing how many lines you've reviewed
- **Persistent state** — survives page reloads and SPA navigations within GitHub
- **Options page** — view stats, export data as JSON, or clear everything

## Setup

Requires [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/firefox/nightly/) for permanent installation without Mozilla signing.

**Dependencies:** [Node.js](https://nodejs.org) (for the build step). Runtime has no dependencies.

### Build

```bash
cd github-pr-reviewer
npm install        # install esbuild (one-time)
npm run build      # bundle src/ → content-script.js
```

During development, use `npm run watch` to rebuild automatically on every save.

### Package the `.xpi`

```bash
npm run package
```

This builds first, then zips everything (excluding `node_modules/`, `src/`, and other non-extension files) into `gh-pr-reviewer.xpi`.

## Installation

### Permanent (Firefox Developer Edition / Nightly)

1. Open `about:config` and set `xpinstall.signatures.required` → `false`
2. Open `about:addons` → gear icon → **Install Add-on From File**
3. Select `gh-pr-reviewer.xpi`

The extension will survive browser restarts.

### Temporary (any Firefox, for testing)

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
2. Select `github-pr-reviewer/manifest.json`

The extension is removed when Firefox is closed.

### Permanent in regular Firefox (via Mozilla signing)

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org)
2. Go to **Developer Hub** → **Submit a New Add-on** → **On your own** (unlisted)
3. Upload `gh-pr-reviewer.xpi` — Mozilla signs it automatically
4. Download and install the signed `.xpi` in any Firefox build
