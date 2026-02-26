/* GitHub PR Line Reviewer — options page */
'use strict';

const elStatPRs = document.getElementById('stat-prs');
const elStatFiles = document.getElementById('stat-files');
const elStatLines = document.getElementById('stat-lines');
const elPRList = document.getElementById('pr-list');
const elStatus = document.getElementById('status-msg');
const btnExport = document.getElementById('btn-export');
const btnClear = document.getElementById('btn-clear');

function setStatus(msg, isError) {
  elStatus.textContent = msg;
  elStatus.style.color = isError ? '#cf222e' : '#1a7f37';
}

function extractPRKey(storageKey) {
  // storageKey format: "pr:owner/repo:123"
  const m = storageKey.match(/^pr:(.+):(\d+)$/);
  if (!m) return null;
  return { repo: m[1], prNumber: m[2] };
}

function computeStats(allData) {
  let prCount = 0;
  let fileCount = 0;
  let lineCount = 0;

  for (const [key, prData] of Object.entries(allData)) {
    if (!key.startsWith('pr:')) continue;
    prCount++;
    for (const [, sides] of Object.entries(prData)) {
      if (typeof sides !== 'object' || sides === null || Array.isArray(sides)) continue;
      fileCount++;
      lineCount += (sides.L || []).length + (sides.R || []).length;
    }
  }

  return { prCount, fileCount, lineCount };
}

function renderPRList(allData) {
  const prEntries = Object.entries(allData).filter(([k]) => k.startsWith('pr:'));

  if (prEntries.length === 0) {
    elPRList.innerHTML = '<li id="pr-list-empty" style="color:#57606a;font-style:italic">No pull requests tracked yet.</li>';
    return;
  }

  elPRList.innerHTML = '';
  for (const [key, prData] of prEntries) {
    const parsed = extractPRKey(key);
    if (!parsed) continue;

    const fileSides = Object.values(prData).filter(s => typeof s === 'object' && s !== null && !Array.isArray(s));
    const fileCount = fileSides.length;
    const lineCount = fileSides.reduce((sum, s) => sum + (s.L || []).length + (s.R || []).length, 0);

    const li = document.createElement('li');

    const keySpan = document.createElement('span');
    keySpan.className = 'pr-key';
    keySpan.textContent = `${parsed.repo} #${parsed.prNumber}`;
    li.appendChild(keySpan);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'pr-meta';
    metaSpan.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''}, ${lineCount} line${lineCount !== 1 ? 's' : ''}`;
    li.appendChild(metaSpan);

    elPRList.appendChild(li);
  }
}

async function loadAndRender() {
  try {
    const allData = await browser.storage.local.get(null);
    const { prCount, fileCount, lineCount } = computeStats(allData);

    elStatPRs.textContent = prCount;
    elStatFiles.textContent = fileCount;
    elStatLines.textContent = lineCount;

    renderPRList(allData);
  } catch (e) {
    setStatus('Failed to load data: ' + e.message, true);
  }
}

btnExport.addEventListener('click', async () => {
  try {
    const allData = await browser.storage.local.get(null);
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pr-reviewer-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported successfully.');
  } catch (e) {
    setStatus('Export failed: ' + e.message, true);
  }
});

btnClear.addEventListener('click', async () => {
  if (!confirm('Clear ALL reviewed line data for all pull requests? This cannot be undone.')) return;
  try {
    await browser.storage.local.clear();
    setStatus('All data cleared.');
    await loadAndRender();
  } catch (e) {
    setStatus('Failed to clear: ' + e.message, true);
  }
});

loadAndRender();
