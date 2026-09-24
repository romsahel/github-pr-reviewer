import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFixtureGlobals } from './helpers/fixture.js';

installFixtureGlobals();
const { state } = await import('../src/state.js');
const { setLineVisualState, applyStateToDOM } = await import('../src/visual.js');
const { updateFileProgress } = await import('../src/progress.js');
const { getFilePathForRow, getLineKey, tableForFilePath } = await import('../src/dom.js');
const { bindLineNumberClicks } = await import('../src/events.js');

// Split-view row pairing a deletion (left) with an addition (right)
function findPairedRow() {
  for (const tr of document.querySelectorAll('tr.diff-line-row')) {
    if (tr.querySelector('code.diff-text.deletion') && tr.querySelector('code.diff-text.addition')) return tr;
  }
  return null;
}

function sideTd(tr, side) {
  return tr.querySelector(`td.new-diff-line-number[data-diff-side="${side}"][data-line-number]`);
}

beforeEach(() => {
  state.reviewState = new Map();
  for (const el of document.querySelectorAll('.pr-side-reviewed, .pr-line-reviewed')) {
    el.classList.remove('pr-side-reviewed', 'pr-line-reviewed');
  }
});

test('marking one side of a paired row marks only that side', () => {
  const tr = findPairedRow();
  assert.ok(tr, 'fixture has no paired split-view row');
  const left = sideTd(tr, 'left');
  const right = sideTd(tr, 'right');

  setLineVisualState(left, true);
  assert.ok(left.classList.contains('pr-side-reviewed'));
  assert.ok(left.nextElementSibling.classList.contains('pr-side-reviewed'), 'left code cell');
  assert.ok(!right.classList.contains('pr-side-reviewed'));
  assert.ok(!right.nextElementSibling.classList.contains('pr-side-reviewed'), 'right code cell');
  assert.ok(!tr.classList.contains('pr-line-reviewed'), 'half-reviewed row is not reviewed');
});

test('a paired row is reviewed once both sides are, and unmarking one side keeps the other', () => {
  const tr = findPairedRow();
  const left = sideTd(tr, 'left');
  const right = sideTd(tr, 'right');

  setLineVisualState(left, true);
  setLineVisualState(right, true);
  assert.ok(tr.classList.contains('pr-line-reviewed'));

  setLineVisualState(left, false);
  assert.ok(!tr.classList.contains('pr-line-reviewed'));
  assert.ok(!left.classList.contains('pr-side-reviewed'));
  assert.ok(right.classList.contains('pr-side-reviewed'));
});

test('a single-sided row is reviewed as soon as its side is marked', () => {
  const tr = Array.from(document.querySelectorAll('tr.diff-line-row')).find(
    (r) => r.querySelector('code.diff-text.addition') && !r.querySelector('code.diff-text.deletion'),
  );
  setLineVisualState(sideTd(tr, 'right'), true);
  assert.ok(tr.classList.contains('pr-line-reviewed'));
});

test('applyStateToDOM restores a stored left side without marking the right', () => {
  const tr = findPairedRow();
  const left = sideTd(tr, 'left');
  const right = sideTd(tr, 'right');
  const filePath = getFilePathForRow(tr);
  state.reviewState.set(filePath, { L: new Set([getLineKey(left)]), R: new Set() });

  applyStateToDOM();
  assert.ok(left.classList.contains('pr-side-reviewed'));
  assert.ok(!right.classList.contains('pr-side-reviewed'));
  assert.ok(!tr.classList.contains('pr-line-reviewed'));
});

test('file progress counts reviewed sides, not rows', () => {
  const tr = findPairedRow();
  const filePath = getFilePathForRow(tr);
  setLineVisualState(sideTd(tr, 'left'), true);

  updateFileProgress(filePath);
  const badge = tableForFilePath(filePath).closest('div[role="region"]').querySelector('.pr-reviewer-progress');
  assert.match(badge.textContent, /^1\/\d+$/);

  setLineVisualState(sideTd(tr, 'right'), true);
  updateFileProgress(filePath);
  assert.match(badge.textContent, /^2\/\d+$/);
});

test('hovering a side of a paired row targets that side for keyboard marking', () => {
  const tr = findPairedRow();
  const left = sideTd(tr, 'left');
  const right = sideTd(tr, 'right');
  // The fixture was saved with the extension running, so rows already carry the bound markers
  for (const el of [tr, ...tr.querySelectorAll('td')]) {
    delete el.dataset.reviewerBound;
    delete el.dataset.reviewerRowBound;
  }
  bindLineNumberClicks(tr.closest('table'));
  const hover = (el) => el.dispatchEvent(new document.defaultView.MouseEvent('mouseover', { bubbles: true }));

  hover(left.nextElementSibling.querySelector('.diff-text-inner'));
  assert.equal(state.lastHoveredTd, left);
  hover(right.nextElementSibling);
  assert.equal(state.lastHoveredTd, right);
});
