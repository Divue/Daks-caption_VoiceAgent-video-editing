# Landing: two-column hero, scroll motion, and the full section set (phase 02)

## Status
Implemented and checked in the browser (desktop at 1853 px; 768 and 375 px in same-origin iframes).
Typecheck, lint and production build pass. Not committed: the repo owner has not chosen the branch.

## Objective
The owner's brief (2026-09-19), with a reference landing page (v0 "GiGi" energy-drink site) for
STRUCTURE and MOTION only, keeping our colours, background and dark theme:
- Hero: heading + two-line subtitle on the left in a heavy bold face, the sphere on the right.
- Connector "arrows" to the sphere's buttons shortened to about 20% of their length.
- The sphere reacts to scrolling, gracefully, in the spirit of its hover reaction.
- On scroll, heading line one slides left and line two slides right.
- A dark navbar that animates like the reference.
- Build the sections suggested in the previous turn, make them strong, "surprise me".

## Reference analysis (from the live site, in Chrome)
- Navbar: `fixed`, transparent at the top, a solid dark bar after scrolling (500 ms transition),
  slides in from `translateY(-100px)`, accent underline on links, and a shine sweep on the pill CTA.
- Hero: two columns; pill eyebrow with a dot; a two-line heavy heading (second line in the
  accent); mono subtitle; a filled and an outline pill button; a mono bullet row; a scroll-mouse
  cue at the bottom.
- Scroll: Lenis smooth scroll plus a split heading (line one exits left, line two exits right).

## Implementation
**Hero (`pages/LandingPage.tsx`, rewritten):**
- Grid `lg:grid-cols-[1.2fr_1fr]`. Left: eyebrow pill, the locked two-line title (words unchanged,
  General Sans 700), a two-line subtitle, "Start Creating" (with shine) and "See it in action"
  (scrolls to `#showcase`), and a bullet row that absorbs the old `HERO_INFO_ITEMS` block.
- Right: `VoiceSphere` with the hero glow behind it. A scroll-mouse cue sits at the bottom.
- Scroll split: `useScrollVar` writes `--hero-p` (0 to 1) on the section once per animation frame
  (no re-render). Line one moves `-24vw`, line two `+24vw`, and both fade. The rest of the copy
  fades faster, and the sphere column drifts down and scales to 0.9.
- `SphereCornerCaptions` is no longer rendered (the scattered "texts here and there"); the export
  is kept.

**Sphere (`components/VoiceSphere.tsx`). The owner explicitly asked for changes to its connectors
and its scroll behaviour, so it was edited for exactly those; nothing else in it changed:**
- Controls orbit the sphere. The slots are now angles (the same asymmetric spread as before), and
  anchors are computed on a circle of `SPHERE_RADIUS + 6.5` (%-of-width, y corrected by
  `STAGE_ASPECT`). Connectors run inward to `SPHERE_RADIUS + 1.5`, about 5% of the stage width
  against roughly 11–27% before, which is close to the requested fifth.
- Each pill's wrapper is pushed outward along its own angle so it never covers the sphere. The
  breathing transform moved to an inner node, and its amplitude dropped from 0.09 to 0.05 to
  suit the tighter orbit.
- The stage went from 3:2 to 4:3 and the sphere was enlarged (`SPHERE_FRACTION` 0.3 → 0.44,
  `CANVAS_FRACTION` 0.58 → 0.86, same ~1.95 ratio so the displacement headroom is unchanged).
  The glow and ring were resized to match.
- Scroll reaction inside the existing WebGL frame loop: a smoothed, signed scroll velocity spins
  the field and tips it with the scroll direction, and its magnitude adds surface ripple
  (`uDisplacement`) and a slight swell (`uScale`). It eases back to rest and is off under reduced
  motion. SHAKE / STRETCH / GLOW / SCALE UP were not used for this.
- The "Transcribe · Read the tone · Caption with emotion" line under the mic was removed (it was
  duplicated by the hero bullets).

**Navbar (`landing/LandingNavbar.tsx`):**
- `sticky` → `fixed`. It is transparent at the top and turns `bg-canvas/80` with blur and a border
  after 8 px. Height eases from 72 px to 56 px.
- The entrance keyframe `navbar-enter` now starts at `translateY(-100%)`.
- Link underline in `signal`, shine on the CTA, and a signal-coloured page-progress hairline driven
  by `--page-p`. The dropdowns are unchanged and re-checked.

**New sections (order on the page):**
1. `CaptionShowcaseSection` (phase 01, now `#showcase`), moved onto the shared kit.
2. `ToneSection` `#features`, "Same reel. Three moods.": three moments of one real reel, each with
   the tone the pipeline detected (neutral "log mere liye chai", excited "har saaaal meri
   birthday", angry "rona machne wala hai"). A tone-layer switch flips the real
   `settings.emotionLayer`, and there is a preset picker. The waveform's per-word height is
   measured loudness; the envelope within a word is only drawing.
3. `SignalsSection`, "Not an LLM wrapper.": a score of the reel's real per-word signals (loudness
   bars, pitch line, hatched held-time tails) with a scanning playhead and a readout
   (σ values, ms, and the resulting emphasis/tone/stretch). Hovering a word focuses it.
4. `TalkToEditSection` `#voice-editing`, "You don't need to edit. Just talk.": a scripted replay.
   The typed command is followed by the agent's REAL tool names (`find_words`,
   `update_caption_style`, `apply_preset`, verified in `services/api/app/agent/tools`), and the
   same patch shapes are applied to real words. It is labelled as a replay. The "your word edits
   kept" line was verified: `apply_preset` sets only `presetId`.
5. `HinglishSection` `#for-creators`, "Written the way you text.": two counter-scrolling marquees
   of real words from the Hinglish reel, each drawn in a preset face by the resolver, plus three
   cards. "English (India) returned zero words on a real reel" is from `pipeline/stt.py`'s
   bake-off note.
6. `StepsSection` `#how-it-works`: one four-step flow (Upload → We listen → Talk to edit → Export)
   with a scroll-filled rail (vertical on mobile, horizontal on desktop), lighting each step.
   This settles handoff §12.2.
7. `ClosingSection`: "Stop typing captions. / Start saying them.", whose lines slide in from
   opposite sides and lock together, plus a CTA with shine.
8. `dark/LandingFooter` (existing). Its anchors now resolve to the ids above.

**Shared kit (`landing/caption-demo.tsx`):** `useElementWidth`, `useLoopClock` (visible-only and
wall-clock based, so throttled timers skip ahead instead of slowing down), `CaptionWords`
(resolver-drawn line, angry shake mirroring `CaptionRenderer`'s amplitude), `useScrollVar`, and
`SectionHeading` (every section opener slides its two lines in from opposite sides, the hero's
split in reverse).

**CSS (`index.css`):** keyframes `caption-shake`, `marquee`, `shine`, `scroll-wheel` and their
`--animate-*` tokens; `navbar-enter` start offset changed.

## Files Created
- `apps/web/src/components/landing/caption-demo.tsx`: shared hooks and caption line.
- `apps/web/src/components/landing/{ToneSection,SignalsSection,TalkToEditSection,HinglishSection,StepsSection,ClosingSection}.tsx`
- `apps/web/src/components/landing/LANDING_COPY.md`: the copy bank (previous turn).
- `.claude/audits/landing/phase-02-hero-redesign-and-sections.md`: this audit.

## Files Modified
- `apps/web/src/pages/LandingPage.tsx`: hero restructured (structural) and the section list.
- `apps/web/src/components/VoiceSphere.tsx`: control geometry, sphere size, scroll reaction, one
  line removed (structural, scoped as above).
- `apps/web/src/components/landing/LandingNavbar.tsx`: fixed/transparent bar, motion details.
- `apps/web/src/components/landing/CaptionShowcaseSection.tsx`: moved onto the shared kit; heading
  and id.
- `apps/web/src/index.css`: additive keyframes and the navbar-enter offset.

## Files Intentionally Untouched
- The six original `landing/*Section.tsx` files (they render on other branches).
- `LandingBackground.tsx`: the owner said to keep the background. It remains hero-scoped.
- Everything outside `apps/web`. The fixtures and `lib/caption-style.ts` are read only.

## Architecture
Presentational only. Every caption on the page goes through `lib/caption-style.ts`. Scroll-linked
motion writes CSS custom properties from one rAF-throttled listener per section (no React state per
frame). No new dependencies: Lenis was NOT added; native scrolling is kept.

## Interfaces / Contracts
Reads fixture JSON `real_reel-project.json` (validated with `Word.array().parse`) and the shared
enums. There is no API, schema or env change.

## Ownership
`apps/web` belongs to P3. `VoiceSphere.tsx` was locked by the previous landing owner; the current
owner requested the connector and scroll changes directly, and this audit records that as the
unlock for those changes only.

## Validation
Fixture words are schema-parsed at module load. Preset lookups are typed against `PresetId`.

## Security
No input handling, network calls or secrets. The CTAs only navigate to `/editor`.

## Testing
- `npx tsc -b`: clean.
- `npx oxlint` on all touched files: clean apart from `react(only-export-components)` notices on
  `caption-demo.tsx` (dev hot-reload only).
- `npm run build`: built, no errors.
- Chrome, `localhost:5174`, 1853 px wide:
  - hero layout;
  - heading split mid-scroll;
  - navbar solid with progress hairline;
  - every section rendered;
  - Talk to Edit ran all three steps (pink and bigger → shake → Dhamaka, keeping the edits);
  - dropdowns still open with content;
  - `#showcase` lands at 80 px under the fixed bar;
  - no console errors.
- 375 / 768 px (iframes): `scrollWidth` < `innerWidth` (no page overflow). Elements past the
  edge are only headlines mid-slide (clipped by `overflow-x-clip`) and the Signals score inside its
  own `overflow-x-auto` box. Phone hero and Tone section checked visually; the Tone tabs were fixed
  to show labels only below `sm`.

## Live Verification
Local rendering only; no external service involved.

## Unverified / Untestable
- **The sphere's scroll reaction was not visually confirmed.** The automation tab reports
  `visibilityState: hidden` and 0 rAF frames per second, so WebGL frames and native smooth scrolling
  don't run there. The code was typechecked and reviewed only; it needs one look in a normal
  foreground tab.
- The reduced-motion paths (static lines, no clocks, no marquee, no split) were checked by reading
  the code, not by emulation.
- The 768 px layout was checked for overflow only, not visually, in this phase.

## Integration Status
Connected: everything renders on `/`.

## Dependencies / Blockers
- Footage for the frames is still pending (phase 01).
- `saaaal` renders as "saaaalll" (baked repeats in the fixture plus `renderedText`), as noted in
  phase 01 for P1.

## Deviations
- No Lenis smooth scroll (it would be a new dependency; native scroll is kept).
- The hero title keeps its locked words and two-line rule but drops the serif for General Sans
  700, as the brief asked for "a similar bold font".
- The old centred hero's `HERO_INFO_ITEMS` block and the corner captions are gone from the hero
  (folded into the bullets).

## Git / Change Scope
Branch `p3-agent-talk-edit`, uncommitted. `git status`: the 4 modified and 9 new files listed
above plus `.claude/audits/landing/`. No files outside `apps/web` and the audits folder.

## Next Steps
- Owner: choose the branch; commit these files plus both landing audits.
- Owner: look at the sphere's scroll reaction in a normal tab and tune the constants if needed
  (`2.4` spin, `0.22` tilt, `0.07` ripple, `0.035` swell in `VoiceSphere.tsx`).
- Owner: supply footage for the showcase frames.
