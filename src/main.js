import { state } from './state.js';
import { parsePRFromURL } from './dom.js';
import { buildStorageKey, loadState } from './storage.js';
import { bindLineNumberClicks } from './events.js';
import { applyStateToDOM } from './visual.js';
import { updateAllFileProgress } from './progress.js';
import { onKeyDown, onMessage } from './keyboard.js';
import { startDiffObserver, startURLObserver } from './spa.js';
import { initMilestones } from './toast.js';

async function initForCurrentPR() {
  const pr = parsePRFromURL(location.href);
  if (!pr) {
    console.log('[PR Reviewer] Not a PR page, exiting');
    return;
  }

  console.log('[PR Reviewer] Parsed PR:', pr);
  state.storageKey = buildStorageKey(pr.owner, pr.repo, pr.prNumber);
  state.reviewState = await loadState(state.storageKey);

  // Compute global total across all PRs for milestone tracking
  try {
    const allData = await browser.storage.local.get(null);
    let total = 0;
    for (const [key, prData] of Object.entries(allData)) {
      if (!key.startsWith('pr:') || typeof prData !== 'object') continue;
      for (const sides of Object.values(prData)) {
        total += (sides.L || []).length + (sides.R || []).length;
      }
    }
    state.totalLinesEver = total;
    initMilestones(total);
  } catch (e) {
    state.totalLinesEver = 0;
    initMilestones(0);
  }

  bindLineNumberClicks();
  applyStateToDOM();
  updateAllFileProgress();
  startDiffObserver();
  console.log('[PR Reviewer] Initialization complete!');
}

document.addEventListener('keydown', onKeyDown);
browser.runtime.onMessage.addListener(onMessage);
startURLObserver();
console.log('[PR Reviewer] Starting initialization...');
initForCurrentPR();
