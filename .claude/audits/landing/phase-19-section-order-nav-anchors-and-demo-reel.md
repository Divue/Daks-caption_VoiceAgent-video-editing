# Landing Section Reorder, Nav Anchors, Demo Reel & Editor Home — Audit

## Status
Implemented and structurally verified in a real Chromium page (`npm run dev`, measured via
DOM geometry). Typecheck + production build pass; `oxlint` reports no new findings. Video
*playback* was NOT visually confirmed — the automation tab runs backgrounded, where Chrome
defers media decode and throttles `requestAnimationFrame`, so the page's reveal animations and
the `<video>` never start. The `<video>` element, its four autoplay attributes, its `object-fit`
and its poster were verified from the live DOM; the poster itself was fetched `200`.
**Blocker: `apps/web/public/demo-reel.mp4` is matched by `.gitignore:12` (`*.mp4`) and will not
commit as things stand.**

## Objective
Six requested changes to the landing page and editor:
1. Move "Made for Hinglish" directly below "Tone-aware captions".
2. Move its three numbered cards into "Under the hood", below that section's visual.
3. Put a looping demo video behind the text of the three tone-aware caption cards.
4. Navbar: drop "Sign In"; rename two items; give three items section dropdowns.
5. Make every nav link actually navigate to a stable section id, smoothly, offset by CSS.
6. Give the editor a labelled way back to the landing page that survives a loaded video.

## Implementation

### 1. Section order
`pages/LandingPage.tsx` render order only. `HinglishSection` moved up between
`CaptionShowcaseSection` and `ToneSection`. Imports left in their original order (reordering
them would be a cosmetic diff with no effect).

### 2. The three cards
The `POINTS` array and its rendering block moved verbatim from `HinglishSection.tsx` to
`SignalsSection.tsx` — same copy, same `01/02/03` numbering, same card classes. They use only
global design tokens (`line-subtle`, `surface`, `ink-*`, `signal`) and the shared
`dark/RevealItem`, so nothing local had to be carried over.

They sit inside `SignalsSection`'s existing `max-w-[1200px]` container, directly below the
`RevealItem` holding the score/waveform card, as `mt-16 grid gap-4 sm:grid-cols-3`.

**Layout choice (asked to report):** kept as a **row of three below the score**, not a stack.
The score card is already full-width and tall; three stacked cards under it made the section
visibly bottom-heavy in review. A row reads as a footer to the score and matches how the cards
were already laid out in their old home.

`HinglishSection` did not collapse: its last element is now the marquee caption line, and the
section's own `py-24 sm:py-32` supplies the bottom spacing. No padding change was needed, so
none was made.

### 3. Demo reel behind the caption frames
The "three cards currently empty behind their text" were identified as the three **caption
frames** (1:1, 9:16, 16:9), not the number cards below them — the file's own header comment
said "The frames carry no footage on purpose… Swap the backdrop for a `<video>` then", and the
section copy promises "a real Hinglish clip, in three of them". Confirmed with the repo owner
before implementing.

In `CaptionFrame` (`CaptionShowcaseSection.tsx`), inside the existing aspect-ratio box and
*before* `CaptionWords`:
- `motionSafe` → `<video src="/demo-reel.mp4" poster="/demo-reel-poster.jpg" autoPlay muted loop
  playsInline preload="metadata" aria-hidden tabIndex={-1}>` at `absolute inset-0 h-full w-full
  object-cover`.
- `!motionSafe` → `<img src="/demo-reel-poster.jpg" alt="" aria-hidden>` with the same cover
  classes. Static, never autoplays.
- Then a scrim: `absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65`.
  A gradient overlay, not a text-shadow.

`CaptionWords` is itself `absolute` and comes later in DOM order, so it paints above the scrim
with no `z-index`. The frame's original `backdrop` gradient stays as the element background and
now acts as the fallback if the file is missing.

Paths are string literals, not bundler imports, so the asset is served from `public/` unhashed
and all three frames hit one URL (verified: 3 `<video>` elements, 1 distinct `src`).

### 4 & 5. Navbar and anchors
`NAV_ITEMS` in `LandingNavbar.tsx` was replaced with a structure where an item either carries
`entries` (a dropdown of section anchors) or a single `href`:

| Bar item | Behaviour | Entries |
| --- | --- | --- |
| Features | dropdown | Tone aware captions → `#showcase`; Edit by voice → `#edit-by-voice`; Hear the difference → `#hear-the-difference` |
| How It Works | dropdown | Under the hood → `#under-the-hood`; How it works → `#how-it-works` |
| Hear the difference *(was "Voice Editing")* | dropdown | Tone aware captions → `#showcase`; Hear the difference → `#hear-the-difference` |
| Made for Hinglish *(was "For Creators")* | plain link | → `#made-for-hinglish` |

`PanelContent` now renders `<ul><li><a href>`, replacing the four hand-written marketing panels
(`FEATURES`, `FLOW_CARDS`, `STEPS`, `VOICE_POINTS`, `WAVEFORM_BARS`, `CREATOR_CATEGORIES` — all
deleted as dead code). The panel narrowed from `w-[min(880px,92vw)] p-8` to
`w-[min(320px,92vw)] p-2` to suit two or three links; it stays centred under the bar and keeps
the existing open/close, hover-swap, `openSession` remount-stagger and Escape behaviour.

"Sign In" removed from both the desktop bar and the mobile sheet. "Start Creating" →
`navigate('/editor')` untouched.

**Keyboard fix:** the panel is a DOM *sibling* of `<nav>`, so the nav's existing blur check
treated a Tab into the panel as "focus left the menu" and closed it before its links could be
reached. Added `panelRef`; the nav's `onBlur` now also allows `panelRef`, and the panel has a
matching `onBlur` allowing `navRef`. Entries are real `<a>`, not divs with `onClick`.

**Section ids** (`scroll-mt-20` = 80px on each, clearing the 72px navbar):

| Section | id | change |
| --- | --- | --- |
| Tone-aware captions | `showcase` | kept (the hero's "See it in action" targets it) |
| Made for Hinglish | `made-for-hinglish` | renamed from `for-creators` |
| Hear the difference | `hear-the-difference` | renamed from `features` |
| Under the hood | `under-the-hood` | **added** (had none) + `scroll-mt-20` |
| Edit by voice | `edit-by-voice` | renamed from `voice-editing` |
| How it works | `how-it-works` | kept |

The old ids were navbar-key names inherited from an earlier bar and had drifted — `ToneSection`
("Hear the difference") carried `id="features"`. `dark/navLinks.ts`, which the rendered footer
reads, was repointed at the new ids; its docstring claimed to be shared with `LandingNavbar`,
which was already untrue before this change, and now says so.

**Smooth scrolling** is CSS, in `index.css`:
```css
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
```
No JS offset anywhere; the offset is each section's own `scroll-margin-top`. Reduced-motion
visitors fall through to an instant jump.

**Knock-on fix (important).** `scroll-behavior: smooth` on `html` changes what a bare
`window.scrollTo(x, y)` does — it animates. Three existing call sites needed to stay instant and
were made explicit with `behavior: 'instant'`:
- `LandingPage.tsx:103` — the load intro's scroll reset. The VoiceSphere measures its landing
  position immediately after; an animated scroll would still be in flight.
- `LandingScrollbar.tsx` thumb drag — every `pointermove` would have started a fresh animation
  toward a target already replaced, so the thumb would visibly lag the cursor.
- `LandingScrollbar.tsx` track click-to-jump.

### 6. Editor home button
`components/layout/AppHeader.tsx`: a `Home` (lucide) button as the first control in the header's
left group, before "Projects", using the identical existing pattern —
`<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">`, icon + label
hidden below `sm`. `onClick={() => navigate('/')}` via the app's history-API router, no reload.

`AppHeader` renders from `App.tsx`, which only mounts once a project is loaded, so the button is
present exactly when a video is open. No confirmation dialog: every edit is written through to
the API as it is made (`useWordPatch` → `lib/api` `patchWord`/`patchWordsBulk`/`patchProject`),
and a repo-wide grep for `beforeunload`/`unsaved`/`confirm(` found no guard pattern to follow.

**Note for the requester:** the editor already had a `/` destination — the sidebar rail's top
`Home` icon (`AppSidebar.tsx:25`). It is icon-only at 56px, which is why it reads as decoration.
It was left as is; the header button is additive.

## Files Created
- `apps/web/public/demo-reel.mp4` — the demo clip (copied from the path the owner supplied; 636,878 bytes, avc1, no audio track, 478×850).
- `apps/web/public/demo-reel-poster.jpg` — first-frame poster, 478×850, 21,836 bytes.
- `.claude/audits/landing/phase-19-section-order-nav-anchors-and-demo-reel.md` — this audit.

## Files Modified
- `apps/web/src/pages/LandingPage.tsx` — section order (structural); intro `scrollTo` made explicitly instant.
- `apps/web/src/components/landing/HinglishSection.tsx` — `POINTS` + card grid removed; id renamed.
- `apps/web/src/components/landing/SignalsSection.tsx` — `POINTS` + card grid added; id + `scroll-mt-20` added.
- `apps/web/src/components/landing/CaptionShowcaseSection.tsx` — video/poster/scrim in `CaptionFrame`; stale header comment corrected.
- `apps/web/src/components/landing/ToneSection.tsx` — id rename only.
- `apps/web/src/components/landing/TalkToEditSection.tsx` — id rename only (one line).
- `apps/web/src/components/landing/LandingNavbar.tsx` — structural rewrite of nav data + panels; Sign In removed; panel focus containment.
- `apps/web/src/components/landing/LandingScrollbar.tsx` — two `scrollTo` calls made explicitly instant.
- `apps/web/src/components/landing/dark/navLinks.ts` — hrefs/labels repointed at real ids; docstring corrected.
- `apps/web/src/index.css` — guarded `scroll-behavior: smooth` block (additive).
- `apps/web/src/components/layout/AppHeader.tsx` — Home button (additive).

## Files Intentionally Untouched
- `apps/web/src/components/VoiceSphere.tsx` — explicitly locked by the requester.
- `apps/web/src/components/landing/dark/*` except `navLinks.ts` — the `dark/` duplicates are not
  rendered by `LandingPage.tsx` (only `dark/LandingFooter`, `dark/RevealItem`, `dark/useMotionSafe`
  are), and three other branches render the originals.
- `apps/web/src/components/landing/{AiEditingSection,ValuePropsSection,HowItWorksSection,CaptionStylesSection,CreatorSection,HeroSection,ClosingSection}.tsx` — not on the requested list; `ClosingSection` has no nav entry so it needed no id.
- `packages/shared`, `services/api`, `remotion/` — other owners; nothing here needed them.
- `.gitignore` — see Blockers. Changing repo-wide media policy is the owner's call.
- `DESIGN.md` — the known Windows phantom deletion. Not staged, not restored.

## Architecture
NEW: the demo-reel asset pair, and the navbar's anchor-list data shape.
REUSED, unchanged: `RevealItem`, `useMotionSafe`, `SectionHeading`, `CaptionWords`, the
`useRoute` router, the `ui/button` variants, the existing dropdown open/close state machine
(`openMenu`/`closeNow`/`scheduleClose`/`openSession`), and every design token.

No new dependency. `Home` comes from `lucide-react`, already a direct dependency and already
imported by `AppSidebar`.

## Interfaces / Contracts
- Section ids are now a real contract between `LandingNavbar`, `dark/navLinks.ts`, the hero's
  "See it in action" button (`#showcase`) and the sections themselves. Renaming a section id
  now breaks links in up to three files.
- `PanelContent`'s props changed from `{ menuKey, motionSafe }` to `{ entries, motionSafe,
  onNavigate }`. It is module-local; no external caller.
- Static asset contract: `/demo-reel.mp4` and `/demo-reel-poster.jpg` must exist at the web root
  of the deployed build.
- No schema, env var, or API change.

## Ownership
Everything is under `apps/web` — **P3 (editor UI)**. No file outside that folder was touched.
`AppHeader.tsx` is editor chrome, also P3. No cross-owner sign-off required.

## Validation
- The `<video>` degrades safely: if the file 404s, the poster shows; if both fail, the original
  `backdrop` gradient (still set as the element's `background`) shows. The caption layer is
  unaffected in all three cases.
- Reduced motion is decided at mount by `useMotionSafe()` (`window.matchMedia`), the same hook
  the rest of the landing page uses. Under `reduce`, no `<video>` is rendered at all — not a
  paused one — so nothing can autoplay.
- `NAV_ITEMS.find(...)?.entries ?? []` guards the panel lookup, so an item without entries can
  never render an empty panel.
- Silent failure mode worth knowing: a mistyped `href` in `NAV_ITEMS` fails quietly (the browser
  does nothing). Nothing validates ids against the DOM at build time.

## Security
No secrets, credentials, tokens or URLs added. No auth surface. No user input, no LLM prompt
path, no external service. The one new asset is a static local file served from `public/`.
`demo-reel.mp4` is the owner's own clip, supplied by them for this purpose — it replaces the
uncleared third-party test reels the old header comment was written to avoid.

## Testing
Commands actually run, from `apps/web`:
- `npm run build` (`tsc -b && vite build`) — **passed**, 2182 modules, built in 387 ms. The only
  warning is the pre-existing `EditorBootstrap` 780 kB chunk-size notice.
- `npm run lint` (`oxlint`) — **0 errors**. Warnings exist but none in any file touched here;
  all are pre-existing `only-export-components` / `set-state-in-effect` / `refs` notices.
- `npm run dev` + a real Chromium page, measured through the DOM:
  - Section DOM order: `top, showcase, made-for-hinglish, hear-the-difference, under-the-hood,
    edit-by-voice, how-it-works` — matches the requested order exactly. 0 missing ids.
  - Cards: all three titles ("Hindi audio in", "Roman script out", "Timed to the word") found
    under `#under-the-hood`; **0** found under `#made-for-hinglish`.
  - Video: 3 `<video>` elements, **1** distinct `src`; `autoplay/muted/loop/playsInline` all
    `true`; computed `object-fit: cover`; `poster` set. `demo-reel-poster.jpg` fetched **200**.
  - Frame geometry at 1280px: 284×313 (1:1), 284×533 (9:16), 477×297 (16:9) — correct ratios,
    laid out in one row.
  - Horizontal overflow, measured in same-origin iframes at exactly 1280 / 768 / 375 CSS px:
    `scrollWidth == clientWidth` at all three, **0** offending elements.
  - Dropdowns: desktop "Features" panel opens with its 3 links at the right hrefs; mobile sheet
    at 375 and 768 opens and expands "Features". No header element crosses the viewport at any
    of the three widths. No "Sign In" string anywhere in the header.
  - Anchor offset: `scrollIntoView({block:'start'})` on all six sections lands each one at
    **exactly 80px** from the viewport top, clearing the 72px navbar.
  - `getComputedStyle(html).scrollBehavior === 'smooth'`; `scroll-margin-top === 80px`.
  - Console: no errors or exceptions.

No unit tests were added — none of this is logic with a testable contract, and the repo has no
component-test harness (`check:captions` / `check:agent` are pipeline scripts, unrelated).

## Live Verification
- **Verified against a real running app:** everything in the Testing section above — real Vite
  dev server, real Chromium, real computed styles and real measured geometry.
- **Verified against a real file:** the mp4 container was parsed byte-for-byte (`ftyp mp42/isom`,
  `avc1`/`avcC`, no `mp4a`) and its first keyframe decoded with WebCodecs `VideoDecoder` to
  produce the poster — that decode is what confirms the clip is 478×850 H.264 with no audio.
- **NOT verified:** actual video playback and the visual appearance of the finished cards. The
  automation tab is backgrounded; Chrome leaves `readyState` at 0 for media and throttles
  `requestAnimationFrame` there, so the video never decodes and the page's `RevealItem` reveals
  never fire (screenshots render the navbar but a blank body). This is an environment limit, not
  a code defect — the same limit is why the poster had to be produced via WebCodecs rather than
  a canvas draw from a playing `<video>`.

## Unverified / Untestable
1. **Video playback, the scrim's real contrast against moving footage, and the cropped
   composition of the portrait clip in the 1:1 and 16:9 frames.** Reason: background-tab media
   throttling, above. Needs one look in a foreground browser.
2. **Mobile Safari autoplay.** No iOS device or simulator here. The four required attributes are
   present and were read back from the live DOM, which is the checkable part.
3. **Actual smooth-scroll animation.** `scroll-behavior: smooth` is confirmed computed, and the
   landing *position* is confirmed exact, but the animation itself does not run in a throttled
   background tab. Instant scrolling was confirmed working in the same tab, which isolates the
   cause to the throttle.
4. **`prefers-reduced-motion: reduce` rendering.** The code path is a plain ternary on
   `useMotionSafe()`, inspected and traced to `window.matchMedia`, but the media query was not
   forced on in a live browser.

## Integration Status
- Landing page changes: **connected** — render in the real app.
- Editor Home button: **connected** — uses the existing router.
- `demo-reel.mp4`: **not committed** — blocked by `.gitignore`. Present and working locally only.
- `demo-reel-poster.jpg`: untracked but not ignored; will commit normally when staged.

## Dependencies / Blockers
1. **`.gitignore:12` (`*.mp4`) excludes `apps/web/public/demo-reel.mp4`.** Nothing on the landing
   page will show video for anyone else, or on Amplify, until this is resolved. Options, for the
   repo owner (lead) to choose: add a negation (`!apps/web/public/demo-reel.mp4`), or host the
   clip in S3/CloudFront and point the two constants in `CaptionShowcaseSection.tsx` at that URL.
   622 KB in git history is the trade-off for the first option. **Not actioned here** — the
   `*.mp4` rule is deliberate (test reels), and repo-wide media policy is not this task's scope.
2. Someone should do the foreground-browser pass listed under Unverified item 1.

## Deviations
- **Nav dropdown entries under "Features" were flagged as unconfirmed by the requester** and
  implemented as specified pending their review: Tone aware captions, Edit by voice, Hear the
  difference. Easy to swap — one array in `LandingNavbar.tsx`.
- **`LandingScrollbar.tsx` and `LandingPage.tsx`'s intro `scrollTo` were modified**, which is
  slightly wider than "navbar + sections". This was forced, not optional: the requested global
  smooth-scroll silently changes the behaviour of every bare `window.scrollTo`, and leaving them
  would have broken the custom scrollbar drag and the load intro. Each is a one-line
  behaviour-preserving clarification.
- **`dark/navLinks.ts` was modified** — it is in `dark/`, but it is read by `dark/LandingFooter`,
  which *is* rendered by `LandingPage.tsx`, and all four of its hrefs pointed at ids that this
  change renamed. Leaving it would have left four dead footer links.
- Nothing else deviates. No new copy, headings, cards or marketing strings were invented; the
  only new strings in the repo are the navbar renames and dropdown entry labels the requester
  specified.

## Git / Change Scope
Branch `Krish-landingpage`, working tree dirty. Nothing was staged or committed by this work.

Pre-existing changes present at session start and **left untouched**:
- `DESIGN.md` — phantom deletion from the `DESIGN.md`/`design.md` case collision on Windows. Never staged.
- `apps/web/src/components/landing/TalkToEditSection.tsx` — staged changes from phase 18 (this
  work added one unstaged line to it: the id rename).
- `apps/web/src/components/landing/caption-demo.tsx` — unstaged, pre-existing. Confirmed by diff
  that it contains nothing from this work.
- Untracked: `PROJECT_LOG.md`, `apps/web/public/editor-screenshot.png`, the phase-17 and
  phase-18 audits.

No unrelated file was modified by this work; no ownership boundary was crossed.

## Next Steps
1. **Repo owner / lead:** decide how `demo-reel.mp4` ships (gitignore negation vs. S3), then
   apply it. Blocking for the feature.
2. **Requester (P3):** confirm or swap the three "Features" dropdown entries.
3. **P3:** one foreground-browser pass at 1280/768/375 — confirm the video plays and loops, the
   scrim keeps every preset legible over moving footage, and the portrait crop looks right in the
   1:1 and 16:9 frames. Toggle OS reduced-motion once to confirm the static poster path.
4. **P3:** stage and commit; per root `CLAUDE.md`, this audit ships in the same PR.
