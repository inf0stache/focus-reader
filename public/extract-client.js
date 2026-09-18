// Browser-side extraction, used when there is no Node server behind the page —
// i.e. the GitHub Pages build. Same block pipeline as the server (blocks.js);
// only the fetching and DOM parsing differ.
//
// PRIVACY: a browser cannot fetch an arbitrary site directly (CORS), so the page
// has to relay the request through a public proxy. That means the address of every
// article you open this way is visible to a third party. Run `node server.js`
// locally instead and nothing leaves your machine.
import { toBlocks } from './blocks.js';

const PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
];

let ReadabilityCtor = null;
async function readability() {
  if (!ReadabilityCtor) {
    const mod = await import('https://cdn.jsdelivr.net/npm/@mozilla/readability@0.6.0/+esm');
    ReadabilityCtor = mod.Readability || mod.default?.Readability;
  }
  return ReadabilityCtor;
}

async function fetchHtml(target) {
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(target), { signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`proxy returned ${res.status}`);
      const html = await res.text();
      if (html.trim()) return html;
      throw new Error('empty response');
    } catch (err) { lastErr = err; }
  }
  throw new Error(`Could not fetch that page (${lastErr?.message || 'no proxy responded'}).`);
}

export async function extractInBrowser(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported.');

  const html = await fetchHtml(url.href);
  const dom = new DOMParser().parseFromString(html, 'text/html');

  // Relative src/href in the fetched markup resolve against THIS page without a
  // base, which would point every image back at the reader's own origin.
  const base = dom.createElement('base');
  base.href = url.href;
  dom.head.prepend(base);

  const Readability = await readability();
  const article = new Readability(dom).parse();
  if (!article || !article.textContent?.trim()) {
    throw new Error('Could not find readable article text on that page.');
  }

  const holder = new DOMParser().parseFromString(
    `<html><head><base href="${url.href}"></head><body>${article.content}</body></html>`, 'text/html');

  return {
    title: article.title || url.hostname,
    byline: article.byline || '',
    siteName: article.siteName || url.hostname,
    url: url.href,
    blocks: toBlocks(holder.body),
    words: article.textContent.trim().split(/\s+/).length,
  };
}
