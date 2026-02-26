export const state = {
  storageKey: null,
  reviewState: new Map(),
  saveTimer: null,
  lastHoveredTd: null,
  diffObserver: null,
  urlObserver: null,
  lastURL: location.href,
  totalLinesEver: 0,
  shownMilestones: new Set(),
};
