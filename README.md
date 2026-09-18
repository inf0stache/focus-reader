# Focus Reader

Paste a link. The page gets stripped to its text and re-typeset with controls that
actually have evidence behind them, plus attention scaffolding.

## Run it locally (recommended)

```bash
npm install
node server.js       # http://localhost:4321
```

The Node server does the fetching and extraction (Mozilla Readability) — a browser
page can't fetch arbitrary sites itself because of CORS. Everything else is client-side,
and your reading state persists in localStorage.

## The hosted version

`public/` is deployed to GitHub Pages on every push to `main`. Pages is static hosting,
so there is no server there to do the fetching. The page detects that and falls back to
extracting in the browser: same block pipeline (`public/blocks.js` is shared by both
paths), with Readability loaded from a CDN and the article fetched through a public
CORS proxy.

**That fallback has a privacy cost.** The proxy sees the address of every article you
open. Nothing else leaves your browser — reading position, highlights, notes and recall
answers are all localStorage — but the URLs are visible to a third party, and the hosted
page says so when it switches to that mode. If that matters to you, run it locally;
the local server does its own fetching and no one else is in the loop.

## Keyboard

| key | action |
| --- | --- |
| `j` / `↓` | next paragraph |
| `k` / `↑` | previous paragraph |
| `f` | toggle focus mode |
| `s` | toggle settings |
| `h` | highlight the current paragraph |
| `n` | add a note to it |
| `a` | read aloud from here / stop |

## What this is actually for

Typography is not the bottleneck for an attention problem. You can already read a
sentence; the thread goes at minute seven. So the features that do the real work here
are the ones that make reading *active* and *accountable* — recall prompts at every
break, progress that counts dwell instead of scroll, a saved place to come back to,
and somewhere to put what you want to keep. The spacing controls are table stakes,
not the intervention.

## What the research actually supports

**Spacing beats fonts.** The single most-cited "dyslexia font" study (Rello &
Baeza-Yates) found no reading-speed advantage for OpenDyslexic over ordinary
sans-serifs. Inter-letter and inter-word spacing, line height (1.4–1.6×+) and
font size (18–20px) are what move readability. Hence: those are the top controls,
and font choice is demoted to a dropdown.

**Line length matters for attention specifically.** 60–70 characters. The
return-sweep at the end of a long line is the most common place gaze drops out.

**Presentation medium and spacing interact with sustained attention.** Shany &
Breznitz-style work on adolescents with and without ADHD found significant
interaction between presentation type, spacing, and sustained-attention level on
comprehension — i.e. the format effect is *larger* for low-sustained-attention
readers, which is the whole premise of this tool.

**Clutter removal is an intervention.** Stripping nav, ads, sidebars, citation
markers and `[edit]` links removes competing salient stimuli. This is free and
uncontroversial.

**Chunking + progress is a task-initiation aid, not a reading aid.** For ADHD,
"a 40-minute article" often fails before the first word. ~2-minute chunk markers
and a progress bar target that, not decoding.

**Interpolated recall is the strongest lever in the app.** Stopping periodically to
say what you just read is among the best-replicated ways to cut mind-wandering and
improve what survives — far better supported than any typographic control here. So
every chunk break asks for one sentence rather than drawing a horizontal rule. It is
skippable, because a support you resent is a support you turn off.

**Progress counts reading, not scrolling.** A bar driven by scroll position rewards
flicking to the bottom, which is exactly the behaviour to avoid. A block only counts
once you have dwelt on it for ~40% of the time it would take to read at 200wpm, and
credit accrues continuously while you sit there.

**Losing your place ends the session.** Reading position, highlights, notes and recall
answers persist per URL (last 40 articles), so a long read can survive being
interrupted — which it will be.

**Configuration is a procrastination surface.** Individual typographic tuning has a
small measured benefit and an unbounded fiddling cost. Presets are up front; the
sliders are folded away; bionic, the ruler and justification sit under
"Experimental — weak or no evidence".

**Images are kept, but filtered and optional.** Figures that carry meaning are part of
comprehension; spacers, icons, avatars, logos and sub-120px decoration are exactly the
competing salient stimuli the extraction exists to remove, so they're dropped. Captions
travel with their image, dimensions are reserved to prevent mid-read reflow, and a single
toggle strips every picture for readers who want text only. An **Image size** slider runs
60–250%: at 100% an image sits at its natural size capped to the column, and above that it
breaks out past the measure, centred — the text column the eye tracks never changes width.
Clicking any image expands it to the window.

**Dual-channel (read + listen) is well supported** for readers with attention and
reading difficulties; the read-aloud panel uses the browser's speech synthesis.

**Bionic Reading is included and labeled as unproven.** Eye-tracking studies found
no reliable speed or comprehension gain (and longer reading times in some
conditions); EEG work found no added benefit for ADHD readers specifically. It
remains popular and subjectively helpful to some people, so it's a toggle that's
off by default with the caveat in the UI.

**No pure white on black, no pure black on white.** Both extremes draw complaints
from readers with visual stress; every theme sits inside those bounds.

### Sources
- Możina, Kovačević & Blaznik (2025), *Usability of Bionic Reading on Different Mediums: Eye-Tracking Study* — https://journals.sagepub.com/doi/10.1177/21582440251376158
- *Guiding the Gaze: How Bionic Reading Influences Eye Movements* — https://pmc.ncbi.nlm.nih.gov/articles/PMC12565662/
- *Reading with Diversity in Mind: Pupillometry and Typography Towards Inclusive Design for ADHD Readers*, CHI 2026 — https://dl.acm.org/doi/full/10.1145/3772363.3799383
- *The role of sustained attention and display medium in reading comprehension among adolescents with ADHD and without it* — https://www.sciencedirect.com/science/article/abs/pii/S0891422212002272
- Rello & Baeza-Yates line/letter spacing work, *Annals of Dyslexia* — https://link.springer.com/article/10.1007/s11881-020-00194-x
- *Evidence-Based Reading Instruction for Students with Inattention* (ERIC) — https://files.eric.ed.gov/fulltext/ED623377.pdf
- *Can Bionic Reading make you a speed reader? Not so fast* — https://theconversation.com/can-bionic-reading-make-you-a-speed-reader-not-so-fast-183905

## Limits

- Paywalled and heavily JS-rendered pages won't extract — use the **Text** button and paste.
- No PDF support yet.
