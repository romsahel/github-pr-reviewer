import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

// Parse the saved PR page (tryriot/parrot#16643 /changes) and install the
// browser globals src/ modules use. Call this BEFORE importing src modules —
// src/state.js reads location.href at import time, so use dynamic import() in
// tests after calling this.
export function installFixtureGlobals() {
  const html = readFileSync(new URL('../../pr-with-comments.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/tryriot/parrot/pull/16643/changes' });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  return dom.window;
}
