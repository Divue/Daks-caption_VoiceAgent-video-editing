# Landing: sections replay their entrance animation on re-entry (phase 10)

## Status
Implemented in the single shared hook the brief asked to look for. Logic verified by a standalone
simulation (below) and by re-reading both live consumers' reset behavior line by line. The actual
browser `IntersectionObserver` callback could not be made to fire live in this session's tool — a
harder version of the same limitation already documented in phases 05/06/09 — so the real-browser
scroll-down-then-up check is still owed to the owner.

## Objective
Sections below the hero currently animate in once and stay in their final state; scrolling back up
and down must not replay them. Fix in the shared mechanism, not per-section; must not flicker on
scroll jitter near the trigger line; must leave the hero and `VoiceSphere.tsx` untouched; must
still render immediately and statically under `prefers-reduced-motion`.

## Find it first (as requested)
Searched every `useInView`/`IntersectionObserver` usage in `apps/web/src`:
- `apps/web/src/hooks/useInView.ts` — **the shared hook**, and the actual bug: `observer.disconnect()`
  the first time `entry.isIntersecting` is true, so `isInView` only ever goes `false → true`, once.
- `apps/web/src/components/landing/caption-demo.tsx` (`SectionHeading`) — **live**, used by all six
  currently-rendered sections' headings (`CaptionShowcaseSection`, `ToneSection`, `SignalsSection`,
  `TalkToEditSection`, `HinglishSection`, `StepsSection`). Calls `useInView(0.3)`.
- `apps/web/src/components/landing/dark/RevealItem.tsx` — **live**, used by `CaptionShowcaseSection`
  and `HinglishSection` for individual block fade-ups. Calls `useInView()` (default).
- `apps/web/src/components/landing/AnimatedSection.tsx` — uses the same hook, but its only
  consumers (`AiEditingSection`, `CaptionStylesSection`, `CreatorSection`, `FinalCtaSection`,
  `HeroSection.tsx` [not the real hero — dead file], `HowItWorksSection`, `ValuePropsSection`) are
  none of them imported by `LandingPage.tsx`. Dead code; inherits the fix for free, changes nothing
  observable.
- `apps/web/src/components/VoiceSphere.tsx` — its own `IntersectionObserver` (added in phase 06,
  pauses the WebGL render loop off-screen) is unrelated to entrance animations and was not touched,
  per the hard constraint.
- The hero's reveal is gated by `introDone`/mount state in `LandingPage.tsx`, not this hook — out of
  scope by design, confirmed unchanged.

Conclusion: one hook, two live call sites, both purely presentational. Fixing `useInView.ts` alone
fixes both without editing either consumer file.

## Implementation
`apps/web/src/hooks/useInView.ts`, rewritten:
- Stopped calling `observer.disconnect()` on the first positive intersection — the observer now
  runs for the element's whole mounted lifetime (still `disconnect()`d on unmount, in the effect
  cleanup — no leak).
- Observes two thresholds, `[0, showThreshold]` (`showThreshold` is the same parameter each caller
  already passed — `0.3` for `SectionHeading`, the `0.15` default for `RevealItem`/
  `AnimatedSection` — so no call site needed to change).
- Decision rule, driven by `entry.intersectionRatio` rather than the boolean `isIntersecting`:
  `ratio >= showThreshold` → set visible; `ratio <= 0` → set hidden; anything **between** those two
  values leaves the current state alone. That band is the anti-flicker requirement: once visible,
  ordinary scroll jitter that dips below 30%/15% without ever reaching exactly 0 (i.e. without the
  element actually leaving the viewport) cannot reset it, and once hidden, jitter that doesn't
  reach the show threshold can't re-trigger it early.

Neither `SectionHeading` nor `RevealItem` needed changes: both already reset their inline
style/className to the pre-animation state whenever their derived "playing"/`isInView` boolean goes
false (checked in both files) — that behavior was previously dead code (the boolean could only ever
go true, once), and starts doing real work now.

## Files Modified
- `apps/web/src/hooks/useInView.ts` — the fix, see above.

## Files Intentionally Untouched
- `caption-demo.tsx` (`SectionHeading`), `dark/RevealItem.tsx` — read in full, unchanged; their
  existing reset branches were sufficient.
- `VoiceSphere.tsx` — not opened.
- `LandingNavbar.tsx`, `LandingBackground.tsx` — not touched.
- `LandingPage.tsx` (the hero) — not touched; its reveal doesn't use this hook.
- Animation keyframes/durations/easings/stagger constants (`index.css`, `SECTION_STAGGER_*`) —
  untouched, per "only whether it can replay."

## Testing
- `npx tsc -b`: same pre-existing, unrelated `livekit-client` error; none in `useInView.ts`.
- `npx oxlint src/hooks/useInView.ts`: clean.
- `npx vite build`: 2181 modules transformed; fails only at the same pre-existing missing
  `livekit-client` dependency (final resolve step), unrelated to this change.
- **Standalone logic simulation** (Node, not the browser): extracted the exact show/hide decision
  rule into a pure function and fed it a 19-step ratio sequence covering mount, crossing the show
  threshold, full visibility, jitter straddling the show line on the way out (0.20/0.14/0.20/0.13),
  a near-zero-but-not-zero ratio (0.001), the true zero crossing, and re-entry. All five
  assertions passed: becomes visible at the show threshold; jitter near that line does not flicker
  it off; a partially-visible ratio (0.05) and a near-gone ratio (0.001) do not reset it early; it
  resets only at ratio 0; it replays (becomes visible again) on re-entry. Output and pass/fail
  reproduced in this phase's session log.

## Live Verification
**Blocked, harder than previous phases' limitation.** `IntersectionObserver` was tested three ways
in this tool's tab and did not fire in any of them within a 2-second window: (1) directly in the
top-level tab, (2) inside a freshly-created same-origin `<iframe>` (the technique that successfully
gave a real, independent viewport for the phase-09 responsive checks — worked there because that
relied on `ResizeObserver`/layout, not `IntersectionObserver`), (3) implicitly, since neither
approach's synthetic probe observer ever received a callback. This is a stricter version of the
`visibilityState: "hidden"` throttling already documented for `requestAnimationFrame` and
`ResizeObserver` in earlier phases — apparently Chromium withholds `IntersectionObserver` callbacks
entirely for this kind of backgrounded tab, with no resize-style workaround available. No amount of
retrying this specific check inside this tool will produce a different result; did not keep
retrying once confirmed on the second technique.

## Unverified / Untestable
- The actual on-screen replay: scrolling down past a section, back up, and confirming its entrance
  animation plays again, with no flicker at the boundary and nothing left stuck mid-animation. The
  logic simulation above is the strongest evidence available from this tool; it is not a substitute
  for watching it happen in a real tab.
- `prefers-reduced-motion` path specifically: code inspection confirms `SectionHeading` and
  `RevealItem` both ignore `isInView` entirely when `motionSafe` is false (render fully visible,
  static, immediately, unconditionally) — so the fix cannot affect that path — but this was not
  observed live with the OS/browser reduced-motion flag set.

## Deviations
None from the brief. `showThreshold` values (`0.3`, `0.15`) are the ones already in the code before
this phase — the brief's "e.g. ~20%" was an example, not a mandated number, so existing per-call
values were left as-is; only the mechanism (hysteresis + no disconnect) changed.

## Git / Change Scope
Branch `Krish-landingpage`. Only `apps/web/src/hooks/useInView.ts` changed this phase. `git status`
shown to the owner before any commit; `DESIGN.md`'s pre-existing unstaged deletion and the untracked
`PROJECT_LOG.md` remain exactly as found, not staged, not touched. No commit made.

## Next Steps
- Owner: the one thing this session cannot substitute for — scroll down past a couple of sections
  and back up in a real tab, confirm every section's heading/reveal blocks replay, nothing flickers
  crossing a section boundary at normal or slow scroll speed, and nothing is left stuck mid-animation.
- Owner: confirm the reduced-motion path (OS-level "reduce motion" setting) live if that matters for
  this release — inspected only, not observed.
