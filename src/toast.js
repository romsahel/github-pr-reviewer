import { state } from './state.js';

// Fixed early milestones; beyond 250 every 250 lines is generated dynamically.
const FIXED_MILESTONES = [
  [10,  '10 lines reviewed!'],
  [25,  '25 lines reviewed!'],
  [50,  '50 lines reviewed — nice work!'],
  [100, '100 lines reviewed!'],
  [250, '250 lines reviewed — very thorough!'],
];

function dynamicMessage(n) {
  return `${n.toLocaleString()} lines reviewed!`;
}

export function showToast(message) {
  let toast = document.getElementById('pr-reviewer-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pr-reviewer-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

/** Pre-mark all milestones already surpassed so we don't re-toast them. */
export function initMilestones(totalLines) {
  state.shownMilestones = new Set();
  for (const [threshold] of FIXED_MILESTONES) {
    if (totalLines >= threshold) state.shownMilestones.add(threshold);
  }
  // Pre-seed all 250-multiples above 250 already surpassed
  const topBlock = Math.floor(totalLines / 250);
  for (let b = 2; b <= topBlock; b++) state.shownMilestones.add(b * 250);
}

/**
 * Call after adding one or more new lines.
 * prevCount = state.totalLinesEver before the addition.
 */
export function checkMilestone(prevCount) {
  const nextCount = state.totalLinesEver;

  // Fixed early milestones
  for (const [threshold, message] of FIXED_MILESTONES) {
    if (prevCount < threshold && nextCount >= threshold && !state.shownMilestones.has(threshold)) {
      state.shownMilestones.add(threshold);
      showToast(message);
      return;
    }
  }

  // Dynamic every-250 milestones above 250 (multiples of 250 starting at 500)
  const prevBlock = Math.floor(prevCount / 250);
  const nextBlock = Math.floor(nextCount / 250);
  if (nextCount > 250 && nextBlock > prevBlock) {
    const highest = nextBlock * 250;
    if (!state.shownMilestones.has(highest)) {
      // Mark all skipped 250-multiples as shown so they don't fire later
      for (let b = prevBlock + 1; b <= nextBlock; b++) state.shownMilestones.add(b * 250);
      showToast(dynamicMessage(highest));
    }
  }
}
