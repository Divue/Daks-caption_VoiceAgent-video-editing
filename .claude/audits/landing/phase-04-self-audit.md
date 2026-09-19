# Landing: self-audit of phases 01–03 before push (phase 04)

## Status
All landing work from phases 01–03 was reviewed against the real diff and re-checked. One bug was
fixed (below). The work was pushed on its own branch, `landing-redesign`, cut from `origin/master`.
Nothing was merged.

## Checks run (2026-09-20)
- `npx tsc -b` (apps/web): no errors.
- `npx oxlint src`: no findings in landing files. The only warnings are pre-existing editor files
  (`word-patch-context.tsx`, `EditorBootstrap.tsx`, `playback-context.tsx`) plus
  `only-export-components` on `landing/caption-demo.tsx` (it affects dev fast refresh only).
- `npm run build`: OK. `npm run check:captions`: all checks passed.
- The same tsc and build were re-run on the `landing-redesign` worktree (the master base plus these
  files) to prove the work doesn't depend on anything only on `p3-agent-talk-edit`.

## Scope review
- Every change is in `apps/web` plus `.claude/audits/landing/`. Nothing in `services/`,
  `remotion/` or `packages/shared`, and no schema, API or env change.
- Files changed: `VoiceSphere.tsx`, `LandingNavbar.tsx`, `index.css`, `LandingPage.tsx`.
  New: `landing/{caption-demo, CaptionShowcaseSection, ToneSection, SignalsSection,
  TalkToEditSection, HinglishSection, StepsSection, ClosingSection, LandingScrollbar}.tsx` and
  `landing/LANDING_COPY.md`.
- Untouched on purpose: the six original `landing/*Section.tsx` files (other branches render them)
  and `LandingBackground.tsx` (the owner said to keep the background).
- `VoiceSphere.tsx` was the handoff's LOCKED file. The owner explicitly asked for every change made
  to it (arms, scroll reaction, intro, colours, pill labels, mic). Recorded here as the unlock.

## Findings
| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `history.scrollRestoration = "manual"` (set so every load starts at the top) was never restored, so it leaked into the editor route's back/forward navigation | Bug | **Fixed**: restored to `"auto"` on landing unmount |
| 2 | Pills were renamed (Sentiment analysis, Voice AI native, Easier to edit, Trendy) but clicking still fires the old sphere effects (shake / scale-up / stretch / glow), which don't describe the new labels | UX mismatch | Open; the owner decides what a click should do |
| 3 | The real-reel fixture has repeats baked into "saaaal", and `renderedText` adds more, so demos show "saaaalll" | Data (P1) | Open; logged for P1 since phase 01 |
| 4 | The intro, glide, arms, text masks, scroll reaction and custom scrollbar drag were never watched frame by frame; the automation Chrome tab reports `visibilityState: hidden` and 0 rAF/s | Verification gap | Open; the owner should watch once on desktop and a phone |
| 5 | Reduced-motion paths were checked by reading only (not emulated) | Verification gap | Open |
| 6 | Dead code left on purpose (the handoff says nothing is deleted from disk): `SphereCornerCaptions`, the unused `dark/*` sections, and the unused keyframes (`word-reveal`, `subtitle-reveal`, `eyebrow-reveal`) | Hygiene | Left; safe to delete in a cleanup PR |
| 7 | The intro depends on timers, so a background tab (throttled timers) plays it slower, and the scroll lock lasts until it ends | By design | Accepted |
| 8 | The intro re-parks the stage every frame (one layout read) for about 1.85 s so reflows don't move its target | Perf, small | Accepted |
| 9 | Showcase/Tone/Talk frames use gradient backdrops, not footage (rights) | Content | Open; waiting on licensed clips |

## Honesty review of page copy
Every number is computed from the code (presets, tones, signals, the upload cap). Every quoted line
is real pipeline output from the fixtures. The agent replay uses real tool names and is labelled a
replay. The "English (India) returned zero words" line comes from the `pipeline/stt.py` bake-off
note. There are no invented stats, testimonials, pricing or speed claims.

## Git
- Branch `landing-redesign` from `origin/master`, one commit containing only the files listed
  above, pushed to `origin`. No PR opened and nothing merged.
- The same changes are still uncommitted in the `p3-agent-talk-edit` working tree (left as they
  were, not reverted).
