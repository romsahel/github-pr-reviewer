import { state } from './state.js';

export function buildStorageKey(owner, repo, prNumber) {
  return `pr:${owner}/${repo}:${prNumber}`;
}

export function serializeState(reviewState) {
  const obj = {};
  for (const [filePath, sides] of reviewState) {
    obj[filePath] = {
      L: Array.from(sides.L).sort(),
      R: Array.from(sides.R).sort(),
    };
  }
  return obj;
}

export function deserializeState(obj) {
  const map = new Map();
  if (!obj || typeof obj !== 'object') return map;
  function isLegacy(arr) { return arr.length > 0 && typeof arr[0] === 'number'; }
  for (const [filePath, sides] of Object.entries(obj)) {
    map.set(filePath, {
      L: new Set(!isLegacy(sides.L) && Array.isArray(sides.L) ? sides.L : []),
      R: new Set(!isLegacy(sides.R) && Array.isArray(sides.R) ? sides.R : []),
    });
  }
  return map;
}

export async function loadState(key) {
  try {
    const result = await browser.storage.local.get(key);
    return deserializeState(result[key]);
  } catch (e) {
    console.warn('[PR Reviewer] Failed to load state:', e);
    return new Map();
  }
}

export function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persistState, 300);
}

export async function persistState() {
  if (!state.storageKey) return;
  try {
    await browser.storage.local.set({ [state.storageKey]: serializeState(state.reviewState) });
  } catch (e) {
    console.warn('[PR Reviewer] Failed to save state:', e);
  }
}

export function getOrCreateFileSides(filePath) {
  if (!state.reviewState.has(filePath)) {
    state.reviewState.set(filePath, { L: new Set(), R: new Set() });
  }
  return state.reviewState.get(filePath);
}
