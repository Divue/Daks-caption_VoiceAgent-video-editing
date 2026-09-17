# Editor Layout Shell (v1 — superseded)

## Status
Completed (superseded by the redesign in `628a3e6`; see
`09-editor-ui-redesign.md` for the current layout)

## Commit
`46c452f` — "feat: build editor layout shell" (no body recorded)

## Objective
Replace the default Vite/React scaffold page with a real editor layout
skeleton: a player area and placeholder side panels.

## What was implemented
- `PlayerPlaceholder` (initial version): a simple bordered box, not yet
  reading project dimensions or rendering captions.
- `PanelPlaceholder`: a generic "coming soon"-style placeholder used for the
  side panels before transcript/inspector/presets existed.
- Added shadcn `Card` and `Tabs` primitives (`components/ui/card.tsx`,
  `components/ui/tabs.tsx`).
- Removed scaffold leftovers: `App.css`, `src/assets/*`, `public/icons.svg`.

## Files created
`apps/web/src/components/layout/PanelPlaceholder.tsx`,
`apps/web/src/components/player/PlayerPlaceholder.tsx`,
`apps/web/src/components/ui/card.tsx`,
`apps/web/src/components/ui/tabs.tsx`.

## Files modified
`apps/web/src/App.tsx`.

## Files deleted
`apps/web/public/icons.svg`, `apps/web/src/App.css`,
`apps/web/src/assets/hero.png`, `apps/web/src/assets/react.svg`,
`apps/web/src/assets/vite.svg`.

## Why we chose this approach
Establish the three-column editor structure (player / transcript / tabs)
early so subsequent feature commits (transcript, inspector, presets) each
slot into an existing layout rather than building layout and feature
simultaneously.

## Alternatives considered
No alternative was formally documented.

## Important constraints
Layout only — no real project data was rendered yet; `PlayerPlaceholder` at
this stage did not yet read `project.width`/`height` or overlay captions
(that came later, in the redesign commit).

## Integration boundary
`PanelPlaceholder` was a temporary stand-in later replaced entirely by real
panels (`TranscriptPanel`, `WordInspector`, `PresetPicker`) in following
commits — it no longer exists in the current tree after the redesign.

## Decisions future developers must preserve
None specific to this version — it was intentionally transitional. See
`09-editor-ui-redesign.md` for the layout that replaced it and is current.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
Placeholder panels had no real content; superseded before completion of the
milestone list.

## Future integration
N/A — fully superseded. Kept as a historical record of the layout's
evolution.
