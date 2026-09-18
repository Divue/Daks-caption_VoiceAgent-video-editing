# Landing page (apps/web)

Frontend notes for the landing page at `/`. Visual rules come from `.claude/design.md`. The first
viewport follows the voice-orb reference the team picked for the hero.

## Routes
- `/`: the landing page (`apps/web/src/pages/LandingPage.tsx`). It holds no state: no `ProjectProvider` and no backend calls.
- `/editor`: the editor (`apps/web/src/App.tsx`), wrapped in `ProjectProvider`. It shares this page's theme; see `docs/editor-ui.md`.

## Page order
| Anchor | Section | File |
| --- | --- | --- |
| `#top` | Voice orb hero: grid, stars, dot sphere, four effect chips, scripted voice demo | `HeroSection.tsx` |
| `#product` | Headline (`h1`), CTAs, the demo clip in 1:1 / 9:16 / 16:9 over the waveform | `IntroSection.tsx` |
| `#how-it-works` | Five product panels: upload, transcript, signals, captions, voice edit | `PipelineSection.tsx` |
| `#ai-editing` | Voice editing: pick a Hinglish command, see its steps and the caption before and after | `AiEditingSection.tsx` |
| `#templates` | The four real presets from `@captions/shared` rendering the same line | `CaptionStylesSection.tsx` |
| — | Closing CTA with a small idle orb | `FinalCtaSection.tsx` |

The navbar and footer share their links through `landing-links.ts`.

## Dark theme and tokens
The whole app is dark. `apps/web/index.html` sets `<html class="dark theme-brand">`, and the `.theme-brand`
block in `apps/web/src/index.css` maps the design.md palette onto the shadcn tokens: canvas, surfaces,
hairlines, `signal` (coral) and `precision` (cyan). The editor uses the same theme; see `docs/editor-ui.md`.

These Tailwind utilities come from that theme: `bg-surface`, `bg-surface-raised`, `bg-overlay`,
`border-hairline`, `border-hairline-strong`, `text-faint`, `*-signal`, `*-signal-dim`, `*-precision`,
`*-precision-dim`, `*-success`, and `font-display` (General Sans). `font-mono` is JetBrains Mono.

**Effect colours:** the four hero effects use the reference's hues, defined in
`components/captions/caption-effects.ts`: shake `#FF6B4A` (the same as signal), stretch `#7C82F0`, scale up
`#9A7CF0` and glow `#EC5B93`. These go beyond the design.md palette, so they are kept to the effect chips,
their connectors, the orb's rim tint and the editor's layer tags.

Fonts load in `apps/web/index.html`: Inter, JetBrains Mono, Poppins, Anton and Instrument Serif from Google
Fonts, and General Sans from Fontshare. Anton and Instrument Serif are there for the Kathmandu preset.
Komika Axis (MrBeast) is not loaded, so it falls back to Poppins.

## Components (`apps/web/src/components/landing/`)
| File | What it does |
| --- | --- |
| `HeroSection.tsx` | Orb stage (16:9 on desktop; on mobile the orb stacks over a 2×2 chip grid), command chip, status, mic button |
| `VoiceOrb.tsx` | Canvas dot sphere (Fibonacci lattice). Ripples with `energy` and tints its rim with `tint`. Stops off-screen and in hidden tabs |
| `EffectChip.tsx` | Effect pill: tinted icon disc and mono label. `active` lights it up |
| `EffectConnectors.tsx` | SVG dashed lines from each chip's node into the orb. The active line brightens and its dashes flow inward |
| `HeroGridBackdrop.tsx` | Hairline grid, deterministic star field, soft light behind the orb |
| `IntroSection.tsx` | Headline, caption-layer chips, CTAs, `CaptionShowcase` |
| `HeroSignalBackdrop.tsx` | Dot grid, low coral glow and the waveform band with a playhead (behind the intro) |
| `CaptionShowcase.tsx` / `CaptionedVideo.tsx` | The demo clip in three shapes, with captions synced to playback |
| `PipelineSection.tsx` / `PipelineSurfaces.tsx` | The five "How it works" cards and their small product panels |
| `SectionHeader.tsx` | Eyebrow, display headline and lede, used by every section. Reveals itself on scroll |
| `SectionSeam.tsx` | Hairline divider with a coral glow node. Draws itself in on scroll |
| `AnimatedSection.tsx` / `reveal-classes.ts` | Scroll-reveal wrapper and the shared child animations (see Motion) |
| `VideoFrame.tsx` / `video-shapes.ts` | Dark size-container frame for `portrait \| square \| landscape`, plus `STILL_FOOTAGE` |
| `sample-captions.ts` | Hand-timed Hinglish demo words for `public/demo/sample-reel.mp4` |

Shared with the editor (`apps/web/src/components/captions/`):
- `CaptionLine.tsx` renders a still caption in layers, in this order: preset base, emphasis, emotion, then the
  word's style override. `scale` is for small swatches.
- `caption-effects.ts` holds the four effects, `LAYER_COLORS` and `withAlpha()`.
- `LayerTags.tsx` shows a word's layers as small coloured tags.

Hooks (`apps/web/src/hooks/`):
- `useVoiceDemo.ts` runs the hero loop: listening → heard → applied → next effect.
- `usePrefersReducedMotion.ts` gives a live reduced-motion flag, for the canvas and the timers.
- `useInView.ts` powers the scroll reveals.

## Motion
Keyframes live at the bottom of `apps/web/src/index.css`: `signal-level`, `signal-sweep`, `showcase-float`,
`showcase-pop`, `caption-motion-blur`, `caption-shake`, `star-twinkle`, `dash-flow`, `listening-pulse` and
`fade-up`. All of them animate transform or opacity, except `dash-flow`, which animates the dash offset on
four short SVG lines.

### Scroll reveals
Content below the hero animates in once, as it scrolls into view.
- **The trigger:** `AnimatedSection` uses `useInView` and fires a little after the element enters the
  viewport (`rootMargin: 0px 0px -8% 0px`). It has `variant`s `up`, `scale`, `left`, `right` and `fade`, each a
  translate/scale/opacity/blur transition with the ease-out-expo curve. Use `delay` to stagger siblings.
- **Child animations:** each `AnimatedSection` is a `group/reveal` with `data-inview`, so children can run
  their own animation off the same trigger. `reveal-classes.ts` provides the shared ones: `RISE`, `POP`,
  `GROW_Y` (bars), `GROW_X` (progress) and `DRAW_X` (hairlines), plus a `stagger()` helper.
- **Where it's used:**
  - Section headers: the eyebrow, title and lede rise in order.
  - Section seams: the line draws out from the centre and the node lights up.
  - How it works: the cards stagger in, the upload bar fills, the transcript chips pop in turn, the signal
    bars grow and the voice steps tick in.
  - Voice editing: the commands slide in from the left and the panel from the right.
  - Styles: the cards scale in.
  - Final CTA: the orb, headline, button and chips, in that order.

### Scroll-linked effects
These follow the scroll position rather than firing once. They all run from one shared loop,
`hooks/useScrollFrame.ts`: a single passive scroll/resize listener batched to one pass per animation frame.
Callbacks write styles straight to DOM refs, so scrolling never re-renders React.
- `ScrollProgress.tsx`: a 2px coral bar at the top (`scaleX`) showing how far down the page you are.
- **Hero exit** (`HeroSection.tsx`): as the hero scrolls away, its content drifts up 60px, scales to 92% and
  fades to 15%. It restores fully when you scroll back up.
- **Showcase parallax** (`CaptionShowcase.tsx`): the row gets a `--px` value from -1 to 1. The square and
  box frames `translate` by it in opposite directions, while the reel stays put. Desktop only (`--amp`).
- **Nav** (`LandingNavbar.tsx`): past 24px of scroll it tightens (64 → 56px) and gains the floating shadow.
  A scroll-spy (IntersectionObserver on the section ids) slides a pill under the link of the section you're in.

### Scroll performance
Rules the landing page follows so scrolling stays smooth:
- **Animate only `transform` and `opacity`.** Reveals no longer fade a `blur()` filter, because filter
  transitions repaint every frame.
- **Read, then write.** `useScrollFrame` subscribers do their DOM reads and return a write function. Each frame
  runs every read first, then every write, so layout is computed once per frame, not once per subscriber.
- **Write the smallest thing.** The showcase parallax sets `translate` on the two side cards directly, instead of
  a CSS variable on the row, which restyled every element inside it.
- **Pause what is off-screen** (`hooks/useOffscreen.ts`, 200px margin):
  - The waveform, playhead and star loops pause via `[data-offscreen='true']` in `index.css`.
  - The demo videos pause and their caption-sync loop stops.
  - The orb canvas already stops off-screen and in hidden tabs.
- **No backdrop blur on moving things.** The hero chips move with the hero exit, so they use a solid 90% surface.
  The nav blurs only at the top of the page; once scrolled it uses a 97% solid surface, which looks the same.
- **The orb draws in batches.** `VoiceOrb` groups its dots into 12 depth bands, and each band is one path with a
  single `fill()`: about 13 fills per frame instead of 1,100. The small CTA orb uses `density={3}` (a third of
  the dots).

**Measuring:** measured in headless Chrome with the CPU slowed 4x, the footer region (small orb) went from about
19 to 36–43 idle fps after batching. Absolute numbers from headless software rendering on a loaded machine
vary by about ±40% between identical runs. Judge real smoothness in a normal Chrome window, using DevTools →
Performance with CPU throttling.

### Loading states
- **Route loading** (`AppRoot.tsx`): each route now has its own Suspense fallback instead of a blank page.
  `/` shows `components/loading/BrandLoader.tsx`: five coral waveform bars breathing like a level meter, with
  a mono "Loading" label, marked `role="status"`. `/editor` shows `components/loading/EditorSkeleton.tsx` (see
  `docs/editor-ui.md`).
- **Hero first load** (`HeroSection.tsx`): the orb scales up out of a blur (`hero-orb-in`, 1.1s), then the four
  chips pop in 110ms apart (`hero-pop-in`, from 400ms), the connectors fade in (850ms) and the status/mic rise
  last (950ms). These animate `transform`, which composes with the Tailwind `translate`/`scale` positioning and
  hover lifts on the same elements.
- **Video loading** (`CaptionedVideo.tsx`): until `loadeddata`, a `.skeleton` shimmer covers each frame and the
  captions stay hidden; both cross-fade in once the first frame is ready. A load error also settles it, so the
  shimmer never runs forever.
- `.skeleton` in `index.css` is a surface block with a soft highlight sweeping across it (transform on
  `::after`). Reuse it for any loading placeholder.

### Component animations
- `SpotlightCard.tsx` is used for the pipeline and style cards. A soft coral glow follows the pointer
  (through CSS variables, with no re-render), the border brightens, and the card lifts 4px.
- The hero effect chips are buttons: they lift on hover and press in on click, and clicking one plays that
  effect's example (`useVoiceDemo().jumpTo`).
- The CTA arrows (↗) nudge diagonally on hover.
- In voice editing, the After frame flashes coral once when you pick an example (`frame-flash`).

With `prefers-reduced-motion: reduce`:
- The hero exit, parallax and card lift are off. The progress bar, nav tightening and scroll-spy stay,
  because they only change as you scroll and act as feedback. Chip clicks still switch examples.
- Every CSS animation stops. `useInView` reports "in view" straight away, and `[data-reveal]` transitions are
  zeroed, so all content shows immediately.
- `VoiceOrb` draws one still frame.
- `useVoiceDemo` stops auto-advancing. It rests on an applied example, and the mic button becomes
  "Show next example".

## Known limitations
- Everything on the page is scripted or sample data, and each part says so. The hero's mic never opens a
  microphone, and no section calls the pipeline or the agent.
- The voice-editing steps are plain-language illustrations, not the agent's real tool calls.
- The CTAs open `/editor`. There is no upload-from-link flow.
