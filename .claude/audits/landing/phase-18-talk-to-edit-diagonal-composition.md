# Phase 18 — "Just talk" screenshot swap and diagonal composition

Rules for filling this out (do not delete this block when copying):
- Describe the ACTUAL CODE as it exists, not the intended design.
- Verify every important claim against source code, not memory or a prior summary.
- Never fabricate test results. Never say "tested" when something was only inspected.
- Never hide known limitations, deviations, or unverifiable pieces.
- Write for a developer who has never seen this conversation.

---

## Status
Implemented and browser-verified at 1280px/768px/375px viewport widths (see Live
Verification for how, given a tooling limitation — real OS window resize was not
available in this session). Build (`tsc -b && vite build`) passes clean.

## Objective
In `TalkToEditSection.tsx` ("You don't need to edit / Just talk"): swap the editor
screenshot for a new, correctly-sized asset; make the screenshot render large enough
to actually read; and fix the three-element composition so the screenshot and
RANGMANCH form a top-aligned pair with the chat panel floating diagonally off
RANGMANCH's top-right corner, instead of three roughly-equal columns in a row. Also
fix RANGMANCH's height, which was rendering at roughly double the screenshot's
height with a large empty gap above/below the caption text.

## Implementation
**Asset.** The task specified a new `apps/web/public/editor-screenshot.png`
(2559×1344) that did not exist anywhere in the repo. Rather than guess at or
fabricate an image, I stopped and asked the human for it (`AskUserQuestion`); they
pasted a screenshot and gave its source path
(`C:\Users\DELL\OneDrive\Pictures\Screenshots 1\Screenshot 2026-09-20 181648.png`).
Verified its actual pixel dimensions via `System.Drawing.Image` before copying —
2559×1344, an exact match — then copied it to
`apps/web/public/editor-screenshot.png`.

**Root cause of the height problem (diagnosed before changing anything).**
RANGMANCH's frame (`aspect-[3/4]`, i.e. width:height = 3:4) previously sat at
`lg:flex-[32]` beside the screenshot's `lg:flex-[40]` — about 80% of the
screenshot's width. At a 3:4 aspect, 80%-of-screenshot-width at RANGMANCH's ratio
computes to roughly double the screenshot's rendered height
(`(0.8 / 0.75) × (1600/825) ≈ 2.07×` under the old screenshot's 1.94:1 ratio, or
`(0.8/0.75) × 1.904 ≈ 2.03×` under the new one) — matching the task's own "roughly
double" observation almost exactly. RANGMANCH's `CaptionWords` content is
absolutely positioned at the preset's fixed `y: 70%` anchor (`packages/shared`,
untouched — see Ownership), so it doesn't grow to fill whatever box it's given;
oversizing the box just adds empty gradient above and below the text. The fix is
therefore **not** a new aspect-ratio value (3:4 is already a reasonable portrait
proportion) but a corrected width share: shrinking RANGMANCH's flex-basis relative
to the screenshot's so a 3:4 box at that width lands close to the screenshot's own
height. No hardcoded pixel height was introduced — height still follows from width
via the existing `aspect-[3/4]` class, exactly as the task required ("make the
container follow its content").

**Composition.** Restructured the row in `TalkToEditSection.tsx`:
- Outer row unchanged in spirit (`flex flex-col gap-8 lg:flex-row lg:items-start
  lg:gap-8`, screenshot as the first child), but the screenshot's `lg:flex-[40]`
  became `lg:flex-[65]` and its intrinsic-ratio comment/`src`/`alt` were updated.
- The second child (previously `lg:contents`, which dissolved RANGMANCH and the
  chat panel into three flat siblings of the outer row at `lg:`) now stays mounted
  at `lg:` as `lg:relative lg:block lg:flex-[25] lg:self-start` — i.e. it keeps its
  own box instead of disappearing, becoming the positioning context for the chat
  panel. RANGMANCH inside it changed from `lg:w-auto lg:flex-[32]` to `lg:w-full
  lg:max-w-none`, so it simply fills that wrapper's width.
- The chat panel's `RevealItem` is now wrapped in one extra, non-animated `<div>`
  (`w-full sm:w-1/2 lg:absolute lg:right-0 lg:top-0 lg:w-[62%]
  lg:-translate-y-1/4 lg:translate-x-[15%]`). This wrapper — not the RevealItem
  itself — carries the `lg:absolute`/`transform` positioning. That split was
  necessary, not cosmetic: `RevealItem`'s `reveal-lg` CSS keyframe
  (`index.css`) ends on `transform: translateY(0)` with `animation-fill-mode: both`,
  which persists after the animation completes and would silently override any
  static `translate-*` utility class applied to that same element. Putting the
  static offset on a separate ancestor div sidesteps the conflict entirely; the
  chat panel's own entrance animation, content, states, and internal timing are
  untouched (nothing inside `RevealItem`'s child `<div className="rounded-2xl
  ...">` was touched — only the two lines that open/close it changed indentation).
  At `<lg`, this wrapper is a normal-flow block (`w-full`, `sm:w-1/2`), so the
  diagonal float only exists at `lg:` (1024px+); below that it reverts to normal
  flow as required.
- Removed the previous `lg:-mt-10` "floats above" hack (a negative-margin
  approximation) — the div is now genuinely absolutely positioned and offset via
  transform, which is what it was approximating before.

**Responsive skeleton.** The pre-existing tablet/mobile grouping logic (outer row
stays `flex-col` until `lg:`; the RANGMANCH+chat wrapper goes `sm:flex-row` at
640px, chosen instead of `md`/768px specifically to clear a classic scrollbar-width
edge case per the original comment, preserved verbatim) was reused unchanged — it
already produced the tablet ("screenshot full width on top, RANGMANCH+chat side by
side below") and mobile (fully stacked) layouts the task asked for, so no new
breakpoint logic was needed there.

## Files Created
- `apps/web/public/editor-screenshot.png` — new asset, 2559×1344, copied from a
  file the human provided (see Implementation). Old
  `apps/web/public/editor-screenshot.jpg` was left in place, now unreferenced by
  any source file — not deleted, since the task didn't ask for that and removing
  it wasn't necessary for correctness. Flagged here rather than silently deleted
  or silently left unmentioned.
- `.claude/audits/landing/phase-18-talk-to-edit-diagonal-composition.md` — this
  file.

## Files Modified
- `apps/web/src/components/landing/TalkToEditSection.tsx` — screenshot
  `src`/`alt`/flex-share/comment; RANGMANCH's flex-share and its wrapper's
  `lg:contents` → `lg:relative lg:block`; chat panel wrapped in a new
  non-animated positioning `<div>` for the diagonal float. No other section file
  touched.

## Files Intentionally Untouched
- `packages/shared/src/presets.ts` (`rangmanch`'s `base: { x: 50, y: 70, ... }`)
  — the preset's own caption anchor position is schema/lead-owned; the height fix
  was deliberately done by correcting RANGMANCH's width share in the row, not by
  touching the preset.
- `VoiceSphere.tsx` — locked per task instructions; not opened.
- `LandingNavbar.tsx`, `LandingBackground.tsx` — out of scope, not touched.
- Every other landing section (`CaptionShowcaseSection.tsx`, `ToneSection.tsx`,
  `SignalsSection.tsx`, `HinglishSection.tsx`, `StepsSection.tsx`,
  `ClosingSection.tsx`, `dark/LandingFooter.tsx`) — untouched.
- The section heading/eyebrow/sub-copy inside `TalkToEditSection.tsx`
  (`SectionHeading` call) — untouched, per the hard constraint.
- The chat panel's own internal markup, state derivation (`typedChars`,
  `visibleCalls`, `applied`, `stepIndex`, etc.), and animation classes
  (`animate-fade-up`, `animate-pulse-ring`) — untouched; only its outer wrapper
  changed.

## Architecture
No new mechanism introduced. Reuses the existing `RevealItem`/scroll-reveal system
and the existing responsive-grouping pattern (a wrapper that's a flex-row at one
breakpoint and something else — previously `contents`, now `relative`/`block` — at
another) already established in this file for the tablet/desktop split.

## Interfaces / Contracts
None — purely presentational JSX/className changes in one component. No prop,
hook, or schema contract changed.

## Ownership
`apps/web` is P3 territory. This change is entirely within
`apps/web/src/components/landing/TalkToEditSection.tsx` and a new public asset;
no schema change, no cross-folder edit, no sign-off required per root
`CLAUDE.md`'s ownership table.

## Validation
Not applicable — no new user input, form, or data path. The only "input" is the
static image asset, which was dimension-verified before use (see Implementation).

## Security
Not applicable — no secrets, auth, or external-service exposure.

## Testing
- `npm run build` (`tsc -b && vite build`) from `apps/web` — passes clean, zero
  errors.
- `git status`/`git diff` reviewed: changes scoped to exactly
  `TalkToEditSection.tsx`, the new PNG, and this audit doc; the pre-existing
  unrelated dirty state (`DESIGN.md` deleted, `PROJECT_LOG.md` untracked) from
  before this session was left untouched.

## Live Verification
Verified against the real running `vite` dev server (`localhost:5173`) via Chrome
browser automation, not just inspection — with one tooling caveat:

- **Tooling limitation, disclosed up front:** `resize_window` did not actually
  change the tab's real viewport in this environment — `window.innerWidth`
  stayed pinned at 1707px regardless of the requested size (tried 1280, 960, and
  375; confirmed via `window.innerWidth`/`window.screen.width` reads). Rather
  than report untested results, I used a same-origin `<iframe>` sized to the
  exact target CSS pixel width/height as the test harness — the iframe's
  `contentWindow.innerWidth` genuinely reflects its element size, so Tailwind's
  real `sm:`/`lg:` media queries respond to it exactly as they would to a real
  window of that width. This is disclosed, not hidden, per the audit's
  "unverifiable pieces" rule.
- **1280px** (iframe `innerWidth` measured 1276px after chrome/scrollbar):
  `document.documentElement.scrollWidth > innerWidth` → `false` (no overflow).
  Screenshot: large, undistorted screenshot on the left; RANGMANCH top-aligned
  beside it, ending only ~10px lower than the screenshot (previously ~2× taller);
  chat panel floating clear of both, diagonally off RANGMANCH's top-right corner,
  not stacked on it, not in line with the pair.
- **768px** (iframe `innerWidth` 764px): no overflow. Screenshot full width on
  top; RANGMANCH and the chat panel side by side below it (normal flow, no
  diagonal offset at this width) — matches the "tablet" requirement.
  Screenshotted and visually confirmed.
- **375px** (iframe `innerWidth` 371px): no overflow. Single column: screenshot,
  then RANGMANCH, then the chat panel, in that order — matches the "mobile"
  requirement. Screenshotted and visually confirmed (had to scroll the iframe
  further to see RANGMANCH/chat since the stacked column is tall on a narrow
  viewport; confirmed the image itself loads correctly at this width too —
  `img.complete === true`, `img.naturalWidth === 2559`, no broken-image state).
- Confirmed the `alt` text's HTML-entity-encoded curly quotes
  (`&ldquo;`/`&rdquo;`, used because the attribute contains the literal phrase
  `"Ask the editor to do something"`) decode correctly in the live DOM — read
  `img.alt` from the running page and got the intended text with real curly
  quotes, not literal entity text.
- `read_console_messages` (unfiltered) across all three iframe reloads: only Vite
  HMR connect/debug lines, zero errors or warnings.

Not independently re-verified this pass (unchanged by this phase): the scroll-
reveal entrance timing/stagger of the other landing sections, and the reduced-
motion fallback path — this phase only touched `TalkToEditSection.tsx`'s layout.

## Unverified / Untestable
- A real OS-level window resize test at exactly 1280/768/375px was not possible
  in this session (see the tooling-limitation note above); the iframe-based
  substitute is a faithful test of the same media-query behavior but is a
  different code path for viewport reporting than a literal browser window
  resize, so a real-device/real-window spot-check would still be worth doing if
  the reviewer has an environment where `resize_window` works.
- Real touch-scroll/pinch-zoom behavior on an actual mobile device was not
  tested; only the iframe viewport-width emulation was used.
- The exact visual "closeness" of the diagonal offset (how many px the chat
  panel's bottom-left sits from RANGMANCH's corner) was tuned by eye against one
  set of screenshots at 1280px and not fine-tuned across every width between
  1024px and 1280px; if the reviewer wants the offset adjusted, the two numbers
  to change are the wrapper's `lg:-translate-y-1/4 lg:translate-x-[15%]` values
  in `TalkToEditSection.tsx`.

## Integration Status
Connected — live in the running dev server and the production build. No other
teammate's work is required for it to take effect.

## Dependencies / Blockers
None.

## Deviations
None from the task as given. One judgment call, disclosed: the height fix was
implemented by correcting RANGMANCH's width share in the row rather than by
changing its `aspect-[3/4]` ratio value, because the math showed the width share
was the actual root cause (see Implementation) and the task explicitly asked not
to introduce a hardcoded pixel height — changing the ratio instead would have been
a second plausible fix but a less precise one (harder to predict the resulting
height without also touching the width share).

## Git / Change Scope
Branch `Krish-landingpage`. `git status` before and after this phase shows the
same pre-existing, unrelated dirty state (`DESIGN.md` deleted, `PROJECT_LOG.md`
untracked) plus, from this and the prior phase in this session,
`caption-demo.tsx` (phase 17, already audited separately) and this phase's own
`TalkToEditSection.tsx` + `editor-screenshot.png` + this doc. No unrelated files
touched by this phase.

## Next Steps
None required. If the human wants the now-unreferenced
`apps/web/public/editor-screenshot.jpg` removed, that's a one-line follow-up
(`git rm`), left undone here since it wasn't asked for.

---

## Addendum — overlap fix (same session, immediate follow-up)

**Problem reported:** after the composition above shipped, the chat panel's
diagonal offset (`lg:-translate-y-1/4 lg:translate-x-[15%]` on its wrapper)
overlapped RANGMANCH's top-right corner, covering part of the frame including
its preset-name badge.

**Fix:** rather than touch the chat panel (explicitly out of scope — "the chat
panel stays where it is"), the screenshot + RANGMANCH pair was nudged left and
down together by an identical fixed offset, so the pair clears the
already-fixed chat panel instead of the chat panel moving to clear the pair.
Implementation, in `TalkToEditSection.tsx`:

- The screenshot's `RevealItem` is now wrapped in a new non-animated `<div>`
  carrying `lg:flex-[65] lg:self-start lg:-translate-x-[28px]
  lg:translate-y-[10px]` (the flex-item properties that used to live directly
  on the `RevealItem` moved to this new wrapper, alongside the shift).
- RANGMANCH's `RevealItem` is similarly wrapped in a new `<div>` carrying its
  previous width classes plus the *same* `lg:-translate-x-[28px]
  lg:translate-y-[10px]`.
- Both wrappers were needed for the same reason the chat panel's own wrapper
  was needed in the original phase: `RevealItem`'s `reveal-lg` keyframe ends on
  `transform: translateY(0)` with `fill: both`, which would silently cancel a
  static `translate-*` utility applied directly to the same element.
- Critically, the shift is applied to the screenshot's wrapper and to
  RANGMANCH's own inner wrapper — **not** to the outer RANGMANCH+chat
  `lg:relative` wrapper div. That outer div is the chat panel's positioning
  anchor (`lg:absolute lg:right-0 lg:top-0` on the chat's own wrapper is
  relative to it); leaving it unshifted means the chat panel's rendered page
  position is completely unchanged, satisfying "the chat panel stays where it
  is." RANGMANCH, an ordinary in-flow child of that unshifted anchor, visually
  moves via `transform` (which repaints without resizing the anchor's own box),
  so it can shift independently of its own parent.
- 28px / 10px were chosen from the row's actual measured content width
  (~1168px at 1280px viewport → 2.4% ≈ 28px) and the row's rendered height at
  that width (~2% ≈ 9-10px), matching the task's "roughly 2-3% width, ~2%
  height" spec at the one breakpoint (1280px) it asked to verify. Both wrappers
  use the identical `-28px`/`+10px` pair, which is what keeps the pair's own
  gap and top-alignment to each other exactly as they were — see Live
  Verification below.
- No `sm:`/unprefixed classes were touched, so tablet/mobile (normal flow,
  no diagonal positioning at those widths) are unaffected by construction.

### Live Verification (addendum)
Re-used the same same-origin-iframe technique as the parent phase (real
`resize_window` still doesn't affect `window.innerWidth` in this environment —
confirmed again before relying on the iframe substitute).

- **1280px** (iframe `innerWidth` 1276): `scrollWidth > innerWidth` → `false`,
  no overflow. Outlined the actual RANGMANCH frame element and the actual chat
  panel element via a temporary `outline` style (found by locating them
  through their own rendered text — the preset-name badge text and the "A
  replay of the flow…" copy — rather than trusting a guessed selector) and
  screenshotted: the two outlined boxes have a clear, visible gap between
  them, no overlap, and the preset badge is fully visible and uncovered.
- Measured `screenshot.getBoundingClientRect().top` vs
  `rangmanchFrame.getBoundingClientRect().top`: identical (0px difference) —
  the pair is still exactly top-aligned with each other after the shift.
- Confirmed the screenshot's left edge is well clear of the viewport edge
  after the leftward shift (`getBoundingClientRect().left` ≈ 42px into a
  1276px-wide viewport) — not clipped, no overflow.
- One measurement dead-end during this check, noted for transparency: an
  early attempt to compute the gap between the chat panel and RANGMANCH via
  `getBoundingClientRect()` on elements located by a `.bg-surface\/50`
  selector returned numbers implying overlap: this selector matched an
  unrelated element elsewhere on the page (another `bg-surface/50` div earlier
  in the DOM, in `CaptionShowcaseSection`), not the chat panel. Re-locating
  the chat panel by its own unique "A replay of the flow" text, and
  re-confirming visually via the outlined screenshot, resolved the
  discrepancy — the visible, screenshotted result (no overlap) is what's
  reported as verified; the earlier erroneous numbers are called out here
  rather than silently discarded.
- `read_console_messages`: no errors.

### Files Changed (addendum)
- `apps/web/src/components/landing/TalkToEditSection.tsx` only (two new
  non-animated wrapper `<div>`s, both `lg:`-scoped; no other file touched).

---

## Addendum 2 — gap widened per human-marked-up screenshot

The human sent a screenshot of the rendered section with hand-drawn arrows
(left-pointing arrows at the screenshot's and RANGMANCH's mid-height, down-
pointing arrows below each) indicating the same left/down nudge from Addendum 1
should go further, to open up more visible gap before the chat panel.

**Change:** both wrappers' shift increased from `lg:-translate-x-[28px]
lg:translate-y-[10px]` to `lg:-translate-x-[56px] lg:translate-y-[26px]` (the
identical pair on both the screenshot wrapper and RANGMANCH's wrapper, same as
before — see Addendum 1 for why both need it and why the outer `lg:relative`
anchor is deliberately left unshifted so the chat panel still doesn't move).

**Verified at 1280px** (iframe `innerWidth` 1276, same substitute technique as
above — real `resize_window` still not affecting the real viewport in this
environment): `scrollWidth > innerWidth` → `false`, no overflow; screenshot's
left edge measured at 14px from the viewport edge (was ~42px before this
widening) — closer to the edge but still positive/unclipped, and the overflow
check already confirms no scrollbar or clipping resulted. Top-alignment
between the screenshot and RANGMANCH re-measured at exactly 0px difference
(still holds after the larger offset). Screenshotted: RANGMANCH's badge is
fully clear, and the gap to the chat panel now reads as a deliberate, roomy
diagonal separation rather than a tight corner-touch. No console errors.

### Files Changed (addendum 2)
- `apps/web/src/components/landing/TalkToEditSection.tsx` only — two numeric
  values changed in two places (the transform offsets), plus their explanatory
  comments.

---

## Addendum 3 — margin-based nudge, closer gap between mockup and RANGMANCH

**Context check before changing anything:** this task's own "current state"
description (agent panel overlapping RANGMANCH, bleeding past its right edge)
did not match what was actually rendering — a fresh live-browser check (same
iframe technique, 1280px) at the start of this addendum showed Addendum 2's
fix already in effect: a clean, non-overlapping gap between the chat panel and
RANGMANCH. Noted here rather than silently assumed; the remaining ask (close
the internal screenshot↔RANGMANCH gap a little, prefer layout primitives over
transforms) was still real work and was done.

**Ownership check:** the task's constraint said not to edit files in
`landing/` directly and instead duplicate into `landing/dark/` — but a grep for
the section's own text ("EDIT BY VOICE" / "You don't need to edit") found
exactly one match, `TalkToEditSection.tsx`, with no `dark/` counterpart
anywhere in the repo, and confirmed `LandingPage.tsx` imports it from the
non-dark path. Flagged to the human via `AskUserQuestion` before touching
anything; they confirmed editing `landing/TalkToEditSection.tsx` directly.

**Change:** redesigned the nudge mechanism per the task's explicit
preference for "existing layout primitives... over new absolute offsets or
magic-number translates":

- The screenshot's transform-shift wrapper (Addendum 1/2's `lg:-translate-x-
  [56px] lg:translate-y-[26px]`) was removed entirely — this task doesn't ask
  to move the mockup, and the extra wrapper div existed only to host that now-
  gone transform, so it was deleted along with it (screenshot's `RevealItem`
  reverted to carrying `lg:flex-[65] lg:self-start` directly, its pre-Addendum-1
  shape).
- RANGMANCH's own transform-shift wrapper was similarly removed. In its place,
  `lg:-ml-4 lg:mt-4` (negative left margin, positive top margin — ordinary
  box-model properties) was added directly to RANGMANCH's own `RevealItem`
  className. This works without the wrapper-div workaround that the chat panel
  and earlier addenda needed for `transform`, because `margin` isn't touched by
  `reveal-lg`'s keyframe (only `transform`/`opacity` are), so there's no
  fill-mode conflict to route around.
- Net effect: RANGMANCH moves left/down relative to its own (unmoved) flex
  slot, closing part of the `gap-8` (32px) it previously sat a full 32px away
  from the screenshot at — the `-ml-4` (-16px) leaves roughly half that gap
  remaining, not a full close/touch. The wrapper div anchoring the chat panel
  (`lg:relative lg:block lg:flex-[25]`) is untouched, so the chat panel's own
  position is unaffected — RANGMANCH moving away from a fixed chat anchor is
  what gives the panel "room to breathe," per the task's own framing.
- The chat panel's own positioning (`lg:absolute lg:right-0 lg:top-0 lg:w-[62%]
  lg:-translate-y-1/4 lg:translate-x-[15%]`) was not touched — requirement 1
  ("no overlap") was already satisfied per the context check above.

### Live Verification (addendum 3)
Same same-origin-iframe substitute as prior addenda (this environment's
`resize_window` still doesn't affect the real viewport).

- **1280px** (iframe `innerWidth` 1276): no overflow
  (`scrollWidth === innerWidth`). Screenshotted and zoomed on the
  screenshot↔RANGMANCH↔chat corner: a visible, un-touching gap between the
  screenshot and RANGMANCH (tighter than before, not zero), and a clean,
  non-overlapping gap between RANGMANCH and the chat panel, preset badge fully
  visible.
- **768px** (iframe `innerWidth` 764): no overflow. Screenshot full width on
  top; RANGMANCH and the chat panel side by side below it, unaffected by the
  `lg:`-scoped margin change (confirmed visually — no unexpected gap/overlap
  introduced at this breakpoint).
- **375px** (iframe `innerWidth` 371): no overflow. Single column: screenshot,
  RANGMANCH, chat panel, in that order, no overlap.
- `read_console_messages` (`onlyErrors: true`): zero errors at each width.
- Animation cycle/timing, all copy, and caption rendering inside the preview
  card were not touched by this change (verified by inspecting the diff — only
  className/JSX-structure lines changed, no logic, no strings) — matches the
  "do not change" list.
- `prefers-reduced-motion` path: not touched by this change (the `motionSafe`
  branch in `RevealItem`/`useMotionSafe` is untouched code); not re-tested
  live this pass since nothing in the diff could affect it.

### Git (addendum 3, per explicit request)
`git status` was run and shown before staging anything. Only
`apps/web/src/components/landing/TalkToEditSection.tsx` was staged
(`git add`) for this addendum — `DESIGN.md`'s "deleted" status (the
repo's tracked-case-collision with `design.md` on a case-insensitive
Windows filesystem) was confirmed present and deliberately left unstaged, and
`caption-demo.tsx` (modified by an earlier, unrelated task this session) was
also left unstaged/untouched since it isn't part of this task's change. No
commit was made — only staged, since none was requested.

### Files Changed (addendum 3)
- `apps/web/src/components/landing/TalkToEditSection.tsx` only.
