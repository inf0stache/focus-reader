const $ = (id) => document.getElementById(id);
const WPM = 200;                 // for chunk sizing + time estimates
const CHUNK_WORDS = WPM * 2;     // ~2 minutes of reading per chunk

const THEMES = [
  ['paper', 'Paper'], ['cream', 'Cream'], ['mist', 'Mist'], ['sage', 'Sage'],
  ['dusk', 'Dusk'], ['ink', 'Ink'], ['contrast', 'Contrast'],
];

const DEFAULTS = {
  theme: 'paper', font: 'atkinson',
  size: 20, leading: 1.7, measure: 66, tracking: 0.02, wording: 0.06, paraGap: 1.4,
  focusMode: true, chunks: true, firstLine: true, prompts: true,
  ruler: false, bionic: false, hyphens: false,
  images: true, imgScale: 1, bionicStrength: 0.5,
  rate: 1,
};

// Typography presets. Individual tuning has a small measured benefit and a large
// fiddling cost — for an attention problem, a settings panel is somewhere to spend
// twenty minutes instead of reading. One click, then the sliders stay folded away.
const PRESETS = {
  comfort: { size: 20, leading: 1.7, measure: 66, tracking: 0.02, wording: 0.06, paraGap: 1.4 },
  large:   { size: 26, leading: 1.85, measure: 54, tracking: 0.04, wording: 0.1, paraGap: 1.8 },
  dense:   { size: 18, leading: 1.5, measure: 78, tracking: 0, wording: 0.02, paraGap: 1.0 },
};

const FONTS = {
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
  lexend: "'Lexend', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Source Serif 4', Georgia, serif",
};

let settings = { ...DEFAULTS, ...load() };
let doc = null;   // current article
// Per-article reading state. `read` is earned by dwelling on a block, not by
// scrolling past it — see the dwell tracker below.
let state = { read: new Set(), marks: new Set(), notes: {}, answers: {}, lastIndex: 0 };

function load() { try { return JSON.parse(localStorage.getItem('focus-reader') || '{}'); } catch { return {}; } }
function save() { try { localStorage.setItem('focus-reader', JSON.stringify(settings)); } catch {} }

/* ---------------- per-article progress ---------------- */
const PROG_KEY = 'focus-reader-progress';
const docKey = () => (doc ? doc.url || 'text:' + doc.title.slice(0, 60) : null);

function allProgress() { try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}'); } catch { return {}; } }

function saveProgress() {
  const key = docKey();
  if (!key) return;
  const all = allProgress();
  all[key] = {
    title: doc.title, words: doc.words, updatedAt: Date.now(),
    lastIndex: state.lastIndex,
    read: [...state.read], marks: [...state.marks],
    notes: state.notes, answers: state.answers,
  };
  // keep the store from growing without bound — 40 most recent articles
  const keys = Object.keys(all).sort((a, b) => all[b].updatedAt - all[a].updatedAt);
  for (const k of keys.slice(40)) delete all[k];
  try { localStorage.setItem(PROG_KEY, JSON.stringify(all)); } catch {}
}

function loadProgress() {
  const saved = allProgress()[docKey()];
  state = { read: new Set(), marks: new Set(), notes: {}, answers: {}, lastIndex: 0 };
  dwell = {};   // block indices are per-article; never carry them across a load
  if (!saved) return null;
  state.read = new Set(saved.read || []);
  state.marks = new Set(saved.marks || []);
  state.notes = saved.notes || {};
  state.answers = saved.answers || {};
  state.lastIndex = saved.lastIndex || 0;
  for (const i of state.read) dwell[i] = Infinity;
  return saved;
}

/* ---------------- settings → CSS ---------------- */
function apply() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  r.style.setProperty('--font', FONTS[settings.font]);
  r.style.setProperty('--size', settings.size + 'px');
  r.style.setProperty('--leading', settings.leading);
  r.style.setProperty('--measure', settings.measure + 'ch');
  r.style.setProperty('--tracking', settings.tracking + 'em');
  r.style.setProperty('--wording', settings.wording + 'em');
  r.style.setProperty('--para-gap', settings.paraGap + 'em');
  r.style.setProperty('--img-scale', settings.imgScale);
  r.style.setProperty('--bio-rest', 1 - 0.5 * settings.bionicStrength);

  document.body.classList.toggle('focus', settings.focusMode);
  document.body.classList.toggle('chunks', settings.chunks);
  document.body.classList.toggle('first-line', settings.firstLine);
  document.body.classList.toggle('justify', settings.hyphens);
  document.body.classList.toggle('no-images', !settings.images);
  document.body.classList.toggle('no-prompts', !settings.prompts);
  $('rulerBand').hidden = !settings.ruler;

  for (const k of ['size', 'leading', 'measure', 'tracking', 'wording', 'paraGap', 'rate', 'imgScale', 'bionicStrength']) $(k).value = settings[k];
  for (const k of ['focusMode', 'ruler', 'chunks', 'firstLine', 'bionic', 'hyphens', 'images', 'prompts']) $(k).checked = settings[k];
  $('font').value = settings.font;
  $('sizeOut').textContent = settings.size + 'px';
  $('leadingOut').textContent = (+settings.leading).toFixed(2);
  $('measureOut').textContent = settings.measure + ' ch';
  $('trackingOut').textContent = (+settings.tracking).toFixed(2) + 'em';
  $('wordingOut').textContent = (+settings.wording).toFixed(2) + 'em';
  $('paraGapOut').textContent = (+settings.paraGap).toFixed(1) + 'em';
  $('rateOut').textContent = (+settings.rate).toFixed(2) + '×';
  $('imgScaleOut').textContent = Math.round(settings.imgScale * 100) + '%';
  $('bionicStrengthOut').textContent = Math.round(settings.bionicStrength * 100) + '%';
  for (const el of document.querySelectorAll('.swatch')) el.setAttribute('aria-pressed', el.dataset.theme === settings.theme);
  save();
}

function set(key, value) { settings[key] = value; apply(); }

/* ---------------- rendering ---------------- */
// Bionic-style bolding: fixation-weight the opening of each word. Included because
// people ask for it; the controlled studies show no reliable speed/comprehension gain.
function bionic(text) {
  const frag = document.createDocumentFragment();
  const share = 0.3 + 0.25 * settings.bionicStrength;
  for (const token of text.split(/(\s+)/)) {
    if (!token.trim()) { frag.append(token); continue; }
    const letters = token.replace(/^\W+/, '');
    const n = Math.max(1, Math.round(letters.length * share));
    const cut = token.length - letters.length + n;
    const b = document.createElement('b');
    b.className = 'bio';
    b.textContent = token.slice(0, cut);
    const rest = document.createElement('span');
    rest.className = 'bio-rest';
    rest.textContent = token.slice(cut);
    frag.append(b, rest);
  }
  return frag;
}

const splitSentences = (t) => t.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [t];

// Every sentence gets its own span. That's what lets read-aloud highlight the line
// it is speaking (text + audio together is the best-supported support here), and it
// doubles as the first-sentence skim anchor.
function renderBody(text) {
  const frag = document.createDocumentFragment();
  splitSentences(text).forEach((sentence, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'sent lead' : 'sent';
    span.append(settings.bionic ? bionic(sentence) : document.createTextNode(sentence));
    frag.append(span);
  });
  return frag;
}

function figureFor(b) {
  const fig = document.createElement('figure');
  fig.className = 'blk image';
  const img = document.createElement('img');
  img.src = b.src;
  img.alt = b.alt || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  if (b.width) fig.style.setProperty('--nat-w', b.width + 'px');
  if (b.width && b.height) { img.width = b.width; img.height = b.height; }
  img.addEventListener('error', () => fig.remove(), { once: true });
  fig.addEventListener('click', () => fig.classList.toggle('zoom'));
  fig.title = 'Click to expand';
  fig.append(img);
  if (b.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = b.caption;
    fig.append(cap);
  }
  return fig;
}

// A break that asks you nothing is a horizontal rule. Interpolated retrieval —
// stopping to say what you just read — is the best-evidenced way to cut
// mind-wandering and keep what you read, so the chunk marker asks for a sentence.
function promptCard(n) {
  const card = document.createElement('section');
  card.className = 'chunk-card';
  const head = document.createElement('div');
  head.className = 'chunk';
  head.textContent = `break ${n} · ~2 min done`;
  card.append(head);

  const body = document.createElement('div');
  body.className = 'ask';
  const q = document.createElement('label');
  q.textContent = 'In one sentence — what was that about?';
  q.htmlFor = 'ask' + n;
  const ta = document.createElement('textarea');
  ta.id = 'ask' + n;
  ta.rows = 2;
  ta.placeholder = 'No marks for style. Writing it is the point.';
  ta.value = state.answers[n] || '';
  ta.addEventListener('input', () => {
    state.answers[n] = ta.value;
    card.classList.toggle('answered', !!ta.value.trim());
    saveProgress(); renderKeep();
  });
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'ghost small';
  skip.textContent = 'Skip';
  skip.addEventListener('click', () => card.classList.add('collapsed'));
  body.append(q, ta, skip);
  card.append(body);
  if (state.answers[n]?.trim()) card.classList.add('answered');
  return card;
}

function render() {
  if (!doc) return;
  const content = $('content');
  content.textContent = '';

  $('meta').innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = doc.title;
  const sub = document.createElement('div');
  sub.className = 'sub';
  const mins = Math.max(1, Math.round(doc.words / WPM));
  sub.textContent = [doc.siteName, doc.byline, `${doc.words.toLocaleString()} words · ~${mins} min`].filter(Boolean).join(' · ');
  $('meta').append(h1, sub);

  let running = 0, chunkNo = 1;
  doc.blocks.forEach((b, i) => {
    if (b.type === 'para' && running >= CHUNK_WORDS) {
      content.append(promptCard(chunkNo++));
      running = 0;
    }
    if (b.type === 'image') {
      const fig = figureFor(b);
      fig.dataset.i = i;
      content.append(fig);
      return; // pictures don't add reading time, so they don't move the chunk counter
    }
    const tag = b.type === 'heading' ? 'h' + (b.level || 2) : b.type === 'list' ? 'li' : b.type === 'code' ? 'pre' : 'p';
    const el = document.createElement(tag);
    el.className = `blk ${b.type}`;
    el.dataset.i = i;
    if (b.type === 'code') el.textContent = b.text;
    else el.append(renderBody(b.text));
    if (state.marks.has(i)) el.classList.add('marked');
    if (state.read.has(i)) el.classList.add('read');
    content.append(el);
    if (state.notes[i]) content.append(noteEl(i, state.notes[i]));
    running += b.text.split(/\s+/).length;
  });

  $('empty').hidden = true;
  $('article').hidden = false;
  renderKeep();
  updateActive();
  updateProgress();
}

/* ---------------- marks + notes ---------------- */
function noteEl(i, text) {
  const wrap = document.createElement('div');
  wrap.className = 'note-block';
  wrap.dataset.for = i;
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = text;
  ta.placeholder = 'Your note…';
  ta.addEventListener('input', () => {
    if (ta.value.trim()) state.notes[i] = ta.value; else delete state.notes[i];
    saveProgress(); renderKeep();
  });
  wrap.append(ta);
  return wrap;
}

function toggleMark(el) {
  if (!el) return;
  const i = +el.dataset.i;
  if (state.marks.has(i)) { state.marks.delete(i); el.classList.remove('marked'); }
  else { state.marks.add(i); el.classList.add('marked'); }
  saveProgress(); renderKeep();
}

function addNote(el) {
  if (!el) return;
  const i = +el.dataset.i;
  let node = document.querySelector(`.note-block[data-for="${i}"]`);
  if (!node) {
    state.notes[i] = state.notes[i] || '';
    node = noteEl(i, state.notes[i]);
    el.after(node);
  }
  node.querySelector('textarea').focus();
}

// Working memory is the thing that goes first. Anything you marked or wrote gets
// collected at the end so the article leaves something behind.
function renderKeep() {
  const box = $('keep');
  if (!doc) return;
  box.innerHTML = '';
  const marks = [...state.marks].sort((a, b) => a - b);
  const notes = Object.keys(state.notes).map(Number).filter((i) => (state.notes[i] || '').trim()).sort((a, b) => a - b);
  const answers = Object.keys(state.answers).filter((n) => (state.answers[n] || '').trim());
  if (!marks.length && !notes.length && !answers.length) { box.hidden = true; return; }
  box.hidden = false;

  const h = document.createElement('h3');
  h.textContent = 'What you kept';
  box.append(h);

  for (const n of answers) {
    const p = document.createElement('p');
    p.className = 'keep-answer';
    p.textContent = `Break ${n}: ${state.answers[n].trim()}`;
    box.append(p);
  }
  for (const i of marks) {
    const p = document.createElement('p');
    p.className = 'keep-mark';
    p.textContent = (doc.blocks[i]?.text || '').slice(0, 240);
    if ((state.notes[i] || '').trim()) {
      const n = document.createElement('span');
      n.className = 'keep-note';
      n.textContent = ' — ' + state.notes[i].trim();
      p.append(n);
    }
    box.append(p);
  }
  for (const i of notes) {
    if (marks.includes(i)) continue;
    const p = document.createElement('p');
    p.className = 'keep-note-only';
    p.textContent = state.notes[i].trim();
    box.append(p);
  }
}

/* ---------------- focus + honest progress ---------------- */
function blocks() { return [...document.querySelectorAll('#content .blk')]; }

let activeEl = null, activeSince = 0;

function updateActive() {
  const target = innerHeight * 0.38;
  let best = null, bestDist = Infinity;
  const list = blocks();
  const atTop = scrollY <= 4;
  const atBottom = scrollY + innerHeight >= document.body.scrollHeight - 4;
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    // At the very top or bottom of the article there is nothing above or below to
    // scroll to, so the 38% band would strand focus in the middle of the screen —
    // which reads as "it started me halfway down the page". Pin to the ends.
    if (atTop) { best = el; break; }
    if (atBottom) { best = el; continue; }
    const d = Math.abs(r.top - target);
    if (d < bestDist) { bestDist = d; best = el; }
  }
  if (best !== activeEl) {
    commitDwell();
    activeEl = best;
    activeSince = performance.now();
    if (best) state.lastIndex = +best.dataset.i;
  }
  for (const el of list) el.classList.toggle('active', el === best);
}

// Scrolling is not reading. Progress counts a block only once you have actually sat
// on it for about half the time it would take to read — so the bar cannot be
// gamed by flicking to the bottom, and it doubles as a zone-out signal.
let dwell = {};
const wordsIn = (i) => (doc.blocks[i]?.text || '').split(/\s+/).filter(Boolean).length;
// 40% of the time the text would take to read at 200wpm. Below that you were
// looking at it, not reading it.
const dwellNeeded = (i) => Math.max(700, (wordsIn(i) / WPM) * 60000 * 0.4);

function commitDwell() {
  if (!activeEl || !doc) return;
  const i = +activeEl.dataset.i;
  const block = doc.blocks[i];
  if (!block || block.type === 'image') return;
  dwell[i] = (dwell[i] || 0) + (performance.now() - activeSince);
  activeSince = performance.now();
  if (dwell[i] >= dwellNeeded(i) && !state.read.has(i)) {
    state.read.add(i);
    activeEl.classList.add('read');
  }
  updateProgress();
}

// Partial credit, so the bar actually moves while you read a long paragraph — but
// it moves at the speed of reading, not the speed of the scroll wheel.
function readWords() {
  let n = 0;
  const counted = new Set();
  for (const i of state.read) { n += wordsIn(i); counted.add(i); }
  for (const k of Object.keys(dwell)) {
    const i = +k;
    if (counted.has(i)) continue;
    n += wordsIn(i) * Math.min(1, dwell[i] / dwellNeeded(i));
  }
  return n;
}

function updateProgress() {
  if (!doc) return;
  const pct = doc.words > 0 ? Math.min(100, (readWords() / doc.words) * 100) : 0;
  $('progress').firstElementChild.style.width = pct + '%';
  $('progress').title = `${Math.round(pct)}% actually read`;
}

setInterval(() => { if (doc) { commitDwell(); saveProgress(); } }, 2000);

addEventListener('scroll', () => requestAnimationFrame(updateActive), { passive: true });
addEventListener('resize', updateActive);
addEventListener('beforeunload', () => { if (doc) { commitDwell(); saveProgress(); } });

addEventListener('pointermove', (e) => {
  if (!settings.ruler) return;
  $('rulerBand').style.top = (e.clientY - 22) + 'px';
}, { passive: true });

/* ---------------- loading ---------------- */
function toast(msg, ms = 4000) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

function offerResume(saved) {
  const bar = $('resume');
  if (!saved || !saved.lastIndex) { bar.hidden = true; return; }
  const words = (saved.read || []).reduce((n, i) => n + (doc.blocks[i]?.text || '').split(/\s+/).length, 0);
  const pct = saved.words ? Math.round((words / saved.words) * 100) : 0;
  $('resumeText').textContent = `You were ${pct}% through this. Pick up where you stopped?`;
  bar.hidden = false;
}

function jumpTo(i) {
  const el = document.querySelector(`#content .blk[data-i="${i}"]`);
  if (el) el.scrollIntoView({ block: 'center' });
}

// The Node server does the fetching when there is one. On a static host (GitHub
// Pages) there isn't, so the page falls back to extracting in the browser through
// a public proxy — same pipeline, worse privacy, and the UI says so.
let serverless = null;

async function extractViaServer(url) {
  const res = await fetch('/api/extract?url=' + encodeURIComponent(url));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

async function extractAnyhow(url) {
  if (serverless !== true) {
    try {
      const data = await extractViaServer(url);
      serverless = false;
      return data;
    } catch (err) {
      // A 404/HTML response or a network failure means no extractor behind this
      // page; a real extraction error (the server answered with JSON) should not
      // silently fall through to the proxy.
      if (serverless === false) throw err;
      if (err instanceof SyntaxError || /fetch|network|failed/i.test(err.message)) serverless = true;
      else throw err;
    }
  }
  const { extractInBrowser } = await import('./extract-client.js');
  $('proxyNote').hidden = false;
  return extractInBrowser(url);
}

async function loadUrl(url) {
  $('loadBtn').disabled = true;
  toast('Fetching and stripping the page…', 30000);
  try {
    doc = await extractAnyhow(url);
    const saved = loadProgress();
    render();
    scrollTo({ top: 0 });
    offerResume(saved);
    $('toast').hidden = true;
  } catch (err) {
    toast('Could not read that page: ' + err.message + ' — try the Text button and paste it in.', 8000);
  } finally {
    $('loadBtn').disabled = false;
  }
}

function loadRaw(text) {
  const paras = text.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!paras.length) return;
  doc = {
    title: paras[0].slice(0, 90), siteName: 'Pasted text', byline: '', url: '',
    blocks: paras.map((t) => ({ type: 'para', text: t })),
    words: text.trim().split(/\s+/).length,
  };
  const saved = loadProgress();
  render();
  scrollTo({ top: 0 });
  offerResume(saved);
}

/* ---------------- read aloud, synced to the text ---------------- */
// Hearing and seeing the same sentence at once is the strongest-supported support
// in this app for inattentive reading, so it lives in the top bar and highlights
// the line it is on rather than reading into the void.
let speechQueue = [], speechPos = 0;

function sentencesFrom(startEl) {
  const all = [...document.querySelectorAll('#content .blk .sent')];
  if (!startEl) return all;
  const first = all.findIndex((s) => startEl.contains(s));
  return first < 0 ? all : all.slice(first);
}

function speak() {
  if (!doc || !('speechSynthesis' in window)) return toast('Speech synthesis is unavailable in this browser.');
  stopSpeech();
  speechQueue = sentencesFrom(activeEl);
  speechPos = 0;
  document.body.classList.add('speaking');
  speakNext();
}

function highlightSentence(span) {
  for (const s of document.querySelectorAll('.sent.speaking')) s.classList.remove('speaking');
  if (!span) return;
  span.classList.add('speaking');
  const r = span.getBoundingClientRect();
  if (r.top < innerHeight * 0.15 || r.bottom > innerHeight * 0.85) span.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function speakNext() {
  const span = speechQueue[speechPos];
  if (!span) return stopSpeech();
  // Highlight as we queue the line rather than waiting for onstart: Chrome withholds
  // that event until audio is actually allowed to play, and a silent, unhighlighted
  // page is the one failure mode this feature cannot have.
  highlightSentence(span);
  const u = new SpeechSynthesisUtterance(span.textContent);
  u.rate = +settings.rate;
  let started = false;
  u.onstart = () => { started = true; };
  u.onend = () => { speechPos++; if (document.body.classList.contains('speaking')) speakNext(); };
  u.onerror = () => { started = true; stopSpeech(); toast('The browser blocked speech — click Listen again.'); };
  speechSynthesis.speak(u);
  setTimeout(() => {
    if (!started && document.body.classList.contains('speaking')) {
      stopSpeech();
      toast('Your browser needs a click before it will speak — press Listen again.', 6000);
    }
  }, 2500);
}

function stopSpeech() {
  speechSynthesis.cancel();
  document.body.classList.remove('speaking');
  highlightSentence(null);
}

/* ---------------- wiring ---------------- */
const themeBox = $('themes');
for (const [id, label] of THEMES) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.theme = id;
  b.textContent = label;
  b.title = label;
  b.addEventListener('click', () => set('theme', id));
  themeBox.append(b);
}
for (const el of themeBox.children) {
  const probe = document.createElement('div');
  probe.dataset.theme = el.dataset.theme;
  probe.style.display = 'none';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  el.style.background = cs.getPropertyValue('--bg') || '';
  el.style.color = cs.getPropertyValue('--muted') || '';
  probe.remove();
}

for (const btn of document.querySelectorAll('.preset')) {
  btn.addEventListener('click', () => { Object.assign(settings, PRESETS[btn.dataset.preset]); apply(); });
}

$('loadForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('urlInput').value.trim();
  if (v) loadUrl(/^https?:\/\//i.test(v) ? v : 'https://' + v);
});

$('panelBtn').addEventListener('click', () => {
  const p = $('panel');
  p.hidden = !p.hidden;
  $('panelBtn').setAttribute('aria-expanded', String(!p.hidden));
});

$('pasteTextBtn').addEventListener('click', () => $('textDialog').showModal());
$('textDialog').addEventListener('close', () => {
  if ($('textDialog').returnValue === 'ok') loadRaw($('rawText').value);
});

$('resumeGo').addEventListener('click', () => { jumpTo(state.lastIndex); $('resume').hidden = true; });
$('resumeDismiss').addEventListener('click', () => { $('resume').hidden = true; });

for (const k of ['size', 'leading', 'measure', 'tracking', 'wording', 'paraGap', 'rate', 'imgScale']) {
  $(k).addEventListener('input', (e) => set(k, +e.target.value));
}
$('bionicStrength').addEventListener('input', (e) => { set('bionicStrength', +e.target.value); if (settings.bionic) render(); });
for (const k of ['focusMode', 'ruler', 'chunks', 'firstLine', 'hyphens', 'images', 'prompts']) {
  $(k).addEventListener('change', (e) => set(k, e.target.checked));
}
$('bionic').addEventListener('change', (e) => { set('bionic', e.target.checked); render(); });
$('font').addEventListener('change', (e) => set('font', e.target.value));
$('reset').addEventListener('click', () => { settings = { ...DEFAULTS }; apply(); render(); });
$('speak').addEventListener('click', speak);
$('stopSpeak').addEventListener('click', stopSpeech);

addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, textarea, select')) return;
  const list = blocks();
  const i = list.findIndex((el) => el.classList.contains('active'));
  if (e.key === 'j' || e.key === 'ArrowDown') { list[i + 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.preventDefault(); }
  if (e.key === 'k' || e.key === 'ArrowUp') { list[i - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.preventDefault(); }
  if (e.key === 'f') set('focusMode', !settings.focusMode);
  if (e.key === 's') $('panelBtn').click();
  if (e.key === 'h') { toggleMark(activeEl); e.preventDefault(); }
  if (e.key === 'n') { addNote(activeEl); e.preventDefault(); }
  if (e.key === 'a') { document.body.classList.contains('speaking') ? stopSpeech() : speak(); }
});

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

apply();
