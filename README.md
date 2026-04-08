# GitHub PR Line-by-Line Reviewer

A Firefox extension that lets you mark individual diff lines as reviewed while going through a pull request. State persists across reloads and navigations.

## Why I built this

GitHub's built-in "viewed" toggle works at the file level — too coarse for serious review work. I built this extension to solve three personal pain points:

- **Impatience** — I have a tendency to skip ahead while reviewing. Explicitly marking a line as reviewed forces me to consciously read it before moving on.
- **Review flow** — I like to follow the code as I review: when a function is called, I jump to its definition to understand the implementation. That kind of non-linear reading makes it hard to remember where I was and what I'd already covered.
- **Interruptions** — I sometimes get interrupted mid-review. File-level tracking isn't bite-sized enough to resume confidently; line-level state lets me pick up exactly where I left off.

## Features

### Line-level review tracking

- **Click any line number** to toggle it as reviewed (light blue highlight)
- **`r`** — mark the hovered line as reviewed (works anywhere on the diff row)
- **`Shift+R`** — mark all lines from the last reviewed line (or file start) up to the current line
- Blank lines are automatically excluded from tracking and progress counts

### Navigation

- **`Shift+N`** / **`Shift+P`** — jump to next / previous unreviewed line (wraps around, flashes the target line)
- **`Alt+R`**, **`Shift+Alt+N`**, **`Shift+Alt+P`** — browser-level commands (work even when the page doesn't have focus)

All keyboard shortcuts can be customized from `about:addons` → GitHub PR Line Reviewer → Settings.
- **`Alt+D`** — toggle GitHub's native "Viewed" checkbox for the current file

### Progress tracking

- **Per-file badge** next to each filename showing reviewed / total lines (color-coded: gray → yellow → green)
- When all lines in a file are reviewed, GitHub's "Viewed" checkbox is automatically checked

### Persistence

- Review state is saved per PR to `browser.storage.local` with a 300 ms debounce
- Lines are identified by number + content, so state survives minor rebases via a two-pass fallback matcher
- SPA navigation within GitHub is detected automatically — no need to reload the page

### Milestones

- Tracks total lines reviewed across all PRs
- Toast notifications at 10, 25, 50, 100, 250 lines — then every 250 lines after that

### Dark mode

- Full dark-mode support, respecting GitHub's theme settings (`prefers-color-scheme` and `data-color-mode`)

### Options page

- **Stats dashboard** — total PRs tracked, files reviewed, lines reviewed
- **PR list** — per-PR breakdown with file and line counts
- **Export** — download all review data as JSON
- **Clear** — wipe all stored data (with confirmation)

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
