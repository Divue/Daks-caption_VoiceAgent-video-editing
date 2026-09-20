# Landing: every element reveals, one shared observer per threshold (phase 14)

## Status
Implemented and live-verified with real wheel-scroll gestures (the technique phase 13 established
as the one that actually drives this tool's `IntersectionObserver`). Every category the brief
named is now wired up. No new dependency, no second reveal system — everything routes through the
existing `useInView` hook, now refactored to share one native observer per threshold instead of one
per element.

## Objective
A precise, multi-part brief: extend the existing down-scroll-only reveal (phases 10/12/13) to
*every* visible piece of the page — headings, sub-copy, eyebrows, cards, boxes, panels, images, the
editor screenshot, RANGMANCH, the chat panel, list items, footer columns, CTA blocks — while
enforcing one hard rule throughout: animate at exactly one level per group, never both a wrapper and
its children (stagger children 60–90ms, capped after ~6 items). Match the existing motion language
exactly (same easing/duration), only varying distance by element size. Transform/opacity only, no
filter. One shared `IntersectionObserver` instance where practical. Never animate the navbar,
`LandingBackground`, anything inside `VoiceSphere.tsx`, or RANGMANCH/chat-panel internals (reveal
those as whole units). Verify `prefers-reduced-motion` explicitly. Show `git status` before any
commit; never stage `DESIGN.md`'s deletion.

## Find it first
Re-audited every live section (same seven `LandingPage.tsx` imports plus `dark/LandingFooter.tsx`)
against the brief's categories, building on phase 13's inventory:
- **Already individually revealed, no double-animate risk** (unchanged structurally):
  `CaptionShowcaseSection`'s upload row/3 frames/3 facts, `HinglishSection`'s 3 point cards,
  `dark/LandingFooter.tsx`'s single block. These needed only the new `size="lg"` treatment (see
  below) — no restructuring.
- **Box-level only, needed splitting into individually-staggered pieces**: `StepsSection.tsx` (one
  wrapper reveal for all 4 steps — the brief explicitly names "list items", and a `<ol>` of 4 steps
  reading as one fade instead of a cascade doesn't satisfy that), `dark/LandingFooter.tsx` (one
  wrapper for brand + all 4 nav links + copyright — the brief explicitly names "footer columns",
  plural).
- **Not wired up at all**: `ClosingSection`'s eyebrow tag ("Your next reel") — the CTA
  paragraph+button already had a reveal (phase 13) but the eyebrow above the headline didn't.
- **Deliberately left alone** (continuous, already-scroll-reactive mechanisms, not this system):
  `ClosingSection`'s headline (`--close-p` slide), `StepsSection`'s rail fill (`--steps-p`) and its
  per-step `opacity: lit` progress-dimming, the Hinglish marquee rows. None of these are a one-shot
  entrance; adding `useInView`-driven reveals on top would be motion-language drift, not a fix.
- **Explicitly must stay whole units**: `TalkToEditSection`'s RANGMANCH frame and chat panel — their
  internal contents (typed command, tool-call lines, caption words) already animate on their own
  timeline; per the brief, not touched further.
- `LandingNavbar.tsx`, `LandingBackground.tsx`, `VoiceSphere.tsx` — confirmed untouched, per hard
  constraints (`VoiceSphere.tsx` not opened).

## The line drawn on granularity
The brief invited stating where granularity stops if per-node observers would hurt performance;
given the shared-observer refactor below made the *engine* cheap regardless of node count, the line
was drawn on **readability of intent**, not raw performance: a "card" (fact card, caption frame,
Hinglish point, footer brand block, a Tone/Steps/Signals panel) is one atomic reveal unit — its own
icon/label/value are not separately staggered, since they only make sense together and revealing
them piecemeal would read as broken, not polished. A "list item" (a `<ol>`/`<nav>` entry that's
legible and meaningful on its own — a step, a footer link) gets its own staggered reveal. Interactive
control groups that are visually one panel (`ToneSection`'s moment-tab row, tone-layer toggle,
preset picker; all read as "Controls", already one `RevealItem`) were **not** further subdivided —
animating individual buttons inside an already-revealing panel on every scroll felt gimmicky for
controls the user is about to click, not "content" in the sense list items/cards are.

## Implementation
**`hooks/useInView.ts` — shared observer pool.** Previously every `useInView()` call created its own
`new IntersectionObserver(...)`. Now one native observer is shared per distinct `showThreshold`
value (`observerPool: Map<threshold, {observer, callbacks: Map<Element, callback>}>`); each call
site registers its element+callback into the pool's `Map` on mount (`observer.observe(element)`)
and removes it on unmount (`observer.unobserve(element)`, `callbacks.delete(element)`) — the shared
observer itself is never disconnected while other elements still use it. The hook's return signature
(`{ref, isInView, shouldAnimate}`) and its hysteresis/direction logic are byte-for-byte unchanged,
so this was a pure internal refactor — no call site needed to change for this part.

**`index.css` — one new keyframe, not a new motion language.** Added `--animate-fade-up-lg` /
`@keyframes fade-up-lg`: identical easing (`cubic-bezier(0.16, 1, 0.3, 1)`) and duration (`0.3s`) to
the existing `--animate-fade-up`, only the distance changes (`translateY(16px)` vs. `8px`) — "small
elements move a shorter distance than large ones" implemented as a magnitude parameter on the same
keyframe shape, not an invented new animation. The hero's own `rise`/`text-materialize`/etc.
keyframes (which do use `filter: blur()`) were not touched or reused — the brief's "transform and
opacity only, no filter" rules those out for anything new, and the hero itself is out of scope
(hard constraint: unchanged, page-load-triggered, not a scroll reveal).

**`dark/RevealItem.tsx` — a `size` prop, and one exported helper for non-`<div>` cases.** Added
`size?: 'sm' | 'lg'` (default `'sm'`, i.e. today's behavior unchanged for any caller that doesn't
pass it) picking `animate-fade-up` vs. `animate-fade-up-lg`. Also exported the 3-line class-decision
as a pure function, `revealClass(isInView, shouldAnimate, size)`, so components that can't be
wrapped in `RevealItem`'s own `<div>` — a `<li>` that must stay a direct `<ol>` child, a `<p>`/`<a>`
where a wrapper div isn't needed — can call `useInView` themselves and apply the identical class
logic directly to the real tag, without a second implementation of "what class for what state".

**Promoted every existing box/card/panel/image reveal to `size="lg"`** (cards, boxes, panels,
images — the brief's own vocabulary): `CaptionShowcaseSection`'s upload row + 3 frames + 3 facts,
`ToneSection`'s Frame + Controls, `SignalsSection`'s score panel, `TalkToEditSection`'s 3 columns
(editor screenshot, RANGMANCH, chat panel), `HinglishSection`'s 3 point cards, `ClosingSection`'s
CTA block. Existing per-item stagger delays (already 90ms, already under the 60–90ms/6-item cap
given these groups all have ≤3 items) were left as-is; frames/facts got `Math.min(index, 5) * 90`
defensively capped even though no current group reaches 6.

**`StepsSection.tsx` — per-step reveal, rail untouched.** Removed the single box-level `RevealItem`
that wrapped rail+list together (phase 13); extracted a `StepItem` component (each step needs its
own `useInView` call, which can't happen inside `.map()` without violating the Rules of Hooks — a
real component instance per item is the correct pattern, matching how `CaptionFrame`/`FactCard`
already work in this codebase). Each `StepItem` calls `useInView` directly and applies `revealClass`
to an **inner** content `<div>`, not the `<li>` itself — the `<li>` keeps only its pre-existing
`style={{opacity: lit}}` (the continuous rail-progress dimming). Putting both opacities on the same
element would have been a real conflict, not just double-animating: an inline `style.opacity` always
outranks a class's `opacity` in the cascade, so the reveal's `opacity-0` would never have taken
effect. Nesting them lets both apply and multiply visually as intended, confirmed live (see Live
Verification). Stagger: `Math.min(index, 5) * 80`ms.

**`dark/LandingFooter.tsx` — three reveal groups, not one.** The single outer `RevealItem` was
removed; replaced with: the brand block (own `RevealItem`, one unit — logo+wordmark isn't
meaningfully splittable), each of the 4 `NAV_LINKS` (each its own `RevealItem` wrapping the `<a>`,
`Math.min(index, 5) * 70`ms stagger — a `<div>` wrapping an `<a>` inside a `<nav>` is valid HTML,
unlike the `<li>` case, so no custom component was needed here), and the copyright line (own
`RevealItem`, delayed to land after the links). The outer row `<div>` is now plain, un-revealed —
its children carry the animation, satisfying "animate at one level only".

**`ClosingSection.tsx` — eyebrow wired up, CTA block promoted.** The "Your next reel" `<p>` is now
its own `RevealItem` (default `size="sm"` — a small label). The CTA block (paragraph+button)
promoted to `size="lg"` with a 90ms delay after the eyebrow. The headline's own `--close-p` slide
remains untouched — a different element, a different (already continuously scroll-reactive)
mechanism, no interaction with the new reveals.

## Files Modified
- `apps/web/src/hooks/useInView.ts` — shared observer pool.
- `apps/web/src/index.css` — `--animate-fade-up-lg` / `@keyframes fade-up-lg`.
- `apps/web/src/components/landing/dark/RevealItem.tsx` — `size` prop, exported `revealClass`.
- `apps/web/src/components/landing/StepsSection.tsx` — per-step `StepItem` reveal.
- `apps/web/src/components/landing/dark/LandingFooter.tsx` — three reveal groups.
- `apps/web/src/components/landing/ClosingSection.tsx` — eyebrow reveal, CTA promoted to `lg`.
- `apps/web/src/components/landing/CaptionShowcaseSection.tsx`, `HinglishSection.tsx`,
  `SignalsSection.tsx`, `TalkToEditSection.tsx`, `ToneSection.tsx` — existing `RevealItem`s promoted
  to `size="lg"` (frames/facts also got the defensive stagger cap).
- `apps/web/src/components/landing/caption-demo.tsx` — untouched this phase (its phase-13
  `fade-up`-based `reveal()` for the eyebrow/body copy already matches the motion language this
  phase extended everywhere else; confirmed via `git diff`, no lines changed).

## Files Intentionally Untouched
- `LandingNavbar.tsx` — must stay fixed/static, per hard constraint.
- `LandingBackground.tsx` — grid/dots/vignette must stay static, per hard constraint.
- `VoiceSphere.tsx` — locked, not opened.
- The hero (`LandingPage.tsx`) — unchanged, page-load animation, out of scope.
- `AnimatedSection.tsx` and the six dead `dark/*Section.tsx` files — re-confirmed still not
  imported by `LandingPage.tsx`; not touched.
- Copy, layout, spacing, DOM structure beyond the minimal wrapper/ref additions the reveal mechanism
  itself requires (same technique already used throughout phases 10–13).
- `DESIGN.md`'s pre-existing unstaged deletion — not staged, not restored, exactly as found.

## Testing
- `npx tsc -b` (apps/web): same pre-existing, unrelated `livekit-client` errors only; zero errors in
  any file this phase touched.
- `npx oxlint` on all twelve changed files: one warning, `dark/RevealItem.tsx`'s
  `only-export-components` fast-refresh notice (it now exports both a component and the
  `revealClass` helper) — the same category of pre-existing warning `caption-demo.tsx` already has
  three of, not a new class of issue, not an error.
- `npx vite build`: 2181 modules transformed (same count as every prior phase); fails only at the
  same pre-existing missing `livekit-client` dependency (P4's voice module), unrelated and out of
  scope.

## Live Verification
Via the `computer` tool's real wheel-scroll (the technique phase 13 established as the one that
actually drives this tool's `IntersectionObserver` — `scrollIntoView`/`scrollTo` do not), scrolled
the full page top to bottom and back:
- **CaptionShowcaseSection**: upload row, all 3 frames, all 3 facts revealed correctly with the new
  `lg` distance — visually a touch more travel than before, still fast/unobtrusive.
- **StepsSection**: all 4 steps revealed in a cascade. Directly inspected via
  `getComputedStyle`/className: each step's `<li>` carries only its continuous `opacity: lit` value
  (1 for reached steps, 0.3 for not-yet-reached — unaffected by the reveal, confirming no cascade
  conflict), while each step's **inner** div independently carries `animate-fade-up-lg` at opacity
  1 (its entrance, already played and settled) — exactly the intended two-opacities-multiply
  design, confirmed working, not just theorized.
- **Footer**: brand block, all 4 nav links (individually, confirmed via DOM inspection — each `<a>`'s
  parent carries its own `animate-fade-up`), and the copyright line all revealed. "Footer columns"
  from the brief is satisfied as brand + link-list + copyright, not one flat block.
- **ClosingSection**: eyebrow "Your next reel" revealed as its own small label, ahead of the
  headline's own continuous slide and the CTA block's now-`lg` reveal.
- Scrolled back **up** past `StepsSection`: all 4 inner step divs reset to `opacity-0` on exit
  (confirmed via direct DOM query while scrolled past), then re-entering by scrolling back down
  showed no double-animate flicker.
- **Zero console errors** throughout the entire pass (`read_console_messages`, checked twice).
- One CSS-animation instance was observed frozen mid-fade at a fixed, non-progressing opacity value
  (the `ClosingSection` eyebrow, `0.23363`, unchanged across a 2-second wait) — this is the *exact*
  same tab-backgrounding artifact phase 13 already documented for the CTA block in this same
  section (frozen at `0.497569` there), not a regression from this phase's changes; a real user's
  browser completes the 0.3s animation normally.

## Unverified / Untestable
- **`prefers-reduced-motion` was verified by code inspection, not observed live.** Every new reveal
  site follows the identical pattern already proven correct for `RevealItem` in phase 13: when
  `motionSafe` is false, the element's `ref` is never attached (so the shared observer never
  observes it, so its state can never change) and no reveal class is applied — full opacity, no
  transform, immediately, with no possibility of a later reset. This session's tooling has no way to
  toggle the OS-level reduced-motion media feature (no CDP emulation control exposed here), so this
  is inspection, not a live pass under the actual flag — the same gap phase 13 disclosed for the
  same reason.
- The shared-observer-pool's actual performance benefit (fewer native `IntersectionObserver`
  instances) was not measured with a profiler; it's a structural change matching the brief's
  explicit ask, not a benchmarked improvement.
- A genuine slow-scroll, real-device pass by the owner — watching for flicker at section boundaries
  and confirming the motion reads as intentional, not busy, now that meaningfully more elements
  animate per scroll — is the strongest remaining check this session's tooling can't substitute for.

## Deviations
None from the brief's explicit rules. Two implementation choices worth flagging as judgment calls,
not deviations: (1) the granularity line described above (cards/panels are one unit, list items are
individually staggered, interactive control clusters are one unit) — the brief asked for this line
to be stated, not a specific placement; (2) `StepsSection`'s per-step reveal lives on an **inner**
div rather than the `<li>` itself, to avoid the inline-style-vs-class opacity conflict described
above — a structural necessity given the `<li>` already carries an unrelated continuous opacity, not
a stylistic choice.

## Git / Change Scope
Branch `Krish-landingpage`. Twelve files changed this phase (listed above), 500 insertions / 266
deletions per `git diff --stat`. `git status` shown above, per the brief's instruction, before any
commit. `DESIGN.md`'s pre-existing unstaged deletion is **not staged** and was not touched. Nothing
has been staged or committed this phase.

## Next Steps
- Owner: a slow, real-device scroll from top to bottom and back — the strongest remaining check,
  watching specifically for anything feeling over-animated now that list items/footer links/eyebrows
  join the cards/panels, and for the reduced-motion path under an actual OS setting.
- Owner: say go/no-go on committing; `git status` is shown above exactly as requested, nothing
  staged.
