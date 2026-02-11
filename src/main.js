import { state } from './state.js';
import { parsePRFromURL } from './dom.js';
import { buildStorageKey, loadState } from './storage.js';
import { bindLineNumberClicks } from './events.js';
import { applyStateToDOM } from './visual.js';
import { updateAllFileProgress } from './progress.js';
import { onKeyDown, onMessage } from './keyboard.js';
import { startDiffObserver, startURLObserver } from './spa.js';

async function initForCurrentPR() {
  const pr = parsePRFromURL(location.href);
  if (!pr) {
    console.log('[PR Reviewer] Not a PR page, exiting');
    return;
  }

  console.log('[PR Reviewer] Parsed PR:', pr);
  state.storageKey = buildStorageKey(pr.owner, pr.repo, pr.prNumber);
  state.reviewState = await loadState(state.storageKey);

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
