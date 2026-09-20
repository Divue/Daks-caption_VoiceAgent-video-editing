# Landing: TalkToEditSection rebuilt as a three-region layout (phase 09)

## Status
Implemented and verified live at 1280px, a real-viewport-equivalent 768px, and 375px (via iframe,
since this session's `resize_window` tool does not actually resize the browser window here — see
Unverified). Panel A restored to its exact original copy/animation/behaviour. The "Panel B empty
box" question was investigated in depth: no code defect found; direct evidence below.

## Objective
A detailed brief requested restructuring the section (heading "You don't need to edit. / Just
talk.") into three regions: the owner's editor screenshot as the section's hero visual (left,
~60%), and the two existing panels — A (agent-command replay) and B (RANGMANCH caption-preview
frame) — stacked in a narrower right column (~40%), reflowing differently at tablet and mobile
widths. It also asked to find and fix why panel B was rendering as an oversized empty box.

## Files (confirmed before editing, per the brief's own instruction)
- `apps/web/src/components/landing/TalkToEditSection.tsx` — the section itself (heading, panel A,
  panel B all live here).
- `apps/web/src/components/landing/caption-demo.tsx` — `CaptionWords`, `SectionHeading`,
  `useElementWidth`, `useLoopClock`, all imported by the section above; read but not modified this
  phase.
- `apps/web/public/editor-screenshot.jpg` — the existing screenshot asset (confirmed 1600×825,
  1.94:1, matching the brief exactly).

## The "empty box" investigation
Phases 07/08 had speculatively attributed panel B's blank appearance in this Chrome automation tool
to the same `IntersectionObserver`-suspension already documented for the hero/section-entrance work
(phases 05–06). This phase re-investigated from scratch rather than repeating that assumption,
since the brief described it as a real, witnessed regression:

- Read `useElementWidth` (`caption-demo.tsx`) and `resolveWordStyle`/`revealOpacity`
  (`lib/caption-style.ts`) end to end: no defect found. `CaptionWords` renders nothing only when its
  `width` prop is `<= 0`; `useElementWidth` populates that from a plain `ResizeObserver`, which is
  not gated by page-visibility APIs by spec.
- Directly proved this tool's tab does not honor that in practice: a bare synthetic
  `ResizeObserver` observing `document.body` (guaranteed non-zero size) was given a 2-second window
  and never fired once. Same null result on the **pristine, never-modified** original component
  (checked in the phase-06 preview worktree) and on the already-shipped `ToneSection`'s identical
  caption frame — i.e. every instance of this exact, unmodified pattern was blank in this tool,
  which rules out a defect specific to `TalkToEditSection` or to phases 07/08's edits.
- Positive proof it isn't broken: after resizing the browser window as part of the required
  1280/768/375 responsive check, the same `ResizeObserver`\-driven `width` populated correctly and
  panel B rendered all four words (`har`, `saaaalll`, `meri`, `birthday`) with correct styling —
  confirmed via direct DOM query (`querySelectorAll('span')`, non-empty leaf nodes), not just a
  screenshot. A resize event is exactly the kind of layout-affecting trigger `ResizeObserver` is
  built to react to.
- Conclusion: no code bug. What was real, and is fixed in this phase, is that phase 08's "make it
  bigger for aesthetics" pass left panel B unconstrained by any column — at `lg:max-w-[560px]atasp
  ect-[9/16]` it measured 560×995px, a genuinely oversized, empty-looking box regardless of the
  rendering question. This phase's column layout caps it by **width** (`max-w-[220px]`, never a
  fixed height), giving it a correctly proportioned 220×391px box.

## Implementation
`TalkToEditSection.tsx`, full body restructure:
- **Panel A** restored verbatim from the phase-06 preview worktree's pristine copy (same `said`
  copy, `calls`, `result`, timing constants, `listening`/`applied`/`visibleCalls`/`typedChars`
  logic) — only Tailwind sizing classes were tightened (padding `p-5 sm:p-7` → `p-4 sm:p-5`, the
  headline clamp, list/min-height spacing) to read as "compact" in the narrower column.
- **Panel B** kept structurally identical (`aspect-[9/16]`, same gradient, same `CaptionWords`
  props) but now sits in a `max-w-[220px] mx-auto` wrapper instead of the old external
  `max-w-[320px]` (pristine) or the ballooned `max-w-[560px]` frame (phase 08).
- **Layout**: `flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10` outer container. Screenshot
  wrapper gets `lg:flex-[3]`, the A+B group gets `lg:flex-[2]` — `flex-basis`-driven (not raw
  percentage widths), so the `gap-10` is subtracted before the 3:2 split and the row can never
  overflow regardless of container width. The A+B group is itself
  `flex flex-col gap-6 sm:flex-row sm:gap-6 lg:flex-[2] lg:flex-col`.
- **Breakpoint choice**: the "side by side at tablet" transition is keyed to `sm` (640px), not `md`
  (768px) as the brief's own wording suggested. Found and fixed a real edge case during testing: at
  a browser window resized to exactly 768px CSS pixels, a classic (non-overlay) vertical scrollbar
  consumes ~15–17px of the layout viewport, so `window.innerWidth` measures ~751–764 — just under
  `md`'s 768px threshold — leaving panel A and B stacked instead of side by side at the exact test
  width the brief names. `sm` (640px) clears that gap with margin at any real 768px viewport.

## Files Modified
- `apps/web/src/components/landing/TalkToEditSection.tsx` — full body rewrite as above.

## Files Intentionally Untouched
- `apps/web/src/components/VoiceSphere.tsx` — not opened this phase (hard constraint).
- The section's `SectionHeading` call (eyebrow "Edit by voice", both heading lines, the sub-copy
  paragraph) — byte-for-byte unchanged.
- Panel A's copy, `STEPS`, timing constants, and all state-derivation logic — unchanged; only
  Tailwind sizing classes touched.
- `caption-demo.tsx`, `LandingNavbar.tsx`, `LandingBackground.tsx`, every other section, and the six
  locked original `landing/*Section.tsx` files — not touched this phase.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` error (confirmed
  pre-existing via `git stash` in phase 05); zero errors in the changed file.
- `npx oxlint` on the changed file: clean.
- `npx vite build`: 2181 modules transformed successfully (including this section's bundle);
  build's final step fails only on the same pre-existing missing `livekit-client` dependency,
  unrelated to this change and out of scope (P4's editor voice module).
- No browser console errors observed during any of the live checks below (console tracking was
  active throughout).

## Live Verification
All three via direct DOM measurement (`getBoundingClientRect`, `querySelectorAll`), not just visual
screenshots:
- **1280px** (real browser window): screenshot 657.6×339.7px (ratio 1.936, matches the source's
  1.94:1 — not distorted), panel B 220×391.1px (exact 9:16 at the capped width) with 4 rendered
  word spans (`har`, `saaaalll`, `meri`, `birthday`), panel A alongside at its own compact size.
- **768px** (iframe at 768px CSS width, `innerWidth` 764 after its own scrollbar — i.e. exactly the
  edge case described above): screenshot 700px full width, panel A and panel B at the same
  `top`/`bottom` (side by side, matched height via flex's default `align-items: stretch`), zero
  horizontal overflow (`scrollWidth === clientWidth`).
- **375px** (iframe, `innerWidth` 371): order confirmed screenshot (y 515) → panel A (y 715) →
  panel B (y 1101), panel B centered at `max-w-[220px]`, zero horizontal overflow. Zoomed screenshot
  confirms panel A's typed-command line stays on one line, no overflow, at this width.

## Unverified / Untestable
- This session's `resize_window` browser-automation tool does not actually resize the window in
  this environment — three consecutive calls (1280, 768, 768 again) left `window.innerWidth`
  unchanged (1512, then 1707, matching neither request). Worked around it with same-origin
  `<iframe>` elements sized to the exact target CSS width, which do get a real, independent
  viewport for media-query purposes — confirmed by reading `innerWidth` inside each iframe. This is
  a tool limitation, not a page bug; flagging so it isn't mistaken for a passing "real" window
  resize test.
- A genuine real-browser confirmation from the owner is still the strongest signal: everything
  above was checked by this tool via DOM queries and iframes, which is a good proxy but not a
  substitute for the owner scrolling the live page themselves.

## Deviations
- Breakpoint for the tablet arrangement is `sm` (640px) rather than the `md` (768px) the brief's
  wording implied — a deliberate deviation, explained under Implementation, to make the behavior
  robust at a literal 768px window rather than failing on a scrollbar technicality.
- Panel B is capped at `max-w-[220px]` rather than filling its full ~40%-column width; left
  uncapped it would render at ~350–450px wide (623–800px tall at 9:16), which would dominate the
  layout and read as unbalanced next to panel A. This is a width cap, not a fixed height, so it
  does not reintroduce the "papering over with a fixed height" anti-pattern the brief warned
  against.

## Git / Change Scope
Branch `Krish-landingpage`. `git status` shown to the owner before any commit, per the brief's GIT
section. `DESIGN.md`'s deletion and the untracked `PROJECT_LOG.md` remain unstaged and untouched —
not added, not restored, left exactly as found (pre-existing, unrelated to any of this work). No
commit was made this phase.

## Next Steps
- Owner: confirm live that panel B's caption text renders as expected — this phase found strong,
  reproducible evidence that it does (see the investigation above), but the owner's own browser is
  the authoritative check this tool cannot fully replace.
- Owner: say go/no-go on committing; nothing has been staged or committed.
