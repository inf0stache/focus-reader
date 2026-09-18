import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { toBlocks } from './public/blocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function extract(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported.');

  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Many publishers serve a stripped page to unknown agents.
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Site returned ${res.status} ${res.statusText}`);

  const html = await res.text();
  const dom = new JSDOM(html, { url: res.url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent?.trim()) {
    throw new Error('Could not find readable article text on that page.');
  }

  return {
    title: article.title || url.hostname,
    byline: article.byline || '',
    siteName: article.siteName || url.hostname,
    url: res.url,
    blocks: toBlocks(new JSDOM(`<body>${article.content}</body>`, { url: res.url }).window.document.body),
    words: article.textContent.trim().split(/\s+/).length,
  };
}


const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://localhost:${PORT}`);

  if (pathname === '/api/extract') {
    const target = searchParams.get('url');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    try {
      if (!target) throw new Error('Missing ?url=');
      res.end(JSON.stringify(await extract(target)));
    } catch (err) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    const body = await fs.readFile(file);
    res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Reader running at http://localhost:${PORT}`));
