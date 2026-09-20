# Tone Section Angry Footage + Hero Scroll-Range Widening — Audit

## Status
Both changes implemented and verified in a running browser by reading the live DOM. Build and
typecheck pass; `oxlint` reports nothing in either touched file; console clean (only Vite HMR and
the React DevTools notice — no errors, no 404s, so both new asset paths resolve).
Video *playback* was not visually observed — the automation tab is backgrounded, where Chrome
defers media decode and throttles `requestAnimationFrame`.
**Blocker: `apps/web/public/rona-reel.mp4` is matched by `.gitignore:12` (`*.mp4`)**, the same rule
that already blocks `demo-reel.mp4` from phase 19.

## Objective
1. Put looping footage behind the caption text of the empty preview card in "Hear the difference"
   (headline "Same reel. Three moods."), for the "rona machne wala hai" / angry moment.
2. Slow the hero title's scroll-triggered animation to roughly 1.5–2x, as a first pass for review.

## Structural finding (raised before implementing)
The request described "three mood cards, one labeled rona machne vala hai" and asked not to touch
"the other two cards". **That section does not have three mood cards.** It has:

- ONE empty 9:16 preview frame (`ToneSection.tsx:108`) with a gradient backdrop and no footage —
  the only element that was "empty behind its text".
- THREE small `role="tab"` selector buttons (Neutral / Excited / Angry) with a label and a quote on
  a flat surface. Not empty frames; a video background would look nothing like the request.

"rona machne wala hai" is the **Angry** tab's quote — fixture `real_reel-project.json` words 89–93,
resolved by running the same `slice` the component uses. Angry is `momentIndex`'s initial value
(`useState(2)`), so the empty frame shows that line on load, which is why it read as a "card
labeled rona machne vala hai".

Because the single frame is shared by all three moments, the owner was asked whether the footage
should play always or only for Angry. **Decision (owner, Sep 20): only while Angry is selected.**
Neutral and Excited keep the plain gradient — this clip is the angry moment's own footage and would
otherwise sit behind the birthday line.

## Implementation

### Task 1 — angry-only footage
Two module constants in `ToneSection.tsx` (root paths, not bundler imports, so the assets stay
unhashed and outside the JS graph):

```
const ANGRY_VIDEO_SRC  = '/rona-reel.mp4'
const ANGRY_POSTER_SRC = '/rona-reel-poster.jpg'
```

Inside the 9:16 frame, before the badge / `CaptionWords` / waveform, guarded by
`moment.tone === 'angry'`:

- `motionSafe` → `<video src poster autoPlay muted loop playsInline preload="metadata" aria-hidden
  tabIndex={-1}>` at `absolute inset-0 h-full w-full object-cover`.
- `!motionSafe` → `<img src={poster} alt="" aria-hidden>` with the same cover classes. Static; no
  `<video>` element is rendered at all, so there is nothing that could autoplay.
- Then a scrim: `absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65` — a
  gradient overlay, not a text-shadow. Only rendered when there is footage to darken.

The badge, `CaptionWords` and the waveform all come later in DOM order and are themselves
`absolute`, so they paint above the scrim without any `z-index`. The frame's original gradient
`background` stays underneath as the fallback and as the Neutral/Excited look.

Both the clip and the scrim treatment match how phase 19 did the tone-aware caption frames, as
requested — same attribute set, same `object-cover`, same gradient stops.

### Task 2 — hero scroll range

**Mechanism (requested before any change): scroll-position-linked, not time-based.**

The hero title actually carries two independent animations, and only one of them is scroll-driven:

1. **Word reveal** — `animate-mask-up` (`index.css:304`: `mask-up 1.25s cubic-bezier(0.19,1,0.22,1)
   both`), a one-shot CSS animation fired on mount after the load intro, staggered
   `HEADLINE_STAGGER_BASE_MS` 250 + `HEADLINE_STAGGER_STEP_MS` 75 per word. **Time-based, and not
   scroll-triggered at all** — it plays on load. Untouched; the word-based technique is unchanged.
2. **The scroll-triggered one** — `useScrollVar(heroRef, '--hero-p', 0, -1.2, motionSafe)` writes a
   clamped 0..1 progress value into a CSS custom property from a scroll listener
   (`caption-demo.tsx:122-145`). Everything that moves on scroll reads it through `calc()`:
   `LINE_SPLIT`'s ±24vw title split and `opacity: calc(1 - var(--hero-p,0) * 1.15)`, `fadeOnScroll`
   (`* 1.6`), the sphere's drift/scale, and `ScrollCue` (`* 4`).

Confirmed from the live DOM, not just the source — the two title lines carry the inline styles
`translate3d(calc(var(--hero-p, 0) * -24vw), 0, 0)` / `* 24vw` and
`opacity: calc(1 - var(--hero-p, 0) * 1.15)`.

Since it is scroll-linked, duration and easing do not apply; the only lever is how much scroll maps
to the 0..1 range. **Changed the range end from `-1.2` to `-2.2` viewport heights — a factor of
1.833x**, inside the requested 1.5–2x band.

Why it felt twitchy, from the old numbers: the title lines hit zero opacity at `p ≈ 0.87` and
everything below them at `p ≈ 0.63`, so barely one screen of scroll consumed the whole gesture and
a small wheel movement threw the lines a long way apart.

Derived from the hook's own formula, at 1280px:

| Screens scrolled | p (old, 1.2) | p (new, 2.2) | Title opacity (old) | Title opacity (new) |
| --- | --- | --- | --- | --- |
| 0.25 | 0.208 | 0.114 | 0.76 | 0.87 |
| 0.50 | 0.417 | 0.227 | 0.52 | 0.74 |
| 0.75 | 0.625 | 0.341 | 0.28 | 0.61 |
| 1.00 | 0.833 | 0.455 | 0.04 | 0.48 |

Consequence worth reviewing: because the hero is only one viewport tall, the title now leaves the
screen at roughly 48% opacity rather than fully faded. That is the intended trade for a gentler
on-screen gesture, but it is a visible change in character — this is the "stop and let me review"
point.

## Files Created
- `apps/web/public/rona-reel.mp4` — the angry-moment clip (copied from the path the owner supplied; 512,062 bytes).
- `apps/web/public/rona-reel-poster.jpg` — its first frame, 478×850, 20,703 bytes.
- `.claude/audits/landing/phase-21-tone-angry-footage-and-hero-scroll-range.md` — this audit.

## Files Modified
- `apps/web/src/components/landing/ToneSection.tsx` — two constants and the guarded video/img +
  scrim block inside the 9:16 frame (additive; nothing existing was altered).
- `apps/web/src/pages/LandingPage.tsx` — one argument: `useScrollVar`'s range end `-1.2` → `-2.2`,
  plus the comment above it.

## Files Intentionally Untouched
- The three `role="tab"` mood buttons — they are not empty-behind-text cards; confirmed with the
  owner rather than assumed.
- The Neutral and Excited moments — no footage, unchanged gradient, per the owner's decision.
- `MOMENTS`, `Waveform`, `CaptionWords`, the tone-layer switch and the preset picker — tone
  detection, caption rendering and all copy unchanged.
- `HEADLINE_LINES`, `HeroHeadline`, `animate-mask-up` and its stagger constants — the word-based
  reveal technique, the hero copy and the two-line title structure are all untouched.
- `LINE_SPLIT`'s ±24vw and the 1.15/1.6/4 opacity multipliers — only the scroll range changed, so
  the motion is the same gesture spread over more scroll rather than a different gesture.
- `apps/web/public/demo-reel.mp4` — not reused here, per the request. Verified: the page now serves
  two distinct video sources and the two files have different md5 sums.
- `apps/web/src/components/VoiceSphere.tsx` — locked.
- `apps/web/src/components/landing/dark/*` — not the rendered set for either of these sections.
- `.gitignore` — see Blockers.

## Architecture
No new abstraction and no new dependency. Task 1 reuses the exact pattern phase 19 established in
`CaptionShowcaseSection`; Task 2 changes one numeric argument to an existing hook.

## Interfaces / Contracts
- Static asset contract: `/rona-reel.mp4` and `/rona-reel-poster.jpg` must exist at the deployed
  web root.
- `useScrollVar`'s signature is unchanged; only a call-site argument differs.
- No schema, API, env var or prop change.

## Ownership
Both files are under `apps/web` — **P3 (editor UI)**. No file outside it touched. No sign-off
needed.

## Validation
- The footage degrades safely: if the mp4 404s the poster shows; if both fail the frame's original
  gradient `background` shows. The caption, badge and waveform layers are unaffected in every case.
- Reduced motion is decided at mount by `useMotionSafe()` (`window.matchMedia`). Under `reduce`,
  no `<video>` is rendered, and `useScrollVar` returns early without registering its listener, so
  `--hero-p` is never written and `var(--hero-p, 0)` falls back to 0 — the hero is fully static.
  Widening the range cannot affect that, because the hook is gated before the range is used.

## Security
No security surface. Two static local assets and one numeric constant. No secrets, no user input,
no external service. The clip is the owner's own, supplied for this purpose.

## Testing
Commands run, from `apps/web`:
- `npm run build` (`tsc -b && vite build`) — **passed**, built in 487 ms. Only the pre-existing
  `EditorBootstrap` chunk-size warning.
- `npm run lint` (`oxlint`) — **no findings** in `ToneSection.tsx` or `LandingPage.tsx`.
- `npm run dev` + real Chromium, measured through the DOM in same-origin iframes at exact widths.

Per-tab state of the 9:16 frame, read after clicking each tab (1280px):

| Tab | `<video>` | `<img>` poster | Scrim |
| --- | --- | --- | --- |
| Neutral | none | none | none |
| Excited | none | none | none |
| **Angry** (default, index 2) | `src=/rona-reel.mp4`, `poster=/rona-reel-poster.jpg`, autoplay/muted/loop/playsInline all `true`, computed `object-fit: cover` | — | present |

- Exactly **1** `<video>` in the tone section; **4** on the page (3 demo-reel + 1 rona) across **2**
  distinct sources — the demo-reel file is not reused here.
- Angry-only behaviour and **no horizontal overflow** re-confirmed at **1280, 768 and 375**.
- Frame box at 1280: 340×604, i.e. the 9:16 ratio is preserved with the video in it.
- Asset integrity: the mp4 was parsed box-by-box — `avc1`, a single `vide` track (no audio), 478×850
  — and its first keyframe decoded with WebCodecs to produce the poster, which is what confirms the
  dimensions and the absence of an audio track.
- Title lines confirmed carrying the `calc(var(--hero-p, 0) …)` inline styles, which is the evidence
  for the scroll-linked diagnosis.
- Console: no errors, no warnings, no 404s, checked after a reload so load-time messages were caught.

## Live Verification
- **Verified in a real running browser:** every row of both tables above — real Vite dev server,
  real Chromium, real computed styles and real per-tab DOM state.
- **Verified against the real file:** the mp4's container, codec, track list and dimensions, by
  parsing and decoding it rather than trusting the description.
- **NOT verified:** (a) that the video plays and loops, and how the scrim reads over moving footage;
  (b) the hero's new scroll feel. Both for the same reason — the automation tab is backgrounded, so
  Chrome never decodes the media and `requestAnimationFrame` is throttled, which means
  `useScrollVar`'s rAF-driven update never runs and `--hero-p` stays at 0 no matter how the iframe
  is scrolled. The new range is therefore derived from the hook's own formula, not sampled live.

## Unverified / Untestable
1. **Video playback, looping, and the scrim's contrast over moving footage.** Background-tab media
   throttling. Needs one foreground look.
2. **The hero's actual scroll feel at 1.83x.** `--hero-p` cannot be sampled in a throttled tab, as
   above. The arithmetic is exact and tabulated, but whether 1.83x is the right amount is a
   judgement call — which is why the request asked to stop here for review.
3. **Mobile Safari autoplay.** No iOS device or simulator available. The four required attributes
   are present and were read back from the live DOM.
4. **`prefers-reduced-motion: reduce`.** The code paths were traced to `window.matchMedia` and are
   plain conditionals, but the query was not forced on in a live browser.

## Integration Status
- `ToneSection` change: **connected** — renders in the real app.
- Hero scroll range: **connected**.
- `rona-reel.mp4`: **not committed** — blocked by `.gitignore`. Works locally only.
- `rona-reel-poster.jpg`: untracked but not ignored; commits normally when staged.

## Dependencies / Blockers
1. **`.gitignore:12` (`*.mp4`) excludes `apps/web/public/rona-reel.mp4`**, exactly as it does
   `demo-reel.mp4` (phase 19). Neither clip will reach Amplify or another developer until the lead
   decides: add negations for these two paths, or host both in S3/CloudFront and point the four
   source constants (two in `CaptionShowcaseSection.tsx`, two in `ToneSection.tsx`) at those URLs.
   **Not actioned here** — the `*.mp4` rule is deliberate and repo-wide media policy is the lead's
   call, not this task's scope.
2. The foreground-browser pass in Unverified 1–2, before the hero timing is signed off.

## Deviations
- The request assumed three mood cards; there is one frame and three tab buttons. Raised with the
  owner before changing anything rather than picking an interpretation, and implemented to their
  answer (Angry only). No other interpretation was applied.
- Nothing else deviates. No new copy, no change to the reveal technique, the hero copy, the
  two-line structure, the tone detection, or how captions render.

## Git / Change Scope
Branch `Krish-landingpage`, working tree dirty. Nothing staged or committed by this work.

`git diff` filtered to code lines shows only the intended changes in these two files. Both files
also carry earlier changes from phases 19 and 20 (the `id="features"` → `id="hear-the-difference"`
rename, the section reorder, the `scrollTo` instant fix), already audited there.

Pre-existing and left untouched: the `DESIGN.md` phantom deletion (never staged), the phase-18
staged changes to `TalkToEditSection.tsx`, unstaged `caption-demo.tsx`, and untracked
`PROJECT_LOG.md` / `editor-screenshot.png` / the phase 17–20 audits.

## Next Steps
1. **Owner (P3):** review the hero at 1.83x and say whether to go further, stop, or pull back —
   noting the title now exits at ~48% opacity instead of fully faded.
2. **Owner (P3):** foreground look at the Angry frame — playback, loop, and caption legibility over
   the footage.
3. **Owner (P3):** decide whether Neutral and Excited should eventually get their own footage; they
   are plain gradients today by explicit choice, not by oversight.
4. **Lead:** resolve the `.gitignore` mp4 blocker for both clips.
