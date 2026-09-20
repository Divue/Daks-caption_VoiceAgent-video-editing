# Landing: dev-server mix-up, scroll-sensitivity tuning, and sphere render-loop pause (phase 06)

## Status
Root cause of "nothing changed" found and fixed (a stray browser tab pointed at an unrelated
project's dev server). Two follow-up requests implemented: reduced scroll sensitivity on three
scroll-driven effects, and a real, structurally-verified fix for scroll jank caused by
`VoiceSphere`'s render loop never pausing when off-screen. The tuning and the sphere-pause fix's
*feel* could not be observed live in this environment — same tooling limitation as phase 05's
`IntersectionObserver` gap, explained below — and need the owner's own confirmation.

## Objective
The owner reported that phase 05's border/section-entrance changes appeared to have had no effect
at all, and asked for two more things: (1) the page reacting too strongly to a small amount of
scroll, and (2) visible lag/stutter when scrolling from the hero into the first section below it.

## Root cause of "nothing changed"
Not a code regression. `netstat`/`Get-CimInstance` showed a node process listening on port 5173
(Vite's default) whose command line resolved to `C:\Users\DELL\voice-video-editor\...\vite.js` —
a **different, unrelated project directory**, not this repo. Anyone opening `localhost:5173` out
of habit would land on that other app, not this one, and would see none of phase 05's changes
because they were never looking at this codebase. Separately, five more `vite` processes for
*this* repo were found running on ports 5183–5189, orphaned from earlier sessions and never shut
down. Killed all of the redundant same-repo instances (kept the one on port 5178, already
confirmed to be serving this phase's code). Left the unrelated `voice-video-editor` process on
5173 untouched — it is outside this repo and not this tool's process to manage; **the owner should
close that tab/stop that server themselves** if they don't need it, to avoid this happening again.
**The correct URL for this project for the remainder of this session is `http://localhost:5178/`.**

## Implementation

### 1. Scroll sensitivity
Three scroll-driven effects used `useScrollVar` ranges narrow enough that a single scroll gesture
(well under one screen height) drove the entire transform from 0 to 1, reading as an overreaction
to a small scroll input. Widened all three (values only, no mechanism change):
- `apps/web/src/pages/LandingPage.tsx:131` — hero exit (`--hero-p`): `0, -0.6` → `0, -1.2`
  (0.6 screens of scroll to complete → 1.2 screens).
- `apps/web/src/components/landing/ClosingSection.tsx:14` — closing CTA reveal (`--close-p`):
  `1, 0.35` → `1, -0.3` (0.65-screen range → 1.3).
- `apps/web/src/components/landing/StepsSection.tsx:29` — steps rail fill (`--steps-p`):
  `0.85, 0.35` → `0.85, -0.15` (0.5-screen range → 1.0).

`SectionHeading`'s own scroll coupling was already replaced with a one-shot `IntersectionObserver`
trigger in phase 05, so it wasn't part of this "too reactive to continuous scroll" complaint and
wasn't touched again here.

### 2. Hero→section scroll jank
`apps/web/src/components/VoiceSphere.tsx`: the sphere's WebGL `requestAnimationFrame` loop
(established at mount, ~line 746 onward) ran forever, unconditionally, once started — it kept doing
a full per-frame `getBoundingClientRect()` read, spring/rotation math, and a WebGL draw call even
after the sphere had scrolled completely out of view into the next section, competing with the
browser's own scroll compositing on the same thread. There was no visibility check anywhere in the
file (`grep` for `IntersectionObserver`/`document.hidden`/`cancelAnimationFrame` before this change
found only the three pre-existing unmount-time `cancelAnimationFrame` calls).

Added `startLoop()`/`stopLoop()` wrappers around the existing `frame()` scheduling, and a new
`IntersectionObserver` (alongside the pre-existing `ResizeObserver` on the same `parent` element)
with `rootMargin: "100% 0px"` — the loop now stops entirely once the sphere is more than one
viewport away, and restarts before it would scroll back into range, so there's no visible pop when
it resumes. `entranceStart` (the intro-timing epoch) is a `const` captured once outside `frame()`,
so pausing/resuming never perturbs the one-time intro animation's timing. `dt` was already clamped
to 100ms max (pre-existing), so no extra clamping was needed for the resume frame.

## Files Modified
- `apps/web/src/pages/LandingPage.tsx` — widened `--hero-p` scroll range.
- `apps/web/src/components/landing/ClosingSection.tsx` — widened `--close-p` scroll range.
- `apps/web/src/components/landing/StepsSection.tsx` — widened `--steps-p` scroll range.
- `apps/web/src/components/VoiceSphere.tsx` — added `startLoop`/`stopLoop` and an
  `IntersectionObserver` that pauses the render loop when scrolled far out of view.

## Files Intentionally Untouched
Same boundaries as phase 05 (six locked original section files, `landing/dark/`,
`LandingBackground.tsx`, `services/`, `remotion/`, `packages/shared`) — none of this phase's fixes
needed to touch them. `DESIGN.md`/`PROJECT_LOG.md` pre-existing local state, still untouched.

## Ownership
All changes inside `apps/web`; `VoiceSphere.tsx` is the handoff's explicitly-flagged
"locked" file, unlocked here at the current owner's direct request (fixing reported scroll jank),
same basis phase 05 used for `LandingNavbar.tsx`/`caption-demo.tsx`. No schema/API/cross-folder
change.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` module error as phase 05
  (confirmed unrelated in that phase via `git stash`); no errors in any of the four files this
  phase touched.
- `npx oxlint` on all four changed files: zero warnings or errors.
- Dev server reload on the corrected port (5178) after the `VoiceSphere.tsx` change: page loads,
  intro plays, sphere renders, zero console errors on a fresh navigation (console tracking was
  active from before the reload) — the riskiest edit (adding an observer to the sphere's mount
  effect) did not break anything.

## Live Verification
- **Dev-server mix-up**: verified directly — `Get-CimInstance Win32_Process` command lines proved
  the port-5173 process's working directory, and the redundant same-repo instances were confirmed
  by their identical `Daks-caption_VoiceAgent-video-editing\...\vite.js` command line before being
  stopped.
- **Sphere doesn't crash**: verified live (see Testing above).
- **Scroll-range widening actually feels less sensitive**: **not verified live.** `useScrollVar`
  schedules its update via `requestAnimationFrame` from inside its scroll listener. This Chrome
  automation tab has `document.visibilityState === "hidden"` (same finding as phase 05), and
  Chromium suspends `requestAnimationFrame` callbacks for hidden pages — so even though the
  underlying document scroll and the numeric range change are real and correct, the actual CSS
  custom property this range drives may never update in this tool regardless of the fix's
  correctness, making a live before/after comparison meaningless here. Confirmed correct by
  reading the formula instead: `progress = (start - top/innerHeight) / (start - end)` — doubling
  `start - end` halves `progress` for the same scroll delta, which is exactly the intended effect.
- **Sphere pause actually stops the render loop when scrolled away**: **not verified live**, same
  root cause — an `IntersectionObserver` was directly tested in phase 05 against a fully-onscreen
  element in this exact tab and timed out after 2 seconds with zero callbacks, so this phase's new
  observer cannot be expected to fire in this tool either. Verified structurally instead: the
  observer is attached to the same `parent` element the pre-existing `ResizeObserver` already
  successfully observes (proving the element reference is valid), `rootMargin` syntax matches the
  DOM spec, and `startLoop`/`stopLoop` are idempotent (guarded by `if (rafId) return` / `if
  (!rafId) return`) so a rapid flicker of intersection state can't double-schedule or double-cancel
  the loop.

## Unverified / Untestable
- Whether the scroll now *feels* right, and whether the hero→section-1 scroll is now smooth —
  both blocked by this automation tool's `visibilityState: hidden` suspending
  `requestAnimationFrame`/`IntersectionObserver`, exactly as `HANDOFF.md` already warned for motion
  work. **The owner needs to check both live**, on the corrected `http://localhost:5178/` URL, in
  an actual foreground browser tab — scrolling one wheel-tick to gauge sensitivity, and scrolling
  from the hero into the Tone section to gauge smoothness.
- Whether stopping the sphere loop mid-animation ever produces a visible discontinuity on resume
  (e.g. spring/rotation state was frozen, not decayed, during the pause) — the state variables are
  closures that simply stop advancing while paused and resume from their last value, which should
  look like a pause rather than a jump, but this reasoning hasn't been confirmed against an actual
  frame-by-frame observation.

## Deviations
None. Scope was exactly the two follow-up requests plus root-causing the "nothing changed" report.

## Git / Change Scope
Branch `Krish-landingpage`. `git diff --stat` for this phase: `VoiceSphere.tsx` (+22/-3),
`ClosingSection.tsx`, `LandingNavbar.tsx` (phase 05, unchanged this phase), `StepsSection.tsx`,
`caption-demo.tsx` (phase 05, unchanged this phase), `LandingPage.tsx` — only the four files listed
under Files Modified were touched in this phase. Pre-existing `DESIGN.md` deletion and untracked
`PROJECT_LOG.md` remain, unrelated, still flagged, still untouched.

## Next Steps
- Owner: confirm on `http://localhost:5178/` (not 5173) that scroll sensitivity and the
  hero→section-1 transition now feel right; report back with specifics (still too fast / too slow,
  still laggy at a particular point) if not, since this environment cannot observe either directly.
- Owner: close or stop whatever is serving `localhost:5173` if it's not needed, to prevent this
  mix-up recurring.
- If the sphere-pause fix is confirmed working but still not enough, the next lever is the
  per-frame `getBoundingClientRect()` call at VoiceSphere.tsx:781 (cheap in isolation, but one more
  synchronous layout read per frame alongside whatever the navbar/scrollbar's own scroll listeners
  are doing on the same tick) — not touched this phase since the full-stop fix should dominate.
