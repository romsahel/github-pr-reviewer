export function parsePRFromURL(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], prNumber: m[3] };
}

/**
 * Wait for diff content to be present in the DOM
 * GitHub loads diffs progressively, so we need to wait for them to appear
 */
export function waitForDiffContent() {
  return new Promise((resolve) => {
    // Check if diff content already exists
    const checkForDiff = () => {
      const diffTables = document.querySelectorAll('table[data-diff-anchor]');
      const lineNumbers = document.querySelectorAll('td.new-diff-line-number[data-line-number]');

      if (diffTables.length > 0 && lineNumbers.length > 0) {
        return true;
      }
      return false;
    };

    if (checkForDiff()) {
      console.log('[PR Reviewer] Diff content already present');
      resolve();
      return;
    }

    console.log('[PR Reviewer] Diff content not ready, waiting...');

    // Set up observer to wait for diff content
    const observer = new MutationObserver(() => {
      if (checkForDiff()) {
        observer.disconnect();
        resolve();
      }
    });

    // Observe the most likely containers
    const container = document.querySelector('[data-testid="progressive-diffs-list"]')
      || document.querySelector('.js-diff-progressive-container')
      || document.querySelector('#files')
      || document.body;

    observer.observe(container, { childList: true, subtree: true });

    // Fallback timeout: initialize anyway after 5 seconds
    setTimeout(() => {
      console.log('[PR Reviewer] Timeout reached, initializing anyway');
      observer.disconnect();
      resolve();
    }, 5000);
  });
}

export function getFilePathForRow(tr) {
  const table = tr.closest('table[data-diff-anchor]');
  if (!table) return null;

  // Primary: aria-label="Diff for: <path>"
  const label = table.getAttribute('aria-label');
  if (label) {
    const prefix = 'Diff for: ';
    if (label.startsWith(prefix)) return label.slice(prefix.length).trim();
  }

  // Fallback: button[data-file-path] inside the file header region
  const region = table.closest('div[role="region"]');
  if (region) {
    const btn = region.querySelector('button[data-file-path]');
    if (btn) return btn.getAttribute('data-file-path');
  }

  return null;
}

export function getSideChar(td) {
  const side = td.getAttribute('data-diff-side');
  if (side === 'right') return 'R';
  if (side === 'left') return 'L';
  // Fallback: if no side attribute, treat as right (new file)
  return 'R';
}

export function getLineContent(td) {
  return td.nextElementSibling?.textContent ?? null;
}

export function findTableByFilePath(filePath) {
  // Fallback: search all file regions for matching button[data-file-path]
  const regions = document.querySelectorAll('div[role="region"]');
  for (const region of regions) {
    const btn = region.querySelector('button[data-file-path]');
    if (btn && btn.getAttribute('data-file-path') === filePath) {
      return region.querySelector('table[data-diff-anchor]');
    }
  }
  return null;
}

// aria-label attribute value contains special chars — use attribute selector safely
export function tableForFilePath(filePath) {
  const label = 'Diff for: ' + filePath;
  // Search all tables with data-diff-anchor attribute
  const tables = document.querySelectorAll('table[data-diff-anchor]');
  for (const t of tables) {
    if (t.getAttribute('aria-label') === label) return t;
  }
  return findTableByFilePath(filePath);
}
