# Landing: every box reacts to the down-scroll, and a smoothness pass (phase 13)

## Status
Implemented and, for the first time in this section's phase history, **live-verified with a real
scroll gesture** rather than blocked by this tool's IntersectionObserver limitation — see Live
Verification below for how that gap finally closed. All five sections that previously had only
their heading animate now have every visual "box" inside them join the same down-scroll-only
reveal `useInView`/`RevealItem` mechanism phases 10/12 built. A blur-based reveal was also swapped
for the cheaper fade-up one everywhere, as the concrete "make it smoother" change.

## Objective
Two asks in one brief:
1. Every component/"box" on the landing page should play its own entrance animation on a downward
   scroll, not just each section's heading — the six live sections' interactive panels, cards and
   CTAs were still appearing statically.
2. The reveal rendering felt laggy; make it smoother.

## Find it first
Read every live section (the seven `LandingPage.tsx` imports below the hero, plus the live
`dark/LandingFooter.tsx`) to see which already used `RevealItem`/`SectionHeading` and which didn't:
- **Already fully covered** (no change needed): `CaptionShowcaseSection.tsx` (upload row, all three
  caption frames, all three fact cards already `RevealItem`-wrapped), `HinglishSection.tsx` (its
  three point cards already wrapped; the two marquee rows are a deliberate *continuous* motion, not
  an entrance, so correctly untouched), `dark/LandingFooter.tsx` (already wrapped).
- **Heading-only, boxes static** (fixed this phase): `ToneSection.tsx` (frame + controls),
  `SignalsSection.tsx` (the whole score panel), `TalkToEditSection.tsx` (all three columns — the
  phase-11 layout work added them but never gave them entrance reveals), `StepsSection.tsx` (the
  rail/step list), `ClosingSection.tsx` (the CTA paragraph + button; its headline has its own
  pre-existing continuous scroll-linked split animation, correctly left alone, same reasoning as
  the Hinglish marquee).
- `AnimatedSection.tsx` — re-confirmed dead code (still not imported by `LandingPage.tsx`); not
  touched, consistent with phases 10/12.
- `VoiceSphere.tsx` — not opened, per the standing hard constraint.

## Implementation — every box reacts
Each newly-wrapped box keeps its existing internal ref (`frameRef`, the score panel's `ref`,
`railRef`, `clockRef`, `frameRef` in `TalkToEditSection`) exactly where it was; `RevealItem` is
added as an **additional outer wrapper**, not a replacement, so no existing effect (loop-clock
ticking, `useScrollVar` rail fill, `useElementWidth` caption sizing) changed at all:
- `ToneSection.tsx`: the "Frame" and "Controls" divs each became their own `RevealItem` (0ms /
  90ms stagger), inside the existing `ref={clockRef}` grid row.
- `SignalsSection.tsx`: the whole score panel (readout + bars/pitch-line/playhead + legend) wrapped
  in one `RevealItem`; `ref={ref}` (the loop clock) stays on the inner panel div, unchanged. The
  file was rewritten via `Write` (not patched) purely to re-indent the ~115-line block the new
  wrapper nests one level deeper — no logic lines changed beyond the wrap itself.
- `TalkToEditSection.tsx`: each of the three columns (editor screenshot, RANGMANCH frame, chat
  panel) is now its own `RevealItem` (0ms / 90ms / 180ms stagger), keeping `frameRef` on the
  RANGMANCH frame and the outer `ref={clockRef}` on the row exactly as phase 11 left them. The
  `lg:contents` promotion (phase 11) is unaffected — `RevealItem`'s div simply carries the same
  layout className the plain wrapper div used to.
- `StepsSection.tsx`: the whole rail+step-list block wrapped in one `RevealItem`; `ref={railRef}`
  stays on the inner div. The per-step `opacity: lit` inline style (driven continuously by
  `--steps-p` as the rail fills) is a *separate*, already-scroll-reactive mechanism and was left
  alone — it multiplies with the wrapper's own opacity during the reveal, which reads fine since
  both range 0..1 and the effect is momentary.
- `ClosingSection.tsx`: the CTA paragraph + button, previously bare children with their own
  `mt-8`/`mt-10` margins, now share one `RevealItem` (`className="mt-8 flex flex-col items-center"`
  replacing the paragraph's own `mt-8`, `mt-10` on the button unchanged since it's still the second
  in-flow child). The headline's own continuous `--close-p` slide-in (mirroring the hero) is a
  different, already-reactive mechanism, deliberately left untouched, same as the Hinglish marquee
  and Steps rail.

## Implementation — smoothness
`caption-demo.tsx`'s `SectionHeading.reveal()` (used for every section's eyebrow tag and body-copy
paragraph — 7 headings × 2 elements) previously used `animate-rise` (`index.css`: 1.2s, animates
`opacity` + `transform` + **`filter: blur(6px) → blur(0)`**). `filter: blur()` is the single most
expensive CSS property to animate — unlike opacity/transform it isn't cheaply compositable, so the
browser repaints the blurred region every frame the radius changes, and it was running on the body
copy, which can be a fairly wide paragraph, not a small tag. Every box added this phase uses
`RevealItem`'s existing `animate-fade-up` (`index.css`: 0.3s, opacity + `translateY` only, no
blur) — already the cheap, compositor-friendly path. `reveal()` was switched to the same
`animate-fade-up` class (and its `!isInView` pre-state to `animate-fade-up`'s own "from" frame:
`opacity: 0, translateY(8px)`, dropping the `translateY(26px)` + `blur(6px)`), so headings now use
the identical cheap keyframe every box on the page uses, and there is one fewer animated `filter`
property running at a time a down-scroll can now trigger many boxes' reveals in the same frame.
`wordReveal()` (the headline word-by-word mask-clip effect, `animate-mask-up` — already blur-free,
transform-only) was left untouched; it's the section's signature look, not the smoothness problem.
The hero's own `reveal()` in `LandingPage.tsx` (its blur-heavy `animate-rise`/`text-materialize`/
`word-reveal` set) is a one-time, page-load-triggered animation, not a down-scroll reveal, and was
left out of scope — the complaint followed a discussion of scroll-reveal behavior specifically.

## Files Modified
- `apps/web/src/components/landing/ToneSection.tsx`
- `apps/web/src/components/landing/SignalsSection.tsx`
- `apps/web/src/components/landing/TalkToEditSection.tsx`
- `apps/web/src/components/landing/StepsSection.tsx`
- `apps/web/src/components/landing/ClosingSection.tsx`
- `apps/web/src/components/landing/caption-demo.tsx` (`SectionHeading.reveal()` only)

## Files Intentionally Untouched
- `CaptionShowcaseSection.tsx`, `HinglishSection.tsx`, `dark/LandingFooter.tsx` — already fully
  covered before this phase.
- `AnimatedSection.tsx` — dead code, re-confirmed.
- `VoiceSphere.tsx` — not opened.
- `useInView.ts`, `dark/RevealItem.tsx` — the phase-12 mechanism itself needed no changes; this
  phase only added more consumers of it and lightened one existing consumer's keyframe choice.
- The hero (`LandingPage.tsx`)'s own reveal animations, and every section's continuous
  scroll-linked effects (`ClosingSection`'s headline split, `StepsSection`'s per-step `--steps-p`
  lighting, the Hinglish marquee) — different, already-reactive mechanisms, out of scope.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` errors only; zero errors
  in any changed file.
- `npx oxlint` on all six changed files: only the same pre-existing `only-export-components`
  fast-refresh warnings on `caption-demo.tsx` (that file mixed hook and component exports before
  this phase); no new warnings or errors.
- `npx vite build`: 2181 modules transformed (same count as every prior phase); fails only at the
  same pre-existing missing `livekit-client` dependency, unrelated and out of scope.

## Live Verification
**This phase closed the gap every prior phase (09/10/12) flagged as blocked**, by finding the
actual cause: this tool's `IntersectionObserver` doesn't fire for `scrollIntoView()`/
`window.scrollTo()` (JS-forced scroll-position changes — confirmed again, 0/many `opacity-0`
wrappers stayed hidden after several such calls), but it **does** fire for the `computer` tool's
`scroll` action (a real, extension-driven mouse-wheel gesture). Scrolling the whole page from the
hero to the footer this way, in ~10-tick increments with the `computer` tool:
- Every newly-wrapped box revealed correctly and in the right order: `CaptionShowcaseSection`'s
  upload row/frames/facts, `ToneSection`'s frame + controls (tab switching and the tone-layer
  toggle confirmed interactive after reveal), `SignalsSection`'s full score panel (readout, bars,
  pitch line, legend), all three `TalkToEditSection` columns (editor screenshot undistorted,
  RANGMANCH rendering "SAAAALLL" in pink, the chat panel's "make saaaal pink and bigger" step),
  `HinglishSection`'s three point cards, all four `StepsSection` steps (with the pre-existing
  rail-lit dimming on not-yet-reached steps still intact), and `ClosingSection`'s CTA paragraph +
  button.
- Scrolling back **up** past `SignalsSection` and `TalkToEditSection`, checked directly via
  `getBoundingClientRect`/className inspection: both reappeared with **no** `opacity-0` and **no**
  `animate-fade-up` class present — i.e. the settled final look, applied instantly, confirming the
  phase-12 no-replay-on-upward-scroll behavior still holds for every newly-added box, not just
  headings.
- Re-confirmed a downward-then-upward-then-downward-again cycle on `SignalsSection` specifically
  (scrolled past it going down, back up past it — instant, no fade — then observed it re-enter
  going down again): consistent with the phase-12 hysteresis/direction logic.
- Zero console errors throughout the entire scroll-through (checked via `read_console_messages`
  before and after).
- This also **retroactively strengthens** phases 09/10/12's "blocked" conclusions: those used
  `scrollIntoView`/`window.scrollTo`/`dispatchEvent('resize')`, none of which reliably drive this
  tool's `IntersectionObserver`; a real `computer.scroll` gesture does. Future sessions verifying
  scroll-reveal behavior in this tool should prefer `computer.scroll` over JS-forced scrolling.

## Unverified / Untestable
- Actual frame-rate/smoothness improvement from the blur→fade-up swap was not measured with a
  profiler (none available in this tool); the change is justified by the well-established cost of
  animating `filter: blur()` versus `opacity`/`transform`, not by a measured before/after number.
  If the page still feels laggy after this, the next places to look (not touched this phase, since
  the brief's evidence pointed at the reveal path specifically): `VoiceSphere.tsx`'s WebGL loop
  (locked, likely the largest single cost, out of reach without lifting that constraint), and the
  page's several `backdrop-blur-sm`/`backdrop-blur-md` badges, which are a scroll-compositing cost
  independent of any entrance animation — flagging as a design-affecting option, not applying it
  unilaterally.
- `prefers-reduced-motion` path was inspected, not observed live under an OS-level reduced-motion
  flag: both `RevealItem` and `SectionHeading` still short-circuit to a fully static render before
  any of the changed code runs, unchanged by this phase.

## Deviations
None from the brief's two asks. `SignalsSection.tsx` was rewritten via `Write` rather than patched
with `Edit`, purely to re-indent the block the new wrapper nests one level deeper than a chain of
partial edits would have left it — no content or logic changed beyond adding the `RevealItem` wrap.

## Git / Change Scope
Branch `Krish-landingpage`. Six files changed this phase (listed above), 397 insertions / 252
deletions across them per `git diff --stat`. `VoiceSphere.tsx`'s pre-existing unstaged modification
(from before this session) and the other already-uncommitted files from earlier phases remain
exactly as found — not staged, not touched by this phase. No commit made.

## Next Steps
- Owner: a real-device confirmation that the page feels smoother is still the strongest signal —
  this phase's smoothness change is a justified but unmeasured CSS-cost reduction, not a profiled
  fix.
- Owner: if lag persists, say whether `VoiceSphere.tsx`'s lock can be lifted for a perf pass, and/or
  whether trimming `backdrop-blur-sm`/`-md` badges is an acceptable visual tradeoff — both flagged
  above, neither applied.
- Owner: say go/no-go on committing; nothing has been staged or committed.
