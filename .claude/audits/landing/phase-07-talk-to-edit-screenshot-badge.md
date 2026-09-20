# Landing: TalkToEditSection screenshot badge, and re-confirming the border fix (phase 07)

## Status
Border fix (phase 05) re-confirmed live on the corrected dev-server port (see phase 06 for the
port-mixup root cause). `TalkToEditSection`'s scripted chat console replaced with a real editor
screenshot the owner supplied, laid out as a badge overlapping the caption-demo frame's top-right
corner. Static layout verified live; the frame's own caption animation could not be watched
progressing live, for the same `IntersectionObserver`/hidden-tab reason recorded in phases 05–06.

## Objective
Two things from the owner in one message:
1. Re-verify the hero border-clip effect (phase 05) — the owner had been checking it on the wrong
   port (`voice-video-editor`, an unrelated project; see phase 06) and wanted it re-confirmed.
2. On the landing page's fifth section (`TalkToEditSection`, id `voice-editing` — confirmed by its
   content: a scripted "chatting with the agent" console next to a caption frame reading "har
   saaaalll meri birthday"), replace the console with an owner-supplied screenshot of the real
   editor app, leave the caption frame as-is, then shift both and place the screenshot in the
   frame's top-right corner.

## Implementation

### Border re-confirmation
No code change. Loaded `http://localhost:5173` (now the correct port for this repo — see phase 06)
in a Chrome automation tab, scrolled the hero, and got the same result as phase 05: the fixed
navbar is a fully opaque `#0a0a0c` bar with a hard bottom edge once scrolled. Unchanged by phase
06's scroll-range widening, since that only affects the `--hero-p` CSS variable driving the extra
slide/fade, not the navbar's own opacity or the browser's native scroll position.

### TalkToEditSection
- Saved the owner's supplied screenshot to `apps/web/public/editor-screenshot.jpg` (no existing
  `src/assets` convention in this codebase; `public/` already holds `favicon.svg`, so followed
  that pattern — referenced directly as `/editor-screenshot.jpg`, no bundler import needed).
- Removed the entire "Console" block (the typed-command/tool-call mock UI) and its
  console-only local variables (`step`, `typedChars`, `listening`, `visibleCalls`); kept every
  variable the caption frame still depends on (`current`, `stepIndex`, `timing`, `applied`,
  `appliedCount`, `presetId`, `styles`, `words`) so the frame's three-step style progression
  (pink `saaaal` → shaking `birthday` → Dhamaka preset) is completely unchanged.
- Replaced the old two-column `grid-cols-[1fr_minmax(0,360px)]` layout with a single relatively-
  positioned column sized to the frame (`max-w-[380px]`/`420px`): the frame is nudged down-left
  4%/6% ("slightly shift"), and the screenshot sits in an absolutely-positioned `img` anchored
  `-top-8 -right-6`, sized to ~55% of the frame's width, overlapping its top-right corner as a
  floating badge with the same border/shadow treatment as other cards on the page.
- The "replay of the flow" disclaimer line (a `HANDOFF.md`-mandated honesty note — this is a
  scripted replay, not a live agent call) was inside the removed console; kept it, moved to a
  centered caption below the whole composition rather than dropping it.

## Files Created
- `apps/web/public/editor-screenshot.jpg` — the owner's screenshot of the real editor UI
  (captions list, presets, timeline), used as-is, not fabricated.

## Files Modified
- `apps/web/src/components/landing/TalkToEditSection.tsx` — console removed, screenshot badge
  added, layout restructured as described above.

## Files Intentionally Untouched
Same boundaries as phases 05/06. `LANDING_COPY.md`'s honesty rules were checked against this
change: the screenshot is a real, unedited capture of the product's own editor, not an invented
claim or a third-party asset, so no "Do not say" conflict.

## Ownership
Inside `apps/web`, one of the six redesign section files (not one of the six *locked* originals).
No schema/API/cross-folder change.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` error as phases 05–06; no
  errors in `TalkToEditSection.tsx` — in particular, removing the console variables did not leave
  any unused-variable errors (double-checked deliberately, since that's exactly the kind of thing
  a partial removal breaks).
- `npx oxlint` on the full `apps/web/src` tree: zero new warnings; all warnings present are the
  same pre-existing ones in unrelated editor files already known from phases 05–06.

## Live Verification
- **Border**: verified live on the corrected port (`5173`) — see Implementation above.
- **Screenshot badge placement**: verified live. Loaded the section (jumped to it via
  `element.scrollIntoView`-equivalent `window.scrollTo`, since this tab's suspended
  `requestAnimationFrame` makes a manual multi-tick scroll slower to land precisely) and
  screenshotted: the caption frame and the screenshot badge render exactly as designed — frame
  shifted down-left, screenshot overlapping its top-right corner, both bordered/shadowed
  consistently with the rest of the page, no layout overflow or clipping at a 1512px viewport.
- **Frame's own caption animation** (the pink `saaaal`, the shake, the Dhamaka switch): **not**
  observed progressing in this tab. This reuses the pre-existing `useLoopClock` hook, whose
  animation only advances while its own `IntersectionObserver` reports the element visible — the
  same mechanism already shown in phases 05–06 to be suspended when `document.visibilityState ===
  "hidden"`, which this tab reports. The frame rendered its static initial state (just the
  `RANGMANCH` label, no caption text yet) throughout the check; this is consistent with, not
  contradictory to, the known limitation, and is not a regression this phase introduced —
  `useLoopClock` itself was not touched.

## Unverified / Untestable
- Whether the frame's caption progression (a pre-existing behavior, unmodified here) still plays
  correctly in a real tab — blocked by the same tool limitation as everything else this session
  involving `IntersectionObserver`/`requestAnimationFrame`. The owner should confirm live.
- Mobile/narrow-viewport sizing of the badge (currently `w-[58%]` / `sm:w-[52%]` of a
  `max-w-[380px]` container) was not checked at a phone width this session.
- Whether the specific overlap amount/shift reads as "slightly" to the owner, versus needing a
  larger or smaller offset — implemented as a reasonable first pass from a text description with
  no exact mockup; expect a follow-up tuning pass.

## Deviations
The original console block also displayed a live step counter, listening/working/done state, and
per-step tool-call log — all removed along with the console, per the owner's instruction to
replace "the chatting video" outright rather than keep any part of it. The honesty-mandated
"scripted replay" disclaimer was preserved (relocated, not deleted) since HANDOFF.md requires it
and the owner didn't ask for it to be dropped.

## Git / Change Scope
Branch `Krish-landingpage`. This phase's own diff: `TalkToEditSection.tsx` (+/-, net smaller — the
console's ~50 lines of JSX removed, ~25 lines of badge/frame layout added) and one new binary file
(`apps/web/public/editor-screenshot.jpg`). Pre-existing `DESIGN.md` deletion and untracked
`PROJECT_LOG.md` remain, still unrelated, still untouched. Phases 05/06's files are unchanged by
this phase except where explicitly noted (border re-check was read-only).

## Next Steps
- Owner: check the badge's exact position/size and the "shift" amount live, and say if it needs to
  move closer to true corner-flush, further out, or bigger/smaller.
- Owner: confirm the frame's caption animation (pink/shake/Dhamaka) still plays correctly, since
  this environment could not observe it.
- Owner: check phone-width layout for the badge, since only desktop width was checked this phase.
