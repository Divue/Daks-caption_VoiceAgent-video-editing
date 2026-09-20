# Landing: hero scroll-clip border, and hero-style entrance for section headings (phase 05)

## Status
Implemented and verified by typecheck/lint plus a live dev-server pass in a Chrome automation
tab. The border fix was visually confirmed pixel-for-pixel against the owner's own screen
recording of the reference site. The section-entrance trigger (`IntersectionObserver`) could
**not** be observed firing live in the automation tab — a pre-existing, already-documented
limitation of this tool (see `HANDOFF.md`'s gotcha and the Unverified section below), not a new
one. Its pre-trigger DOM state and delay math were verified directly instead.

## Objective
Two requests from the owner, given as a screen recording of a reference site (GiGi Energy Drink
landing page) and a follow-up instruction:
1. On scroll, the hero's headline currently slides left/right and fades via opacity with nothing
   stopping it — no "border." The reference site's headline disappears by scrolling behind its own
   navbar, which turns fully opaque once scrolled, creating a hard clip line. The owner wants our
   hero to disappear behind an equivalent hard edge, on top of (not instead of) the slide/fade we
   already have.
2. Every section below the hero should play the **same reveal language as the hero's own opening**
   (per the owner's explicit pick from the options offered: "Word mask-rise + staggered fade-up"),
   the first time it scrolls into view — not the continuous scroll-scrubbed slide-in the sections
   had before.

## Implementation

### 1. The border
`apps/web/src/components/landing/LandingNavbar.tsx`'s `scrolled` state already existed
(`window.scrollY > 8`) and already switched the fixed header's background; it just wasn't opaque
(`bg-canvas/80 backdrop-blur-xl`), so hero content scrolling underneath it stayed partly visible
instead of being cut off. Changed the scrolled background to fully opaque `bg-canvas` (`#0a0a0c`)
and dropped the now-pointless `backdrop-blur-xl`/`backdrop-filter` transition (nothing shows
through an opaque layer, so blurring it did nothing but cost paint). No other logic changed: the
hero's existing `--hero-p`-driven slide/fade (`LandingPage.tsx`) is untouched — it now simply
terminates at a hard edge instead of fading into nothing, matching the reference recording.

Confirmed by extracting frames from the owner's screen recording (`cv2`, no `ffmpeg` on this
machine) showing the reference navbar going solid before the heading reaches it, then live in a
Chrome automation tab: before the fix, "Create, Caption, and Edit" was clearly visible through the
transparent/blurred nav; after, a zoomed screenshot shows the heading's top half cut off exactly at
the navbar's bottom edge, letters sliced clean.

### 2. Section entrance
`apps/web/src/components/landing/caption-demo.tsx`'s `SectionHeading` — used by all six redesign
sections (Showcase, Tone, Signals, Talk-to-edit, Hinglish, Steps) — previously used
`useScrollVar('--in', ...)` to continuously slide each line in from the side as the user scrolled,
explicitly documented as "the hero's scroll split, in reverse." Replaced that mechanism with the
hero headline's own technique (`HeroHeadline` in `LandingPage.tsx`): each word sits in its own
`overflow-hidden` mask box and rises via the existing `animate-mask-up` keyframe
(`translateY(115%) rotate(6deg)` → resting), staggered per word (`SECTION_STAGGER_BASE_MS = 80`,
`SECTION_STAGGER_STEP_MS = 70`); the eyebrow and body copy fade up via the existing `animate-rise`
keyframe, the same way the hero's own sub-elements do. The trigger is now a one-shot
`useInView` (existing hook, already used by `AnimatedSection.tsx` elsewhere in the codebase) instead
of continuous scroll position, so it plays once, the first time the section is ~30% visible, and
holds its resting state afterward — it does not replay on scroll-up.

Both `wordReveal(delayMs)` and `reveal(delayMs)` helper closures return no animation/hidden inline
styles at all when `motionSafe` is false, preserving the reduced-motion contract ("everything
static") already required by the handoff.

## Files Modified
- `apps/web/src/components/landing/LandingNavbar.tsx` — scrolled header background now opaque
  (`bg-canvas` instead of `bg-canvas/80 backdrop-blur-xl`); dropped `backdrop-filter` from the
  header's transitioned properties.
- `apps/web/src/components/landing/caption-demo.tsx` — `SectionHeading` rewritten to use
  `useInView` + the hero's word-mask-rise/rise keyframes instead of `useScrollVar`-driven
  continuous slide; added `Fragment` and `useInView` imports; added
  `SECTION_STAGGER_BASE_MS`/`SECTION_STAGGER_STEP_MS` constants. `useScrollVar` itself is
  untouched and still exported/used elsewhere (hero, `ClosingSection`, `StepsSection`).

## Files Intentionally Untouched
- The six locked original `landing/*Section.tsx` files (`AiEditingSection`, `CaptionStylesSection`,
  `CreatorSection`, `FinalCtaSection`, `HeroSection`, `HowItWorksSection`, `ValuePropsSection`) and
  everything in `landing/dark/` — per `HANDOFF.md`, and none of them are rendered by the current
  `LandingPage.tsx` tree.
- `LandingBackground.tsx` — owner said keep as-is; not touched.
- `services/`, `remotion/`, `packages/shared` — out of `apps/web` scope, not touched.
- `DESIGN.md` (deleted in the working tree) and `PROJECT_LOG.md` (untracked) — pre-existing local
  state from before this session, unrelated to this change, left as found; flagged to the owner
  separately.

## Architecture
No new mechanisms: reuses existing keyframes (`mask-up`, `rise`, defined in `index.css`), the
existing `useInView` hook (`src/hooks/useInView.ts`), and the existing `scrolled` boolean already
computed by `LandingNavbar`. Nothing new was added to the animation vocabulary — the change is
which existing primitive drives which element, and via what trigger (scroll-value vs.
one-shot-in-view).

## Ownership
All changes are inside `apps/web`, in files already owned by the landing redesign work (P3 /
whoever owns the landing branch). No schema, API, or cross-folder change. No coordination needed
per the ownership table in root `CLAUDE.md`.

## Testing
- `npx tsc -b` (apps/web): fails, but only on a pre-existing, unrelated error —
  `src/hooks/useVoiceInput.ts(2,33): Cannot find module 'livekit-client'` (P4's voice module;
  `node_modules/livekit-client` is not installed in this checkout). Confirmed pre-existing by
  `git stash`-ing this phase's changes and re-running `tsc -b`: identical three errors, same file,
  same lines. No errors in either changed file.
- `npx oxlint src` (apps/web, full project): no new warnings. The only warnings on the two changed
  files are the same pre-existing `only-export-components` (Fast Refresh) notices already recorded
  in phase 04's self-audit for `caption-demo.tsx`; every other warning is in unrelated editor files.
- `npm run build`: not run to completion — blocked by the same pre-existing `tsc -b` error above
  (build script is `tsc -b && vite build`), not by anything in this phase's diff.
- `npm run check:captions`: not run this phase (no caption/style/schema data touched).

## Live Verification
- **Border fix**: verified live. Loaded the running dev server (`http://localhost:5178`) in a
  Chrome automation tab, waited out the load intro, scrolled, and took a zoomed screenshot of the
  navbar/heading overlap region — the heading is now cut hard at the navbar's bottom edge with the
  navbar rendered as a solid `#0a0a0c` bar, matching the reference recording's behavior frame for
  frame.
- **Section entrance trigger**: **not observed firing live**. This Chrome automation tab reports
  `document.visibilityState === 'hidden'` (confirmed directly), and a manual
  `IntersectionObserver` test against the exact heading container — fully on-screen at the time —
  timed out after 2s with no callback at all. This is the same limitation `HANDOFF.md` already
  documents for `requestAnimationFrame`/CSS-transition progress in this tool, extended here to
  `IntersectionObserver`. Instead verified structurally: before scroll, the first word's inline
  style resolved to `matrix(0.9945, 0.1045, -0.1045, 0.9945, 0, 65.68)` — i.e.
  `translateY(115%) rotate(6deg)`, the exact `mask-up` "from" keyframe — confirming the hidden
  pre-trigger state renders correctly, and confirmed via `fetch` of the served module that the
  browser was running this phase's actual source, not a stale bundle. The stagger math itself
  (`SECTION_STAGGER_BASE_MS`/`STEP_MS`) was hand-checked against the Tone section's real word
  counts and produces increasing, non-overlapping delays in the same ~200–1000ms range the hero
  itself uses.

## Unverified / Untestable
- Whether the section entrance actually plays smoothly in a real, foreground browser tab — blocked
  in this environment by the automation tab's `visibilityState: hidden`, which appears to suspend
  `IntersectionObserver` callbacks entirely (not just throttle them; a 2-second wait produced
  zero callbacks). **The owner should scroll through the live page once themselves** to confirm the
  reveal reads as intended, per the same standing gotcha `HANDOFF.md` already calls out for motion
  work in this tool.
- Full production `npm run build` — blocked by the pre-existing missing `livekit-client` dependency,
  unrelated to this phase.
- Mobile/narrow-viewport wrapping of the now-per-word `SectionHeading` markup was not visually
  checked at a phone width in this session.

## Deviations
None from the two requests as clarified with the owner. Note for the record: the previous author's
comment on the old `SectionHeading` described its slide as a deliberate "mirror of the hero's exit
split" — this phase replaces that design choice per the owner's explicit direction (picked "Word
mask-rise + staggered fade-up" when offered as an option), not as an oversight.

## Git / Change Scope
Branch `Krish-landingpage`, based on `master` at commit `340cbbf` (already contains the merged
`landing-redesign` PR #18). Working tree also has a pre-existing uncommitted deletion of root
`DESIGN.md` and an untracked root `PROJECT_LOG.md`, both present before this phase started and
unrelated to it — left untouched, flagged to the owner. `git diff --stat` for this phase's own
changes: `LandingNavbar.tsx` (+4/-2 lines net effectively, small), `caption-demo.tsx` (+56/-16
roughly, `SectionHeading` rewrite). No other files touched.

## Next Steps
- Owner: scroll the live hero and each section on a real desktop tab (and ideally a phone) to
  confirm both effects read as intended — this is the one thing this environment could not verify.
- Owner: decide whether the reduced border/navbar treatment should also change the mobile
  slide-down nav panel's own background (currently `bg-canvas/98`, already near-opaque, untouched).
- If the owner wants the section entrance to also *retrigger* on scrolling back up and down again
  (rather than once, ever), that's a small follow-up change to swap `useInView`'s one-shot
  `disconnect()` for a toggling observer — not done here since "the first time it scrolls into
  view" was the given spec.
