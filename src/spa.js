import { state } from './state.js';
import { parsePRFromURL } from './dom.js';
import { buildStorageKey, loadState } from './storage.js';
import { bindLineNumberClicks } from './events.js';
import { applyStateToDOM } from './visual.js';
import { updateAllFileProgress } from './progress.js';
import { reapplyStoryline, resetStoryline, initStoryline } from './storyline.js';

let debounceTimer = null;
function debounce(fn, delay) {
  return function (...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const onDiffMutation = debounce(function () {
  bindLineNumberClicks();
  applyStateToDOM();
  updateAllFileProgress();
  reapplyStoryline();
}, 150);

export function startDiffObserver() {
  if (state.diffObserver) state.diffObserver.disconnect();

  const container = document.querySelector('[data-testid="progressive-diffs-list"]')
    || document.querySelector('.js-diff-progressive-container')
    || document.body;

  state.diffObserver = new MutationObserver(onDiffMutation);
  state.diffObserver.observe(container, { childList: true, subtree: true });
}

export async function onURLChange() {
  const currentURL = location.href;
  if (currentURL === state.lastURL) return;
  state.lastURL = currentURL;

  // Disconnect existing diff observer
  if (state.diffObserver) {
    state.diffObserver.disconnect();
    state.diffObserver = null;
  }

  const pr = parsePRFromURL(currentURL);
  if (!pr) return;

  const newKey = buildStorageKey(pr.owner, pr.repo, pr.prNumber);
  if (newKey !== state.storageKey) {
    state.storageKey = newKey;
    state.reviewState = await loadState(state.storageKey);
    resetStoryline();
  }

  bindLineNumberClicks();
  applyStateToDOM();
  updateAllFileProgress();
  startDiffObserver();
  await initStoryline();
}

export function startURLObserver() {
  // Primary: Navigation API (modern browsers, including Firefox 124+)
  if (window.navigation) {
    window.navigation.addEventListener('navigate', () => {
      onURLChange();
    });
  } else {
    console.warn('[PR Reviewer] Navigation API not available, using fallbacks');
  }
}
