# Phase 17 — Gate timed demo loops to viewport visibility

Rules for filling this out (do not delete this block when copying):
- Describe the ACTUAL CODE as it exists, not the intended design.
- Verify every important claim against source code, not memory or a prior summary.
- Never fabricate test results. Never say "tested" when something was only inspected.
- Never hide known limitations, deviations, or unverifiable pieces.
- Write for a developer who has never seen this conversation.

---

## Status
Implemented and browser-verified against the running dev server (`npm run dev`,
`apps/web`). Build (`tsc -b && vite build`) passes clean.

## Objective
The landing page's timed demo sequences (the loop playhead behind the caption
showcase progress bars, the tone-section phone preview, the signals score panel,
and the "Just talk" agent-replay panel) were driven by a `setInterval` that started
on component mount, not on viewport entry. A user scrolling down would arrive at a
section mid-sequence or with it already finished, never seeing the sequence play
from the start. Task: gate every timed sequence to visibility, restart it from the
beginning on every fresh entry, stop ticking while off-screen, and do all of this
by reusing the existing scroll-reveal visibility hook rather than building a second
observer system.

## Implementation
Searched the whole of `apps/web/src` for `setInterval`, `setTimeout`, and
`requestAnimationFrame` to enumerate every self-running sequence before touching
anything (see Testing/evidence below). Findings, scoped to the landing page:

- **`useLoopClock`** (`apps/web/src/components/landing/caption-demo.tsx`) was the
  *only* timed sequence in scope. It is the single shared hook behind all four
  affected sections — they don't each run their own timer:
  - `CaptionShowcaseSection.tsx` — drives the three preset-card frames' caption
    playback and the progress bar under each.
  - `ToneSection.tsx` — drives the phone-preview caption playback and the
    waveform for the currently selected moment (moment selection itself is a
    plain click handler, not timed — see Deviations).
  - `SignalsSection.tsx` — drives the score panel's playhead and the focused
    word.
  - `TalkToEditSection.tsx` — drives the entire "Just talk" scripted replay:
    typed characters, which tool calls are visible, the applied/step state, and
    the "1 / 3" counter.
- **`StepsSection.tsx`**'s rail-lighting effect (`--steps-p`, via `useScrollVar`)
  was investigated and found to be **not** a timed sequence — it recomputes
  directly from the rail element's real bounding-rect position on every `scroll`
  event via `requestAnimationFrame`, with no mount-time timer. Its value is
  always a pure function of current scroll position, so it cannot be "mid-flight"
  regardless of how the user navigated there; the per-step entrance fade (a
  separate, one-shot animation) already uses `useInView` correctly. No change
  made here — see Deviations for why this diverges from the task's suggested
  evidence.
- **`LandingNavbar.tsx`**, **`LandingScrollbar.tsx`**, and **`VoiceSphere.tsx`**
  have their own timers/rAF loops, but they are chrome/hero elements explicitly
  out of scope (navbar dropdown open/close timing, scrollbar thumb drag, and the
  hero's own load intro, which the task says stays on-page-load).

Rewrote `useLoopClock` to:
1. Obtain visibility from `useInView<HTMLDivElement>(0.25)` (the same hook that
   already drives every heading/card/panel scroll-reveal in `dark/RevealItem.tsx`
   and `SectionHeading`), instead of its own bespoke
   `new IntersectionObserver(..., { threshold: 0.1 })`. `useInView`'s existing
   hysteresis (show at the given ratio, hide only at ratio 0, via a pooled
   observer) gives the "trigger slightly early" and "don't reset on boundary
   jitter" behavior for free — no second observer system was introduced.
2. Reset `elapsed` to `0` synchronously at the start of the effect that starts
   the interval, keyed on `isInView` flipping true — so a fresh entry always
   replays from `startMs`, never resumes mid-loop from wherever it was paused.
3. Keep the interval's existence conditioned on `isInView && motionSafe`; the
   effect's cleanup (`clearInterval`) still fires on exit or unmount exactly as
   before, so nothing ticks off-screen.
4. Leave the `motionSafe` (reduced-motion) branch untouched: `timeMs` returns
   `endMs` (the settled, fully-progressed frame) whenever `motionSafe` is false,
   so reduced-motion users already got a static final state before this change
   and still do.

No change to any consuming section (`CaptionShowcaseSection.tsx`, `ToneSection.tsx`,
`SignalsSection.tsx`, `TalkToEditSection.tsx`) was necessary — they all consume
`useLoopClock`'s `{ ref, timeMs }` the same way as before; only the hook's
internal visibility/reset mechanics changed.

## Files Created
None.

## Files Modified
- `apps/web/src/components/landing/caption-demo.tsx` — `useLoopClock` rewritten
  to use `useInView` for visibility and to reset `elapsed` to `0` on every fresh
  entry. `useRef`/`useState`'s ad hoc `IntersectionObserver` block removed;
  `useInView`/`useAnimationLifecycle` were already imported in this file (used
  by `SectionHeading`), so no new import was added.

## Files Intentionally Untouched
- `CaptionShowcaseSection.tsx`, `ToneSection.tsx`, `SignalsSection.tsx`,
  `TalkToEditSection.tsx` — consume `useLoopClock` unchanged; the fix is fully
  contained in the hook.
- `StepsSection.tsx` — its rail-lit progress is scroll-position-driven, not
  timer-driven; see Deviations.
- `LandingNavbar.tsx`, `LandingScrollbar.tsx` — out of scope (chrome, not a
  scrolled-to content section).
- `VoiceSphere.tsx` — locked per task instructions; not opened.
- `dark/RevealItem.tsx`, `hooks/useInView.ts` — reused as-is, not modified.

## Architecture
Reused, not new: `useInView` (`apps/web/src/hooks/useInView.ts`) already existed
as the shared, pooled-observer visibility primitive backing the scroll-reveal
system (`RevealItem`, `SectionHeading`). `useLoopClock` now depends on it too, so
the landing page has exactly one IntersectionObserver-based visibility mechanism,
not two. `useLoopClock`'s public contract (`(startMs, endMs, holdMs, motionSafe) =>
{ ref, timeMs }`) is unchanged, so no caller needed edits.

## Interfaces / Contracts
No public interface changed. `useLoopClock`'s signature and return shape are
identical to before.

## Ownership
`apps/web` is P3 (editor UI) territory per root `CLAUDE.md`; this change is
entirely within `apps/web/src/components/landing/`, no schema or cross-folder
change, no sign-off required per the ownership table.

## Validation
No new user input or external data path introduced. `loopMs` is still computed
from the same `startMs`/`endMs`/`holdMs` values each section already passed in;
no new failure modes.

## Security
Not applicable — no secrets, auth, or external-service exposure touched.

## Testing
- `npm run build` (`tsc -b && vite build`) — passes clean, zero errors, from a
  repo-root `apps/web` workspace (`node_modules/livekit-client` was missing at
  the start of this session for an unrelated hook; resolved once via
  `npm install --workspace=apps/web`, confirmed no `package-lock.json` diff).
- Full-repo `grep` for `setInterval|setTimeout|requestAnimationFrame` across
  `apps/web/src`, used to enumerate every timed sequence before and after the
  change, confirming no other self-running sequence was missed.

## Live Verification
Verified against a real running `vite` dev server (`localhost:5173`) via
Chrome browser automation (`mcp__claude-in-chrome__*`), not just inspection:
- Added a temporary `console.log` inside `useLoopClock`'s effect (removed
  before finishing; final diff has no debug code — confirmed via `git diff`
  shown in this doc's evidence trail) to log every visibility-triggered restart
  with `loopMs` and `performance.now()`.
- Scrolled to `CaptionShowcaseSection`: one `enter` log fired on first arrival
  (`loopMs=2760`). Small in-section jitter (scroll up 2 ticks, down 2 ticks,
  still inside the section) produced **no** additional `enter` log — confirms
  the hysteresis (only a full exit resets it) is working, not re-triggering on
  boundary jitter.
- Scrolled fully back to the hero, waited, then scrolled back down to the same
  section: a **second** `enter` log fired (`loopMs=2760`, later `t`), and the
  screenshot at that moment showed the progress bar near-empty — confirms a
  full exit + re-entry restarts the sequence from the beginning rather than
  resuming.
- Repeated the same scroll-to-section check for `ToneSection`
  (`loopMs=2720`), `SignalsSection` (`loopMs=6800`, playhead visibly at an
  early word on entry vs. a late word later in the same visit), and
  `TalkToEditSection` (`loopMs=14795`, replay panel showing step 1/3 "DONE"
  shortly after entry, then 2/3 "WORKING" moments later) — each section
  produced its own fresh `enter` log and visibly started its sequence near the
  beginning on arrival.
- `mcp__claude-in-chrome__read_console_messages` (unfiltered and
  `onlyErrors: true`) showed **zero** console errors/warnings throughout —
  specifically no React "state update on an unmounted component" warning and
  no leaked-interval symptom (a runaway/duplicated tick log) — across repeated
  scroll-away/scroll-back cycles on every affected section.
- Confirmed the temporary debug `console.log` was removed and the file rebuilt
  clean before finishing (see Testing).

Not independently re-verified in this pass (unchanged by this phase, already
covered by phase-16's inventory): the scroll-reveal entrance animations
themselves (headings, cards, panels fading/rising into place) and reduced-motion
CSS fallbacks — this phase only touched the timed-loop start condition, not the
reveal system.

## Unverified / Untestable
- `prefers-reduced-motion: reduce` was not re-tested live in the browser this
  pass (no OS/emulated reduced-motion toggle exercised via automation); the
  code path (`motionSafe` gate short-circuiting the effect, `timeMs` returning
  `endMs`) is unchanged from before this phase and was already the established,
  working behavior per the file's prior implementation — reasoned from source,
  not re-observed live.
- Real device/mobile scroll behavior (touch-driven momentum scrolling, which
  can jitter differently than a synthetic wheel-scroll) was not tested; only
  desktop Chrome automation was used.

## Integration Status
Connected — the change is live in the running dev server and the production
build; no other teammate's work is required for it to take effect.

## Dependencies / Blockers
None.

## Deviations
The task's "evidence" for `StepsSection` ("scrolling to the section shows steps
01/02 already lit and 03/04 still dim") was investigated and found to describe
the section's **intended**, scroll-linked design, not a timer bug: `--steps-p`
is written by `useScrollVar` directly from the rail's real bounding-rect
position on every scroll/resize event, with no `setInterval`/`setTimeout`
anywhere in `StepsSection.tsx`. Because it's a pure function of current scroll
offset, arriving at the section by scrolling naturally always shows the lit
state that matches how far down the rail you've actually scrolled — there is no
"beginning" to restart, and no mount-time head start to correct. Gating this to
`isInView` would not change its behavior (it already reads correctly for
wherever the user is) and was not implemented. Flagged here rather than silently
skipped.

## Git / Change Scope
Branch `Krish-landingpage`, working tree otherwise dirty only with pre-existing,
unrelated local state present before this session started (`DESIGN.md` deleted,
`PROJECT_LOG.md` untracked — both untouched by this phase). `git diff` for this
phase is scoped to exactly one file,
`apps/web/src/components/landing/caption-demo.tsx`. No `package-lock.json`
diff from the one-time `npm install` used to unblock the pre-existing missing
`livekit-client` dependency.

## Next Steps
None required for this task. If a future pass wants `StepsSection`'s rail to
also read as "already caught up" when a user jumps to it via a nav anchor link
(skipping the scroll gesture entirely), that would be a deliberate product
decision about the rail's semantics, not a bug fix — flag to the human before
changing it.
