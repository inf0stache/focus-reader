// Shared by the Node server and the static browser build — no Node or DOM-library
// imports may appear in this file.
// Strip wiki/journal citation markers — pure visual noise mid-sentence.
const clean = (s) =>
  s.replace(/\[\d+(,\s*\d+)*\]/g, '').replace(/\[\s*edit\s*\]/gi, '').replace(/\s+/g, ' ').trim();

// Flatten Readability's HTML into a simple block list the client can render safely:
// no scripts, no ads, no sticky junk — the clutter is half the reading problem.
// `body` is a parsed <body> element — JSDOM's on the server, DOMParser's in the
// browser. Keeping the DOM construction outside means one implementation of the
// block pipeline serves both, instead of two that drift apart.
export function toBlocks(body) {
  const blocks = [];
  const usedCaptions = new WeakSet();
  const selector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, img';

  for (const el of body.querySelectorAll(selector)) {
    if (el.tagName === 'IMG') {
      const img = toImage(el, usedCaptions);
      if (img) blocks.push(img);
      continue;
    }
    if (el.tagName === 'FIGCAPTION' && usedCaptions.has(el)) continue; // already attached to its image
    if (el.closest('li') && el.tagName === 'P') continue; // avoid duplicating list text
    const text = clean(el.textContent);
    if (!text || text.length < 2) continue;
    const tag = el.tagName.toLowerCase();
    const h = /^h([1-6])$/.exec(tag);
    const pseudo = !h && tag === 'p' && isPseudoHeading(el, text);
    const type = h || pseudo ? 'heading' : tag === 'li' ? 'list' : tag === 'blockquote' ? 'quote' : tag === 'pre' ? 'code' : 'para';
    const block = { type, text: tag === 'pre' ? el.textContent : text };
    // Keep the level: a flat run of same-looking headings is as shapeless as none.
    if (type === 'heading') block.level = h ? Math.min(4, Math.max(2, +h[1])) : 3;
    blocks.push(block);
  }
  return blocks;
}

// Plenty of blogs and CMS exports mark a section break with a fully-bolded short
// paragraph instead of a real heading. Without this the article arrives as one
// undifferentiated wall — which is precisely the thing that loses an ADHD reader.
function isPseudoHeading(el, text) {
  if (text.length > 80 || /[.!?,;:]$/.test(text)) return false;
  if (!/^[A-Z0-9"'“]/.test(text) || text.split(/\s+/).length < 2) return false;

  const strong = [...el.querySelectorAll('strong, b, em')];
  if (strong.length) {
    const marked = clean(strong.map((n) => n.textContent).join(' '));
    if (marked.length >= text.length - 2) return true; // the whole line is emphasised
  }
  // A short, unpunctuated line standing on its own in front of real prose is a
  // section break the author never marked up. Requiring a long paragraph after it
  // keeps ordinary short sentences out.
  const next = el.nextElementSibling;
  return !!next && next.tagName === 'P' && clean(next.textContent).length > 120;
}

// Images that carry meaning are worth keeping; spacers, tracking pixels, icons and
// avatars are exactly the competing salient stimuli this tool exists to remove.
function toImage(el, usedCaptions) {
  const raw = el.getAttribute('src') || el.getAttribute('data-src') || pickFromSrcset(el);
  if (!raw || raw.startsWith('data:')) return null;

  let src;
  try { src = new URL(raw, el.ownerDocument.baseURI).href; } catch { return null; }
  if (!/^https?:$/.test(new URL(src).protocol)) return null;
  if (/\b(spacer|pixel|1x1|blank|avatar|icon|logo|badge|emoji)\b/i.test(src)) return null;

  const w = +el.getAttribute('width') || 0;
  const h = +el.getAttribute('height') || 0;
  if ((w && w < 120) || (h && h < 120)) return null; // thumbnails and decoration

  const figure = el.closest('figure');
  const cap = figure?.querySelector('figcaption');
  if (cap) usedCaptions.add(cap);

  return {
    type: 'image',
    src,
    alt: clean(el.getAttribute('alt') || ''),
    caption: clean(cap?.textContent || ''),
    width: w || null,
    height: h || null,
  };
}

// Responsive images often leave src empty and put the real candidates in srcset;
// take the widest one so the picture survives a big font size / wide measure.
function pickFromSrcset(el) {
  const set = el.getAttribute('srcset') || el.getAttribute('data-srcset');
  if (!set) return null;
  let best = null, bestW = -1;
  for (const part of set.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const width = size?.endsWith('w') ? parseInt(size) : 0;
    if (width >= bestW) { bestW = width; best = url; }
  }
  return best;
}


