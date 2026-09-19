# Landing: caption showcase section (phase 01)

## Status
Implemented and rendered in the dev server; typecheck, lint and production build pass. Not committed:
the target branch has not been chosen by the repo owner yet.

## Objective
The owner shared two screenshots of a caption-tool landing page (headline + upload row, three video
frames of different shapes captioned in different styles, a row of three number cards) and asked for
the same components on our landing page, in our theme, "not a copy". The page was hero-only before this.

## Implementation
One new section, `CaptionShowcaseSection`, rendered directly under the hero in `LandingPage.tsx`:

1. **Heading block.** Mono eyebrow in `signal` ("Tone-aware captions"), a two-tone `font-display`
   heading (first clause `ink-tertiary`, rest `ink-primary`, the reference's grey-to-white move) and a
   one-paragraph subtitle.
2. **Upload row.** A bordered pill with the accepted formats and the upload cap on the left and an
   "Add captions" button (`navigate('/editor')`) on the right. The reference has a "drop a video link"
   input; we have no import-from-URL feature, so there is no link field. The formats (MP4, MOV, MKV,
   WebM) match `EmptyEditor.tsx`'s `accept`, and the cap is `UPLOAD_MAX_BYTES` from `lib/api.ts`,
   shown in whole MB.
3. **Three frames: 1:1 Dhamaka, 9:16 Rangmanch, 16:9 Hinglish Bold.** The caption words are the
   pipeline's real output for the `real_reel` test clip (fixture words w5–w8, "har saaaal meri
   birthday", with measured emphasis, the `excited` tone and stretch). They are drawn with the
   editor's own resolver (`resolveWordStyle`, `styleToCss`, `glowWrapperCss`, `renderedText`,
   `revealOpacity` from `lib/caption-style.ts`), and each frame's width is measured with a
   ResizeObserver so font sizes scale the way they do on the editor stage. All three frames share
   one clock that replays the words' real timings (1080–2440 ms) plus a 1.4 s hold, with a
   signal-coloured playhead bar. The export renders at the project's own width × height
   (`remotion/src/Root.tsx`), which is what justifies showing three aspect ratios.
4. **Three fact cards**, each a number computed from code rather than typed in: presets
   (`PresetId.options.length` = 7, names listed), tones per word (`Emotion.options.length` = 3), and
   voice signals measured per word (`Object.keys(Signals.shape).length` = 4). The reference's
   "5 min / 99% / 20+ languages" were **not** carried over: none of them has been measured for this
   product, and the handoff rule forbids invented statistics.

Layout: at `lg` and up the frames sit in one row (25% / 25% / 42%). Below `lg` the 9:16 frame gets
its own centred row (max 300 px) and the 1:1 and 16:9 frames share the row under it. Styling uses
only the landing tokens (`canvas`, `surface`, `line-subtle`/`line-default`, `ink-*`, `signal`) plus
the existing `RevealItem` fade-up and `useMotionSafe`.

## Files Created
- `apps/web/src/components/landing/CaptionShowcaseSection.tsx`: the section.
- `.claude/audits/landing/phase-01-caption-showcase.md`: this audit.

## Files Modified
- `apps/web/src/pages/LandingPage.tsx`: +1 import and +1 `<CaptionShowcaseSection />` after the
  hero `<section>` (additive).

## Files Intentionally Untouched
- `apps/web/src/components/VoiceSphere.tsx`: locked (landing handoff §3).
- The six original `components/landing/*Section.tsx` files: rendered on other branches (handoff §7).
- `components/landing/dark/*`: reused (`RevealItem`, `useMotionSafe`), not edited.
- `LandingBackground.tsx`, `index.css`: the background stays scoped to the hero; the new section sits
  on plain `bg-canvas`, so the regression noted in handoff §5 is not reintroduced.
- `lib/caption-style.ts`, `packages/shared`: used, not changed.

## Architecture
NEW: a presentational section. REUSED: the shared schema/presets, the editor's caption resolver, a
committed fixture, `Button`, `useRoute`, `ArrowRightIcon`, `RevealItem`, `useMotionSafe`. No new
dependencies (lucide-react was already installed).

## Interfaces / Contracts
- Imports `@captions/shared/fixtures/real_reel-project.json` (the same import style that
  `project-context.tsx` and `EditorBootstrap.tsx` use) and runs `Word.array().parse` on words 4..7
  at module load, so a fixture change that breaks the schema fails loudly.
- Depends on the `Preset` fields `base.x/y`, `align`, `reveal` and `stretch`.

## Ownership
`apps/web` belongs to P3; this is landing-page work inside it. The schema and fixture (lead) are
read only.

## Validation
The fixture words are schema-validated at import. If a preset is renamed, the `PRESETS.dhamaka`,
`PRESETS.rangmanch` and `PRESETS['hinglish-bold']` lookups fail the typecheck.

## Security
No input, no network calls, no secrets. The CTA only navigates to `/editor`.

## Testing
- `npx tsc -b`: clean.
- `npx oxlint` on the new file: clean. (The only lint warning on `LandingPage.tsx` is pre-existing,
  in `HeroHeadline`.)
- `npm run build` (vite): built, no errors. The chunk-size warning is pre-existing.
- Browser, Vite dev server at a 1853 px viewport: the section renders, the karaoke loop runs, and
  there are no console errors.
- Browser at 1280 / 768 / 375 px, using same-origin iframes because the window could not be
  resized: `scrollWidth` < `innerWidth` at every width (no horizontal overflow). At 768 and 375 the
  frame layout is 9:16 alone, then 1:1 + 16:9. The 768 px layout was checked by eye in a screenshot.

## Live Verification
Everything is local rendering; no external service is involved.

## Unverified / Untestable
- The reduced-motion path (a static finished line, no clock, no fade-up) was checked by reading the
  code only, not with an emulated `prefers-reduced-motion`.
- The 375 px layout was checked numerically (frame widths 300 / 129 / 181 px), not visually.

## Integration Status
Connected: rendered on `/` under the hero.

## Dependencies / Blockers
- **Footage.** The frames show lit gradient backdrops, not video. The test clips in
  `services/api/scripts/stt_bakeoff/clips/` are real people's reels, cleared for testing but not for
  a public marketing page. Once rights-cleared footage exists, put a `<video muted loop playsinline>`
  behind the caption layer; the caption layer stays as it is.

## Deviations
- No URL-import field (the feature doesn't exist).
- Different numbers in the cards (the reference's claims are unmeasured for us).
- No footage (rights), as above.
- **Rendering note:** the fixture's text is already "saaaal", and `renderedText` adds two more
  repeats from `extraMs` = 259, so the frames show "saaaalll". That is exactly what the editor
  renders for this word today. It points to baked-in repeats in the pipeline output (see the
  `renderedText` invariant comment), which is P1's to judge; this section does not hide it.

## Git / Change Scope
Branch `p3-agent-talk-edit`, uncommitted. Final `git status`: `LandingPage.tsx` (M), the new section
file and this audit (untracked), and nothing else. During the session,
`services/api/app/pipeline/run.py` and `services/api/tests/test_pipeline_units.py` briefly showed as
modified by something outside this work. They were not touched here and were clean again by the
final check.

## Next Steps
- Owner: choose the branch; then commit only the two landing files and this audit.
- Owner / lead: supply rights-cleared footage for the three frames, or approve the gradient backdrops.
- P1: decide whether "saaaal" should reach the renderer un-stretched in the fixture/pipeline output.
