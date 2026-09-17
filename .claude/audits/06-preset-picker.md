# Preset Picker

## Status
Completed

## Commit
`cdd897f` — "feat: add preset picker" (no body recorded)

## Objective
Let the user switch the project's active preset.

## What was implemented
- `PresetPicker`: iterates `Object.values(PRESETS)` (from
  `@captions/shared`), rendering each preset's name, `wordsPerLine`, and a
  live-styled preview string ("Hellooooo bhai") using the preset's `base`
  style scaled down (`PREVIEW_SCALE = 0.35`) to fit the preview box. Clicking
  a preset dispatches `SET_PRESET`. The currently active preset is
  highlighted (`aria-pressed`, border/background change).

## Files created
`apps/web/src/components/presets/PresetPicker.tsx`.

## Files modified
`apps/web/src/App.tsx` (mounts `PresetPicker` inside a tab).

## Why we chose this approach
`PRESETS` (`packages/shared/src/presets.ts`) is the single source of truth
for preset visuals, per root `CLAUDE.md` ("Presets are the base look.");
`PresetPicker` reads from it directly rather than hardcoding preset names or
styles, so adding/editing a preset in `packages/shared` automatically shows
up here with no `apps/web` change required.

## Alternatives considered
No alternative was formally documented.

## Important constraints
Only changes `project.presetId` — does not touch per-word style overrides or
emotion layers (those are separate, per root `CLAUDE.md`: "Emphasis and
emotion are per-word layers on top of any preset").

## Integration boundary
Dispatches `SET_PRESET` into `project-reducer.ts` (milestone 02). Read by
`CaptionPreviewOverlay` (milestone 09) to render the live preview, and by
`useAgentActivity` (milestone 09) to log preset-change activity.

## Decisions future developers must preserve
- Keep iterating `PRESETS` rather than hardcoding a preset list.
- Keep the preview computed from the preset's actual `base`/`emphasis`
  style values, not a separate hand-authored preview style, so the picker
  never drifts from what the preset actually renders as.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
Preview shows only the `base` style, not emotion-layer effects
(`EMOTION_STYLES` in `packages/shared/src/presets.ts`) or the `emphasis`
style applied to a stretched/emphasized word — this is a simplified static
preview, not a full render.

## Future integration
The real Remotion composition (P2) is the actual renderer for these presets;
this picker's preview is a local approximation for the editor only.
