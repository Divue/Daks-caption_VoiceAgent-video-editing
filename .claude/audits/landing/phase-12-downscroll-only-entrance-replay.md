# Landing: entrance animations only replay on a downward scroll (phase 12)

## Status
Implemented in the shared hook (`useInView`) and its two live consumers. Logic verified by a
standalone 10-event simulation (11/11 assertions pass, below). Live confirmation in this session's
browser tool is blocked exactly the way phase 10 already documented and re-confirmed here:
`IntersectionObserver` callbacks do not fire at all for this tool's tab, even after a real
`window.scrollTo` of several thousand pixels (checked directly — 0 of 74 heading-word spans had an
animation class after scrolling). No code change can work around that; it's this tool's tab-
visibility handling, not the page.

## Objective
Phase 10 made every section's entrance animation replay each time it re-enters the viewport,
regardless of scroll direction. This phase narrows that: scrolling back **up** past a section that
already played its animation should not replay it — the section should just be visible, already in
its settled state. Scrolling **down** into a section (first time or after leaving and returning)
should still play the animation, every time, for every component that has one.

## Find it first
Same two live call sites phase 10 found, both still the only ones rendered by `LandingPage.tsx`:
- `useInView` (`apps/web/src/hooks/useInView.ts`) — the shared hook; this is where the fix belongs,
  same as phase 10.
- `SectionHeading` (`apps/web/src/components/landing/caption-demo.tsx`) — headings for all six
  rendered sections (`CaptionShowcaseSection`, `ToneSection`, `SignalsSection`,
  `TalkToEditSection`, `HinglishSection`, `StepsSection`).
- `RevealItem` (`apps/web/src/components/landing/dark/RevealItem.tsx`) — used live by
  `CaptionShowcaseSection` and `HinglishSection` for individual block fade-ups.
- `AnimatedSection` (`apps/web/src/components/landing/AnimatedSection.tsx`) — re-confirmed dead
  code (not imported by `LandingPage.tsx`, same as phase 10 found); left untouched, since it isn't
  reachable and touching it has no observable effect on the live site.
- `VoiceSphere.tsx` — its own `IntersectionObserver` (WebGL pause/resume off-screen) is unrelated
  to entrance animations; not opened, per the hard constraint.

## Implementation
`useInView.ts`:
- Added a module-level scroll-direction tracker: one `scroll` listener (registered once, shared by
  every `useInView` call site rather than one listener per instance) updates `scrollDirection: 'up'
  | 'down'` by comparing consecutive `window.scrollY` reads. Defaults to `'down'` so a section
  already in view on first page load — before the user has scrolled at all — still gets its
  entrance animation instead of rendering as if already-seen.
- The hook now returns a second boolean, `shouldAnimate`, alongside the existing `isInView`.
  `isInView` keeps its exact phase-10 meaning (hysteresis: true from the show threshold until the
  element fully leaves at ratio 0). `shouldAnimate` is decided only at the false→true edge (tracked
  via a `wasInView` ref, not the `isInView` state itself, to avoid deciding it from inside a state
  updater): `shouldAnimate = scrollDirection === 'down'` at the moment the element becomes visible,
  and is left alone for the rest of that visible stretch (so mid-visibility jitter or direction
  changes while still in view can't retroactively turn an already-playing/played animation on or
  off).
- Callers now get three states instead of two: **not yet in view** (`!isInView` — pre-animation,
  hidden/offset), **entering on a downward scroll** (`isInView && shouldAnimate` — play the
  animation), and **entering on an upward scroll** (`isInView && !shouldAnimate` — show the settled
  final look immediately, no transition).

`SectionHeading` (`caption-demo.tsx`): `wordReveal`/`reveal` previously collapsed to a single
`playing` boolean (`motionSafe && isInView`) with two branches (hidden vs. animate). Removed
`playing`; both helpers now check `!isInView` (hidden, same offset/opacity as before) then
`!shouldAnimate` (new: return `{ className: '' }` — default rendering, no inline transform/opacity/
blur, no animation class — the exact settled look, applied instantly) before falling through to the
animate-class branch, unchanged.

`RevealItem` (`dark/RevealItem.tsx`): same three-way split, inlined as one expression —
`!isInView ? 'opacity-0' : shouldAnimate ? 'animate-fade-up' : ''`. Confirmed no caller passes its
own `opacity-0`/`animate-fade-up` in `className` (checked every live and dead call site), so the
empty-string case correctly falls back to the element's natural default appearance (opacity 1, no
transform) with no extra class needed.

`prefers-reduced-motion` path: unchanged in both consumers — `if (!motionSafe) return { className:
'' }` (`SectionHeading`) and the early static-render branch (`RevealItem`) are untouched, so
reduced-motion still renders everything immediately, statically, regardless of scroll direction.

## Files Modified
- `apps/web/src/hooks/useInView.ts`
- `apps/web/src/components/landing/caption-demo.tsx` (`SectionHeading` only)
- `apps/web/src/components/landing/dark/RevealItem.tsx`

## Files Intentionally Untouched
- `apps/web/src/components/landing/AnimatedSection.tsx` — dead code, re-confirmed this phase; not
  wired into the live site, so leaving its `useInView` destructure at `{ ref, isInView }` (ignoring
  the new `shouldAnimate`) has no observable effect. Not touched, to keep the diff to what's live.
- `VoiceSphere.tsx` — not opened.
- Every section file, `LandingNavbar.tsx`, `LandingBackground.tsx` — not touched; the fix is
  entirely in the shared hook and its two live consumers, per the brief's "every component" being
  satisfied by fixing the one shared mechanism, same as phase 10's approach.
- Copy, timing constants, stagger delays (`SECTION_STAGGER_BASE_MS`/`_STEP_MS`), keyframe
  definitions in `index.css` — unchanged; only the show/hide *decision* changed, not the animations
  themselves.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` errors only
  (`useVoiceInput.ts`); zero errors in any changed file.
- `npx oxlint` on the three changed files: only pre-existing `only-export-components` fast-refresh
  warnings on `caption-demo.tsx` (that file already mixed hook and component exports before this
  phase; unrelated to this change, not a lint error).
- `npx vite build`: 2181 modules transformed (same count as every prior phase); fails only at the
  same pre-existing missing `livekit-client` dependency (P4's voice module), unrelated and out of
  scope.
- **Standalone logic simulation** (Node, not the browser): extracted the exact
  `useInView`/`wasInView`/`shouldAnimate` decision logic into a pure `step()` function and fed it a
  10-event sequence covering mount off-screen, crossing the show threshold while scrolling down,
  jitter while fully visible (must not flip `shouldAnimate`), exiting at ratio 0, re-entering while
  scrolling **up** (must show but not animate), staying in view while still scrolling up (must not
  re-trigger), exiting again, and a fresh entry while scrolling down again (must animate). All 11
  assertions passed — output reproduced in this phase's session log.

## Live Verification
**Blocked**, confirmed directly rather than assumed from phase 10's note: navigated to the live
page, called `window.scrollTo(0, 3000)` then `window.scrollTo(0, 6000)` with waits in between (a
real, large, synchronous scroll position change — not a synthetic event), then queried every `<h2>`
on the page for word-spans carrying an `animate-*` class. Result: **0 of 74** spans across all seven
headings had an animation class, and no console errors were logged. This confirms `useInView`'s
`IntersectionObserver` never received a single callback in this tool's tab, for any section, at any
scroll position — a stricter version of the same tab-visibility-driven suppression phase 09/10
documented for `ResizeObserver`/`IntersectionObserver`, and (per phase 10) with no iframe or other
workaround available for `IntersectionObserver` specifically. This is a limitation of the
automation tool's tab, not evidence about the page's correctness.

## Unverified / Untestable
- The actual on-screen behavior — scroll down past a section (animation plays), scroll back up past
  it (no replay, it's just visible), scroll down again (animation plays again) — could not be
  observed in this session for the reason above. The logic simulation is the strongest evidence
  available from this tool; it is not a substitute for the owner watching it happen in a real tab.
- Whether the "snap to settled state" look (no transition at all, not even a quick fade) feels right
  visually on an upward re-entry, versus a softer non-repeating crossfade, is a judgment call the
  brief didn't specify beyond "don't show the animation" — implemented as instant/no-transition
  since that's the literal reading; flagging in case the owner wants a subtler treatment instead.

## Deviations
None from the brief. The scroll-direction tracker's default (`'down'`) for the pre-scroll state is
an implementation choice, not stated in the brief, made so first-load-in-view sections still animate
once rather than silently skipping their entrance — consistent with every prior phase's behavior
for that case.

## Git / Change Scope
Branch `Krish-landingpage`. Three files changed this phase, listed above. The pre-existing unstaged
`DESIGN.md` deletion, the untracked `PROJECT_LOG.md`, and all other already-modified/untracked
files from earlier phases remain exactly as found — not staged, not touched. No commit made this
phase.

## Next Steps
- Owner: the one thing this session's tooling cannot substitute for — scroll down past a couple of
  sections, confirm each one's heading/reveal blocks play their entrance animation, then scroll back
  up past them and confirm nothing replays, then scroll down again and confirm it replays normally.
- Owner: sanity-check the "instant, no transition" look on upward re-entry feels right; say if a
  softer treatment is wanted instead (see Unverified).
- Owner: say go/no-go on committing; nothing has been staged or committed.
