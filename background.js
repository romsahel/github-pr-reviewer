/* GitHub PR Line Reviewer — background script */
'use strict';

const PR_FILES_PATTERN = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/changes/;

browser.commands.onCommand.addListener(async (command) => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return;

    const tab = tabs[0];
    if (!tab.url || !PR_FILES_PATTERN.test(tab.url)) return;

    await browser.tabs.sendMessage(tab.id, { type: 'command', command });
  } catch (e) {
    // Tab may not have content script loaded (e.g., restricted page)
    console.warn('[PR Reviewer BG] Could not forward command:', e);
  }
});
