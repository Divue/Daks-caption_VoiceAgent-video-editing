# Landing: fix reveal "pop-in" and scroll jank — root causes and fixes (phase 15)

## Status
Implemented. The two root causes explicitly diagnosable from source were confirmed present and
fixed (late trigger point, short duration/small distance); the missing-`will-change` gap was
confirmed and closed; every other candidate cause the brief listed was audited and found already
correct (see below, each marked found/not-found). Live-verified with hard measurement, not just
visual inspection — see Live Verification.

## Objective
Diagnose, in the order given, why the down-scroll reveals read as popping in already-positioned
rather than animating, and why scrolling itself felt janky; fix both; report the actual root causes
and every file touched. Hard constraints: `VoiceSphere.tsx` locked, no copy/layout/spacing/structure
changes (timing/easing/distance/trigger/performance only), no animation library, navbar/
`LandingBackground`/hero untouched, `prefers-reduced-motion` still immediate-and-final.

## Root causes — Problem 1 (pop-in), checked in the brief's own order
1. **Trigger point too late — FOUND.** `useInView` had no `rootMargin`; the show threshold was
   evaluated only against the *actual* viewport, so an element only started animating once already
   partway inside it. Combined with a short duration (below), the travel was finished (or nearly so)
   before the user had scrolled far enough to actually watch it happen.
2. **Duration too short — FOUND.** The scroll-reveal system's keyframes ran at 0.3s.
3. **Distance too small — FOUND.** 8px (small elements) / 16px (cards, from phase 14) — both well
   under a perceptible travel distance at normal scroll speed.
4. **Final state applied on mount rather than on intersection — NOT FOUND as a distinct bug.**
   Every reveal site's initial render (before the observer's first callback) correctly renders the
   *hidden* pre-state (`opacity-0` class, or the equivalent inline `opacity:0`/`transform` pair),
   not the final settled look — checked directly in each of `RevealItem`, `StepItem`, and
   `SectionHeading`. The reported symptom is fully explained by causes 1–3 compounding: a late
   trigger *and* a short duration *and* a small distance together are visually indistinguishable
   from "no animation, just appears," even though a real (tiny, late, brief) animation was playing.
5. **Easing linear/ease-in — NOT FOUND.** Already `cubic-bezier(0.16, 1, 0.3, 1)` — the exact curve
   the brief asks for — on every reveal in this system (`--animate-fade-up`/-lg` at the time,
   inherited from phase 13/14). No change needed; kept it.

## Root causes — Problem 2 (scroll jank), checked in the brief's own order
1. **Too many `IntersectionObserver` instances — FOUND, already fixed in phase 14.** Re-confirmed
   present (one shared observer per (threshold, rootMargin) pair, not per element) and left as-is.
2. **Non-transform/opacity animated properties — NOT FOUND, in the reveal system.** Audited every
   keyframe and inline style this system touches (`fade-up`-family, `mask-up`, the `!isInView`
   pre-states in `RevealItem`/`StepItem`/`SectionHeading`): opacity and `transform: translateY(...)`
   only, nowhere else. (`StepsSection`'s rail fill uses `transform: scaleX/scaleY`, also compliant.
   `ToneSection`'s tone-layer toggle animates `left` via `transition-all` — a real forced-layout
   property, but it's a click-triggered switch, not part of the scroll-reveal system or triggered by
   scrolling; flagging it as an existing, unrelated finding rather than fixing it, since the brief's
   hard constraints scope this pass to "timing, easing, distance, trigger points and performance" of
   the *reveal* system, and touching an unrelated interactive control's animation wasn't asked for.)
3. **Missing `will-change` — FOUND.** Never applied anywhere in the reveal system before this phase.
4. **Observer callback doing heavy/synchronous work — NOT FOUND.** The shared observer's callback
   reads one module-level variable (`scrollDirection`) and calls `setState` — no layout reads
   (`getBoundingClientRect` etc.), no other synchronous work.
5. **Too many elements animating simultaneously — already addressed in phase 14's granularity
   decisions** (cards/panels are one atomic reveal unit; list items are individually staggered but
   capped after ~6; interactive control clusters aren't subdivided). Re-confirmed no section fires
   more than a handful of concurrent reveals. No new change needed.

## Implementation
**`hooks/useInView.ts` — early trigger via `rootMargin`.** Added `ROOT_MARGIN = '0px 0px 15% 0px'`
as the shared default: a *positive* bottom margin, which *grows* the observed area 15% of the
viewport height past the actual bottom edge before intersections are computed — the standard
"start early" lazy-reveal pattern (a negative value would do the opposite: shrink the area and
trigger *later*, which is why the brief's own phrasing was read for its stated goal — "start the
reveal while the element is still slightly below the fold" — rather than followed literally on the
sign of the margin, which would have made the reported problem worse, not better). `showThreshold`'s
default was also lowered from `0.15` to `0`, so a reveal fires the moment any part of the element
enters that extended zone, rather than needing 15% of it to already overlap. The observer pool's key
now includes `rootMargin` (previously threshold alone), since both are constructor-time
`IntersectionObserver` options.

**`hooks/useInView.ts` / `dark/RevealItem.tsx` — `will-change` lifecycle.** Added
`useAnimationLifecycle(isAnimating)`: applies `will-change: transform, opacity` the moment
`isAnimating` (`isInView && shouldAnimate`) turns true, and removes it via a `settled` flag flipped
by the element's own `animationend` event — guarded with `event.target === event.currentTarget` so
an unrelated nested animation finishing first (e.g. the chat panel's own internal pulse/fade
effects, which the brief says must keep animating on their own timeline) can't bubble up and clear
the hint prematurely. `settled` resets (via a plain `useEffect`, not the render-time-ref variant of
this pattern — see the code comment for why that tradeoff was made) whenever the element stops
animating, so a later re-entry gets a fresh cycle. `RevealItem` and `StepItem` (`StepsSection.tsx`)
both use this now; a section heading's eyebrow and body copy share one `useAnimationLifecycle` call
(they share one `useInView`/`isAnimating` already) but only the *later*-finishing element (body
copy, when present — it always has the larger delay) is wired to `onAnimationEnd`, so `will-change`
isn't torn down on both while the body is still mid-animation.

**`index.css` — new dedicated keyframes, not a retimed shared one.** The existing `--animate-fade-up`
(0.3s, 8px) turned out to be shared by `LandingNavbar`'s dropdown items and by
`TalkToEditSection`'s own internal replay lines (its "tool call" list entries) — both explicitly out
of scope (navbar is a hard constraint; the chat panel's internal animation is explicitly not to be
touched). Retiming `fade-up` itself would have silently changed both. Instead added
`--animate-reveal-sm` / `--animate-reveal-lg` (both `0.65s cubic-bezier(0.16, 1, 0.3, 1) both`,
20px / 32px distance respectively — within the brief's 24–40px guidance for the larger size, and
still a real, visible travel for the smaller one, up from 8/16px) and repointed the scroll-reveal
system (`revealClass` in `dark/RevealItem.tsx`, `SectionHeading.reveal()` in `caption-demo.tsx`) to
use these instead. `--animate-fade-up` itself, and its two other consumers, are untouched.

**`caption-demo.tsx` — `SectionHeading`'s eyebrow/body reveal** switched from `animate-fade-up` to
`animate-reveal-sm`, its `!isInView` pre-state distance updated to match (`translateY(20px)`), and
wired into the shared `will-change` lifecycle as described above. `wordReveal` (the headline's own
word-by-word mask-up effect) benefits from the same `rootMargin` fix automatically (same shared
`useInView` call) but was otherwise left alone — it's transform-only already (cheap) and is the
section's signature look, not implicated in the "pop" complaint, which was about the fade-based
eyebrow/body/card/list-item reveals.

## Files Modified
- `apps/web/src/hooks/useInView.ts` — `rootMargin` support, lowered default threshold,
  `useAnimationLifecycle`.
- `apps/web/src/index.css` — `--animate-reveal-sm`/`-lg` (new), `--animate-fade-up` untouched.
- `apps/web/src/components/landing/dark/RevealItem.tsx` — new keyframe names, `will-change`
  lifecycle wired in.
- `apps/web/src/components/landing/StepsSection.tsx` — `StepItem` wired into the same lifecycle.
- `apps/web/src/components/landing/caption-demo.tsx` — `SectionHeading`'s `reveal()` switched to
  the dedicated keyframe + distance + lifecycle.
- Every other section that consumes `RevealItem` (`CaptionShowcaseSection.tsx`, `ClosingSection.tsx`,
  `HinglishSection.tsx`, `SignalsSection.tsx`, `TalkToEditSection.tsx`, `ToneSection.tsx`,
  `dark/LandingFooter.tsx`) needed **no code changes this phase** — they inherit the new timing,
  distance, trigger point and `will-change` handling automatically through the shared component;
  confirmed via `git diff`, none of these files appear in this phase's changes.

## Files Intentionally Untouched
- `LandingNavbar.tsx` — still uses the original, untouched `--animate-fade-up` (0.3s/8px); its own
  dropdown motion is unchanged, per hard constraint and per the "don't retime the shared keyframe"
  reasoning above.
- `LandingBackground.tsx`, `VoiceSphere.tsx` (not opened), the hero (`LandingPage.tsx`) — untouched,
  per hard constraints.
- `TalkToEditSection.tsx`'s internal "tool call" replay lines — still use `--animate-fade-up`
  unchanged; they're the chat panel's own internal animation, explicitly not part of this pass.
- `ToneSection.tsx`'s tone-layer toggle `left` transition — a pre-existing, click-triggered,
  non-scroll animation; flagged above as a real (if unrelated) non-transform-property finding, not
  fixed, since it's out of this pass's scope.
- Copy, layout, spacing, DOM structure — unchanged beyond the class/style/keyframe substitutions
  this fix required.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` errors only; zero errors in
  any file this phase touched.
- `npx oxlint` on all five changed files: one pre-existing-category warning
  (`dark/RevealItem.tsx`'s `only-export-components`, since it exports both a component and a
  helper — same as `caption-demo.tsx` already had three of). One warning surfaced and was
  *resolved*, not just noted: `react(set-state-in-effect)` on the first draft of
  `useAnimationLifecycle` (a `useEffect` resetting `settled`). Tried the alternative React
  recommends (mutating a ref during render instead), which traded that warning for a different one
  (`react(refs)`, "cannot access refs during render") — kept the `useEffect` version since it's the
  more conventional, more obviously-correct-to-a-future-reader pattern, and the cost (one extra
  lightweight re-render per reveal) isn't where this task's actual jank was coming from; documented
  the tradeoff in the code comment.
- `npx vite build`: 2181 modules transformed (same count as every prior phase); fails only at the
  same pre-existing missing `livekit-client` dependency, unrelated and out of scope.

## Live Verification
- **Trigger point — measured directly, not just observed.** Attached a diagnostic
  `IntersectionObserver` (identical `threshold`/`rootMargin` to the app's own) to a section heading
  and scrolled toward it with the `computer` tool's real wheel-scroll. It fired at
  `intersectionRatio: 0.393` (comfortably past `SectionHeading`'s `0.3` threshold) while the
  element's `getBoundingClientRect().top` was `934.66px` against a `898px`-tall viewport — i.e. the
  element's top edge was still **36.66px below the visible viewport**, not yet on screen, when the
  reveal condition was already satisfied. Cross-checked against the real app's own DOM at that same
  scroll position: the eyebrow `<p>` already carried `animate-reveal-sm` and
  `will-change: transform, opacity` in its computed style. This is hard, reproducible evidence the
  early-trigger fix works, not an inference from a screenshot.
- **`will-change` lifecycle — verified by dispatching the completion event directly**, since CSS
  animation playback itself doesn't progress in this tool's backgrounded tab for the same reason
  phases 13/14 already documented (frozen mid-fade, confirmed again here: an element's opacity held
  at a fixed value across a 2-second wait). Dispatched a synthetic `animationend` on the
  later-finishing element (the body copy) and confirmed, via `getComputedStyle`, that
  `will-change` dropped to `auto` on **both** the body copy and the eyebrow (the shared-lifecycle
  design working as intended — neither element's hint is cleared until the *last* one finishes).
  Separately, one `TalkToEditSection` column (visited earlier in the same real-scroll pass) had
  already reached the settled state naturally — `animate-reveal-lg` applied, no `will-change` in its
  style — suggesting the CSS engine does sometimes complete animations in this tool given enough
  real wall-clock time between tool calls; the earlier "frozen" observation and this one aren't
  contradictory, just inconsistent, which is itself consistent with a backgrounded-tab throttling
  artifact rather than a deterministic bug.
- **No double-application of the fix**: confirmed via `grep` that `animate-fade-up` (the untouched,
  shared keyframe) appears only in `LandingNavbar.tsx` and `TalkToEditSection.tsx`'s internal lines;
  every scroll-reveal site uses the new `animate-reveal-sm`/`-lg` exclusively.
- **Zero console errors** throughout the entire scroll/measurement pass (`read_console_messages`,
  checked after all navigation and probing).

## Unverified / Untestable
- **Actually watching the travel with human eyes, at normal scroll speed, for the "does it *feel*
  right" judgment** — the measurement above proves the mechanism (early trigger, real distance,
  will-change lifecycle) is correct, but this tool's frozen/inconsistent animation playback means a
  full, fluid 650ms motion was never directly *seen* completing in this session. The DOM-state
  evidence is as strong as this tool can produce; a real, unthrottled browser is the remaining check.
- **`prefers-reduced-motion` live under the actual OS flag** — same gap phases 13/14 already
  disclosed for the same reason (no CDP media-emulation control exposed to this session's tooling).
  Verified by code inspection only: every reveal site's `!motionSafe` branch still renders
  immediately with no ref attached (so the shared observer never observes it) and no reveal
  class/style applied — unchanged by this phase's edits, and the same pattern already proven correct
  in phase 13.
- **Real-device scroll-performance feel** (no stutter at fast scroll speed) — the structural
  causes this tool's tooling can check (observer count, animated-property audit, callback weight,
  concurrency) are all confirmed clean, but frame-rate/jank itself needs a profiler or a real device,
  neither available here.

## Deviations
One, stated plainly: **the brief said "using a negative bottom rootMargin" to trigger the reveal
earlier; a negative bottom margin shrinks the observed area and triggers *later*, the opposite of
the stated goal.** Implemented a *positive* `0px 0px 15% 0px` instead, which is the standard,
well-established way to achieve "start before the element is visible" (the exact pattern used for
early-triggered lazy-loading everywhere this technique appears) — and confirmed, per the Live
Verification section above, that it does what the brief actually asked for. Flagging this
explicitly rather than silently doing the opposite of what was requested.

## Git / Change Scope
Branch `Krish-landingpage`. Five files changed this phase (listed above), 325 insertions / 58
deletions per `git diff --stat`. `git status` shown to the owner before any commit, per the
project's standing rule; `DESIGN.md`'s pre-existing unstaged deletion remains untouched, not staged.
Nothing has been staged or committed this phase.

## Next Steps
- Owner: a real, unthrottled browser is the strongest remaining check — slow scroll top to bottom
  confirming each element visibly travels into place, fast scroll confirming no stutter, and the
  reduced-motion path under an actual OS toggle. All three are things this session's tooling
  measured indirectly (DOM state, ratios, dispatched events) but could not watch happen directly.
- Owner: say if the flagged-but-unfixed `ToneSection` toggle (`left` transition, forces layout) is
  worth a follow-up — it's real, but click-triggered and outside this pass's "scroll reveal" scope.
- Owner: say go/no-go on committing; nothing has been staged.
