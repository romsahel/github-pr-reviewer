import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const FIXTURES = {
  // /changes tab of tryriot/parrot#16643 (React diff view)
  changes: {
    file: '../../pr-with-comments.html',
    url: 'https://github.com/tryriot/parrot/pull/16643/changes',
  },
  // Conversation tab of tryriot/outlook-addin-phishing-reporter#268 (classic timeline)
  conversation: {
    file: '../../pr-conversation-with-comments.html',
    url: 'https://github.com/tryriot/outlook-addin-phishing-reporter/pull/268',
  },
};

// Parse a saved PR page and install the browser globals src/ modules use.
// Call this BEFORE importing src modules — src/state.js reads location.href
// at import time, so use dynamic import() in tests after calling this.
export function installFixtureGlobals(name = 'changes') {
  const { file, url } = FIXTURES[name];
  const html = readFileSync(new URL(file, import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  return dom.window;
}
