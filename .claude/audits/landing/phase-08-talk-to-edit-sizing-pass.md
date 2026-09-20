# Landing: TalkToEditSection sizing pass (phase 08)

## Status
Small, targeted follow-up to phase 07. Implemented and verified live.

## Objective
The owner sent a screen recording to re-confirm which two elements were meant ("chatting with the
AI" console vs. the "har saaaalll meri birthday" frame) and explicitly authorized resizing both
freely for aesthetics. The recording was of the *pre-change* preview worktree (`localhost:5199`,
set up in the previous turn for comparison) — i.e. the original console+frame layout, not phase
07's already-applied badge — used purely as an unambiguous reference for which element is which.
The mapping matches phase 07 exactly (console → screenshot, frame kept as-is, screenshot badge in
the frame's top-right corner); this phase only changes the sizing.

## Implementation
`apps/web/src/components/landing/TalkToEditSection.tsx`: phase 07's composition was capped at
`max-w-[420px]` inside a 1200px section, which read as small/sparse once the console (previously
filling most of that width) was gone. Widened the container to
`max-w-[420px] sm:max-w-[480px] lg:max-w-[560px]` and scaled the screenshot badge with it
(`w-[60%] sm:w-[56%] lg:w-[54%]`, offsets adjusted to `-top-10 -right-8` / `lg:-right-16 lg:-top-12`
so it stays clear of the frame at the larger size), and upgraded its shadow to a slightly heavier
drop shadow so it reads as "floating" at the bigger scale.

## Files Modified
- `apps/web/src/components/landing/TalkToEditSection.tsx` — container and badge sizing only; no
  structural change from phase 07.

## Testing
`npx oxlint` on the file: clean.

## Live Verification
Verified live on `http://localhost:5173/`: the composition now visibly uses more of the section's
width, both elements are proportionally larger, no overflow or clipping at a 1568px viewport.
Narrower breakpoints (sm/mobile) were not re-checked this phase — same gap noted in phase 07's
Unverified section, still open.

## Deviations
None — same element mapping as phase 07, sizing only.

## Git / Change Scope
Branch `Krish-landingpage`. Only `TalkToEditSection.tsx` touched this phase.

## Next Steps
- Owner: confirm the new size reads as "aesthetic" as intended, or give a specific direction
  (bigger/smaller, tighter corner overlap) for another pass.
- Still open from phase 07: mobile/phone-width check of the badge.
