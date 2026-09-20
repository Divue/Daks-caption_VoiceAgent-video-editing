# Landing: full reveal inventory reviewed with owner, last gap closed (phase 16)

## Status
Implemented and live-verified with a full real-scroll pass, top to bottom and back.

## Objective
Before doing any further animation work, produce a complete inventory of every text element, box,
and component across the live landing sections — what already animates on down-scroll and what
doesn't — for the owner to review. The owner confirmed: everything in that list should animate, and
asked for a Claude-in-Chrome verification pass afterward.

## The inventory (presented to the owner)
Built by reading every live section's source directly (not from memory of prior phases), organized
per section as eyebrow / heading / body copy / boxes-cards-panels / list items, each marked live,
new, or excluded (continuous/interactive/locked mechanism, listed separately). Full detail was given
in chat; the one gap found: **HinglishSection's small caption line** ("Real words from our Hinglish
test reels · each in a different preset", between the word marquee and the three point cards) had no
reveal at all — a plain, always-visible `<p>`, the only text element on the page in that state.
Everything else the owner asked about (every section's eyebrow/heading/body copy, every card/panel/
box, every list item, every footer column) was already wired up from phases 10–15.

## Implementation
`HinglishSection.tsx`: wrapped that one `<p>` in a `RevealItem` (default `size="sm"`, matching the
same small-label treatment `ClosingSection`'s eyebrow already uses) — no other change. Everything
else in the inventory needed no code change; it was already correct.

## Files Modified
- `apps/web/src/components/landing/HinglishSection.tsx` — one `<p>` wrapped in `RevealItem`.

## Files Intentionally Untouched
Every other file in the inventory — already correct from phases 10–15, confirmed by re-reading
source rather than assumed.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` errors only.
- `npx oxlint src/components/landing/HinglishSection.tsx`: clean, no output.
- `npx vite build`: 2181 modules transformed (same count as every prior phase); fails only at the
  same pre-existing missing `livekit-client` dependency, unrelated and out of scope.

## Live Verification
Full real-scroll pass (the `computer` tool's wheel-scroll, per phase 13's established technique)
from the hero to the footer and partway back:
- **CaptionShowcaseSection**: upload row, all 3 frames, all 3 fact cards — revealed correctly.
- **ToneSection**: caught the headline's word-reveal *mid-animation* this pass ("Same reel." fully
  formed, "Three moods." still mid-mask-clip) — direct visual confirmation the phase-15 timing fix
  produces a real, watchable travel, not a pop; settled correctly one second later. Frame and
  Controls boxes both revealed.
- **SignalsSection**: heading and score panel both revealed correctly.
- **TalkToEditSection**: all three columns (screenshot, RANGMANCH, chat panel) revealed as whole
  units; the chat panel's own internal replay continued advancing independently (reached step 3/3
  by the time of the later up-scroll check), confirming its internal animation was never touched.
- **HinglishSection**: the newly-wired caption line confirmed via DOM inspection —
  `className: "mt-6 animate-reveal-sm"` — revealed correctly alongside the 3 point cards.
- **StepsSection**: heading and all 4 steps (with the pre-existing rail-lit dimming still intact)
  revealed correctly.
- **ClosingSection / Footer**: eyebrow, CTA block, brand block, all 4 nav links, and the copyright
  line all revealed correctly in the same final screenshot.
- **No-replay check**: scrolled back up through TalkToEditSection and into the marquee — both
  reappeared instantly with no replay flicker; the chat panel demo's own state (`3/3`) was
  preserved across the up-scroll, confirming it isn't tied to or reset by the reveal system.
- **Zero console errors** across the entire pass, checked twice.

## Unverified / Untestable
Same standing gaps as every prior phase in this series: `prefers-reduced-motion` under the actual OS
flag (no CDP media-emulation control in this session's tooling — verified by code inspection only,
same pattern already proven correct), and frame-rate/profiler-level scroll smoothness (no profiler
available here). Nothing new this phase.

## Deviations
None.

## Git / Change Scope
Branch `Krish-landingpage`. One file changed this phase (`HinglishSection.tsx`); no new files added
to the working tree's modified set. `DESIGN.md`'s pre-existing unstaged deletion remains untouched.
Nothing staged or committed.

## Next Steps
- Owner: nothing outstanding from the reviewed inventory — every listed element now animates,
  confirmed live. Say go/no-go on committing.
