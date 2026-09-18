// Browser-side extraction, used when there is no Node server behind the page —
// i.e. the GitHub Pages build. Same block pipeline as the server (blocks.js);
// only the fetching and DOM parsing differ.
//
// PRIVACY: a browser cannot fetch an arbitrary site directly (CORS), so the page
// has to relay the request through a public proxy. That means the address of every
// article you open this way is visible to a third party. Run `node server.js`
// locally instead and nothing leaves your machine.
const { toBlocks } = await import('./blocks.js' + new URL(import.meta.url).search);

// Tried in order. The list is deliberately more than one: these are free services
// that rate-limit, go down, or start demanding an API key without notice —
// corsproxy.io began returning 401 while this was being built.
// Tried in order. The list is deliberately more than one: these are free services
// that rate-limit, go down, or start demanding an API key without notice —
// corsproxy.io began returning 401 while this was being built, and allorigins and
// codetabs have both answered 522 for sites they could not reach.
const PROXIES = [
  {
    name: 'r.jina.ai',
    url: (u) => 'https://r.jina.ai/' + u,
    // html: so Readability still does the extraction rather than trusting the
    // proxy's own idea of what the article is.
    // no-cache: without it jina will happily serve a stale snapshot whose body is
    // empty, which looks like a successful fetch and yields a blank article.
    headers: { 'x-return-format': 'html', 'x-no-cache': 'true' },
  },
  { name: 'allorigins', url: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'codetabs', url: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
];

let ReadabilityCtor = null;
async function readability() {
  if (!ReadabilityCtor) {
    const mod = await import('https://cdn.jsdelivr.net/npm/@mozilla/readability@0.6.0/+esm');
    ReadabilityCtor = mod.Readability || mod.default?.Readability;
  }
  return ReadabilityCtor;
}

async function fetchVia(proxy, target) {
  const res = await fetch(proxy.url(target), {
    headers: proxy.headers || {},
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${proxy.name} returned ${res.status}`);
  const html = await res.text();
  if (html.trim().length < 500) throw new Error(`${proxy.name} returned no usable page`);
  return html;
}

function parseArticle(html, url) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  // Relative src/href in the fetched markup resolve against THIS page without a
  // base, which would point every image back at the reader's own origin.
  const base = dom.createElement('base');
  base.href = url;
  dom.head.prepend(base);

  const article = new ReadabilityCtor(dom).parse();
  if (!article || !article.textContent?.trim()) return null;
  return article;
}

export async function extractInBrowser(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported.');

  await readability();
  const failures = [];

  // A proxy answering 200 with the page shell and no article body is the failure
  // that actually bites: it looks like success. So each proxy's result is run all
  // the way through Readability, and only a real article ends the loop.
  for (const proxy of PROXIES) {
    let html;
    try {
      html = await fetchVia(proxy, url.href);
    } catch (err) {
      failures.push(err.message);
      continue;
    }
    const article = parseArticle(html, url.href);
    if (!article) {
      failures.push(`${proxy.name} returned a page with no article text`);
      continue;
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

  throw new Error(`no proxy could read it (${failures.join('; ')})`);
}
