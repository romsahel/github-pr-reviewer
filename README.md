# GitHub PR Line-by-Line Reviewer

A Firefox extension that lets you mark individual diff lines as reviewed while going through a pull request. State persists across reloads and navigations.

## Why I built this

GitHub's built-in "viewed" toggle works at the file level — too coarse for serious review work. I built this extension to solve three personal pain points:

- **Impatience** — I have a tendency to skip ahead while reviewing. Explicitly marking a line as reviewed forces me to consciously read it before moving on.
- **Review flow** — I like to follow the code as I review: when a function is called, I jump to its definition to understand the implementation. That kind of non-linear reading makes it hard to remember where I was and what I'd already covered.
- **Interruptions** — I sometimes get interrupted mid-review. File-level tracking isn't bite-sized enough to resume confidently; line-level state lets me pick up exactly where I left off.

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

### Build environment

- **OS:** macOS, Linux, or Windows (WSL recommended on Windows)
- **Node.js:** v18 or later — download from [nodejs.org](https://nodejs.org) or install via [nvm](https://github.com/nvm-sh/nvm)
- **npm:** bundled with Node.js (no separate install needed)
- **Build tool:** [esbuild](https://esbuild.github.io) v0.25 — installed automatically via `npm install`

### Build steps

```bash
# 1. Install build dependencies (only needed once)
npm install

# 2. Bundle src/ → content-script.js
npm run build
```

The only generated file is `content-script.js`. All other extension files (`background.js`, `options.js`, `options.html`, `styles.css`, `manifest.json`, `icons/`) are plain, unprocessed sources.

During development, use `npm run watch` to rebuild automatically on every save.

### Package the `.xpi`

```bash
npm run package
```

This builds first, then zips everything (excluding `node_modules/`, `src/`, and other non-extension files) into `gh-pr-reviewer.xpi`.

### Package sources for Mozilla review

```bash
npm run source-zip
```

Produces `gh-pr-reviewer-sources.zip` containing `src/`, static extension files, `package.json`, `package-lock.json`, and this README — everything needed to reproduce the build.

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
