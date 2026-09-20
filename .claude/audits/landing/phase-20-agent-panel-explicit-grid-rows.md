# Edit-by-Voice: Agent Panel / Preview Card Overlap — Audit

## Status
Fixed and measured. The agent replay panel and the RANGMANCH preview card no longer intersect at
any tested width (1440, 1280, 1024, 768, 375), confirmed by comparing their real
`getBoundingClientRect()` boxes in a running browser. Build and typecheck pass; console clean.
The visual *appearance* of the section was not eyeballed — the automation tab runs backgrounded,
where the reveal animations never fire — but the geometry is measured, not inferred.

## Objective
The agent replay panel (the "Working/Done 3/3" card with the `apply_preset` tool call) overlapped
the caption preview card (the DHAMAKA/RANGMANCH badge frame). A previous attempt (phase 18) did
not fix it. Required outcome: the panel's top-right corner at or near the top-right corner of the
whole two-column area, clearly above and to the right of the preview card, with a visible gap and
no intersection down to 1280px; stacked, not overlapping, at 375px.

## Diagnosis (requested before any change)
**The panel was absolutely positioned relative to the preview card's own container.** It was not a
flex/grid sibling.

The right-hand wrapper (`TalkToEditSection.tsx:146`) carried `lg:relative`, and the preview card
filled it at `lg:w-full` — so that wrapper's box *was* the card's box. The panel
(`TalkToEditSection.tsx:188`) was:

```
lg:absolute lg:right-0 lg:top-0 lg:w-[62%] lg:-translate-y-1/4 lg:translate-x-[15%]
```

Why tuning the offsets could never resolve it:
- `-translate-y-1/4` lifts the panel by a quarter of **its own** height. Measured height at lg is
  ~220px, so the lift was ~55px; the remaining ~165px sat directly on the card.
- `absolute` removes the panel from flow, so the card was pinned to the row's top and never
  yielded any space for the panel to occupy. There was nothing above the card to move into.
- Clearing the card by offset alone requires roughly `-translate-y-full` plus a gap, which lifts
  the panel into the section heading. Moving right instead overflows the `max-w-[1200px]`
  container, since the card already sits on its right edge.

This is the "absolute/relative offsets fighting the flow" failure mode. The instruction's first
branch (keep it absolute, reposition against the section/two-column wrapper) was evaluated and
rejected: the card is top-aligned in that wrapper too, so an absolutely positioned panel would
still land on it unless the card were given a hand-tuned top offset — a magic number that tracks
the panel's content height and would drift the moment the replay text wraps differently.

## Implementation
The right column is now an explicit two-row grid at `lg`, and nothing in it is absolutely
positioned.

- **Wrapper** (`:146`): `lg:relative lg:block` → `lg:grid lg:grid-cols-1 lg:grid-rows-[auto_auto]
  lg:gap-6`. The `lg:gap-6` (24px) is the guaranteed separation.
- **Agent panel** (`:188`): `lg:absolute lg:right-0 lg:top-0 lg:w-[62%] lg:-translate-y-1/4
  lg:translate-x-[15%]` → `lg:row-start-1 lg:w-[86%] lg:justify-self-end`.
- **Preview card** (`:156`): added `lg:row-start-2`, removed `lg:mt-4` (the grid gap owns that
  spacing now). Kept `lg:-ml-4`.

DOM order stays card-then-panel so the mobile and tablet layouts are untouched; `row-start`
re-orders them only at `lg`.

The diagonal composition phase 18 was reaching for is preserved, but built from widths instead of
offsets: `justify-self-end` puts the panel's right edge on the column's right edge — which is the
right edge of the whole two-column area — while `w-[86%]` insets its left edge from the card
below, which extends 16px further left via `-ml-4`. Panel up-and-right, card down-and-left.

## Files Created
- `.claude/audits/landing/phase-20-agent-panel-explicit-grid-rows.md` — this audit.

## Files Modified
- `apps/web/src/components/landing/TalkToEditSection.tsx` — three className changes (structural)
  plus the composition comment block, which described the old floating approach and was rewritten
  to describe the grid rows and record why the float failed.

Exactly three code lines changed in this fix. Confirmed by `git diff` filtered to code lines; the
only other changed line in the file is the `id="voice-editing"` → `id="edit-by-voice"` rename from
the previous phase (19), already audited there.

## Files Intentionally Untouched
- `STEPS`, `TIMINGS`, `TYPE_MS`/`THINK_MS`/`CALL_MS`/`HOLD_MS`, and the
  `listening`/`applied`/`stepIndex` derivation — the animation cycle and the Working → Done
  transition are byte-identical.
- All copy in both elements.
- `CaptionWords` and everything inside the preview frame — caption rendering is unchanged. The
  card's rendered width at lg is unchanged (307px), so the resolver scales type exactly as before.
- The editor screenshot column (`flex-[65]`, the `<img>`) — untouched; its measured box at 1280 is
  unchanged.
- `apps/web/src/components/VoiceSphere.tsx` — locked.
- `apps/web/src/components/landing/dark/*` — the `dark/` duplicates are not rendered by
  `LandingPage.tsx`; this section renders from `landing/TalkToEditSection.tsx`.

## Architecture
No new abstraction. Replaces one absolutely-positioned element with two explicit grid rows using
existing Tailwind utilities. `RevealItem` was verified to forward `className` onto its outermost
div (`dark/RevealItem.tsx:57-62`), which is the grid item, so `lg:row-start-2` applies to the real
grid child. `row-start` is not a transform, so it cannot be cancelled by `animate-reveal-lg`'s
`transform: translateY(0)` end state with `fill: both` — which is the trap the old code needed a
separate non-animated wrapper to dodge.

## Interfaces / Contracts
None. No props, schema, API, env var or dependency changed. No new dependency.

## Ownership
`apps/web` — **P3 (editor UI)**. No file outside that folder touched. No sign-off needed.

## Validation
Overlap is now prevented structurally rather than by tuned values: two auto-height rows of a grid
cannot intersect regardless of either element's content height. The failure mode the old code had
(panel height changes → overlap returns) is not reachable.

## Security
No security surface. Layout-only change.

## Testing
Commands run, from `apps/web`:
- `npm run build` (`tsc -b && vite build`) — **passed**, built in 464 ms. Only the pre-existing
  `EditorBootstrap` chunk-size warning.
- `npm run dev` + a real Chromium page. Both elements located by their own content (the 3:4 frame
  holding the preset badge; the rounded card containing the replay footer text) and measured with
  `getBoundingClientRect()` in same-origin iframes at exact CSS widths.

Measured boxes — `BOXES_INTERSECT` is a real rectangle-intersection test, not an eyeball:

| Width | Intersect | Arrangement | Gap | Panel top-right vs area top-right | H-overflow |
| --- | --- | --- | --- | --- | --- |
| 1440 | **false** | panel above card | 24px | dx 0, dy 0 | none |
| 1280 | **false** | panel above card | 24px | dx 0, dy 0 | none |
| 1024 | **false** | panel above card | 24px | dx 0, dy 0 | none |
| 768 | **false** | side by side (tablet layout) | 24px horizontal | n/a | none |
| 375 | **false** | card above panel (mobile stack) | 32px vertical | n/a | none |

At 1280 specifically: panel `left 944, top 5908, right 1208, bottom 6129` (264×220); preview card
`left 885, top 6153, right 1192, bottom 6561` (307×409); two-column area `left 72, top 5908,
right 1208, bottom 6561`. The panel's top-right corner is **exactly** the area's top-right corner
(dx 0, dy 0), its bottom clears the card's top by 24px, and its left edge (944) is 59px right of
the card's left edge (885) — above and to the right, as asked.

Console: no errors or exceptions, checked after a reload so load-time messages were captured.

## Live Verification
- **Verified in a real running browser:** every number in the table above — real Vite dev server,
  real Chromium, real computed layout geometry at real CSS viewport widths.
- **NOT verified:** the rendered look of the section. The automation tab is backgrounded, where
  Chrome throttles `requestAnimationFrame`, so `RevealItem` never reveals and screenshots show a
  blank body. Geometry is measured regardless, because layout does not depend on the reveal.

## Unverified / Untestable
1. **Visual appearance / whether the new composition reads well.** Reason: background-tab rAF
   throttling, above. The requirement asked for non-intersecting boxes, which is measured; whether
   the taller right column looks right is a judgement call needing one foreground look.
2. **The replay animation still cycling correctly.** Not re-observed running, for the same reason.
   The timing code is untouched (verified by diff), so there is no mechanism by which it changed.
3. **`prefers-reduced-motion: reduce`.** Not forced on in a live browser. The change adds no
   animation and removes two transforms; `RevealItem`'s non-animated branch renders the same
   `className`, so grid placement applies identically.

## Integration Status
Connected — renders in the real app.

## Dependencies / Blockers
None for this fix. The phase-19 blocker still stands separately: `apps/web/public/demo-reel.mp4`
is excluded by `.gitignore:12` (`*.mp4`).

## Deviations
**One, stated plainly.** The instruction said "fix it with an explicit position, not a layout
adjustment", and offered a grid/rows approach only under the "flex sibling" branch of the
diagnosis. The honest diagnosis is the *absolute* branch — but its prescribed remedy (keep it
absolute, push it higher and further right) cannot meet the stated acceptance criteria, for the
geometric reasons in **Diagnosis** above: out-of-flow positioning means the card never yields
space, so any clearing offset either collides with the heading or overflows the container, and
whatever value worked would be tied to the panel's current content height.

The grid-rows approach was taken instead because it is the only option under which the two boxes
*cannot* intersect at any width. "Explicit position" was read as "place it deterministically,
stop re-tuning flex ratios" — which is what `row-start-1` / `row-start-2` / `justify-self-end`
do. The requester should say if they specifically wanted the panel kept out of flow; that is
achievable, but only with a hand-tuned offset on the card that will need re-tuning whenever the
replay copy rewraps.

Side effect worth knowing: because the panel now occupies real vertical space, the right column is
653px tall at 1280 against the screenshot's 419px, so it extends ~234px below the screenshot. The
row is `items-start`, so the screenshot itself does not move. This is inherent to stacking the two
rather than floating one; the alternative is a wider right column, which would be the flex-ratio
tweaking the instruction ruled out.

## Git / Change Scope
Branch `Krish-landingpage`, working tree dirty. Nothing staged or committed by this work.

Pre-existing and left untouched: the `DESIGN.md` phantom deletion (never staged), the phase-18
staged changes to `TalkToEditSection.tsx`, unstaged `caption-demo.tsx`, and the untracked
`PROJECT_LOG.md` / `editor-screenshot.png` / earlier audits. No unrelated file was modified.

## Next Steps
1. **P3:** one foreground-browser look at 1280 to confirm the composition reads as intended, and
   that the replay still cycles Working → Done.
2. **P3:** decide whether the right column's extra height below the screenshot is acceptable, or
   whether the column should be widened (a deliberate ratio change, out of scope here).
3. **Lead:** resolve the phase-19 `.gitignore` mp4 blocker before this section's neighbours ship.
