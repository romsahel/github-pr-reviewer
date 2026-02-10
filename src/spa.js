import { state } from './state.js';
import { parsePRFromURL } from './dom.js';
import { buildStorageKey, loadState } from './storage.js';
import { bindLineNumberClicks } from './events.js';
import { applyStateToDOM } from './visual.js';
import { updateAllFileProgress } from './progress.js';

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
  }

  bindLineNumberClicks();
  applyStateToDOM();
  updateAllFileProgress();
  startDiffObserver();
}

export function startURLObserver() {
  // GitHub uses Turbo/Hotwire — listen for turbo:load
  document.addEventListener('turbo:load', onURLChange);

  // Fallback: observe title changes
  if (state.urlObserver) state.urlObserver.disconnect();
  const titleEl = document.querySelector('title');
  if (titleEl) {
    state.urlObserver = new MutationObserver(() => {
      if (location.href !== state.lastURL) onURLChange();
    });
    state.urlObserver.observe(titleEl, { childList: true });
  }

  // Fallback: popstate (back/forward navigation)
  window.addEventListener('popstate', onURLChange);
}
