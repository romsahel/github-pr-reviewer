import { state } from './state.js';
import { parsePRFromURL } from './dom.js';

// Breadth-first search for the first object carrying headBranch/baseBranch.
// Exported for tests.
export function findBranches(payload) {
  const queue = [payload];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (typeof node.headBranch === 'string' && typeof node.baseBranch === 'string') {
      return { sourceBranch: node.headBranch, targetBranch: node.baseBranch };
    }
    for (const value of Object.values(node)) queue.push(value);
  }
  return null;
}

function branchesFromEmbeddedJSON() {
  const scripts = document.querySelectorAll(
    'script[type="application/json"][data-target="react-app.embeddedData"],' +
      'script[type="application/json"][data-target="react-partial.embeddedData"]'
  );
  for (const script of scripts) {
    try {
      const found = findBranches(JSON.parse(script.textContent));
      if (found) return found;
    } catch {
      // not the payload we want — keep looking
    }
  }
  return null;
}

function branchesFromHeader() {
  // The PR header renders base then head: <a data-component="BranchName">…
  const names = document.querySelectorAll('a[data-component="BranchName"]');
  if (names.length < 2) return null;
  return {
    targetBranch: names[0].textContent.trim(),
    sourceBranch: names[1].textContent.trim(),
  };
}

// Cached per PR and validated against the current URL, so SPA navigation to
// another PR can never serve stale metadata. A result with unresolved
// branches is NOT cached — GitHub loads content progressively, so a later
// call may succeed.
export function getPRMeta() {
  const pr = parsePRFromURL(location.href);
  if (!pr) return null;
  const cached = state.prMeta;
  if (
    cached &&
    cached.owner === pr.owner &&
    cached.repo === pr.repo &&
    cached.prNumber === pr.prNumber
  ) {
    return cached;
  }
  const branches = branchesFromEmbeddedJSON() || branchesFromHeader();
  const meta = {
    owner: pr.owner,
    repo: pr.repo,
    prNumber: pr.prNumber,
    prUrl: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.prNumber}`,
    sourceBranch: branches?.sourceBranch ?? null,
    targetBranch: branches?.targetBranch ?? null,
  };
  if (branches) state.prMeta = meta;
  return meta;
}

export function clearPRMetaCache() {
  state.prMeta = null;
}
