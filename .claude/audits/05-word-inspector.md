# Word Inspector

## Status
Completed

## Commit
`2b3b3d3` — "feat: add word inspector" (no body recorded)

## Objective
Let the user edit the properties of the currently selected word, including
per-word style overrides on top of the active preset.

## What was implemented
- `WordInspector`: shows the selected word's text (editable `Input`),
  emphasis (`Switch`), emotion (`Select`, options from the shared `Emotion`
  enum), stretch (numeric `Input`, min 1, step 0.1). Falls back to an empty
  state ("No word selected...") when `selectedWordId` is null or not found.
  All edits dispatch `UPDATE_WORD` with a `Partial<Word>` patch.
- `StyleOverrideFields`: editor for `word.style` (`Partial<Style> |
  undefined`) — font, size, color, weight/bold, uppercase, and (per the
  initial version) additional fields behind a "show more" toggle. Uses a
  `withField` helper that sets one field and drops the whole override object
  once no field remains set (so an all-default override collapses back to
  `undefined` rather than persisting an empty object).
- New shadcn primitives added to support this: `components/ui/input.tsx`,
  `components/ui/label.tsx`, `components/ui/select.tsx`,
  `components/ui/switch.tsx`.

## Files created
`apps/web/src/components/inspector/StyleOverrideFields.tsx`,
`apps/web/src/components/inspector/WordInspector.tsx`,
`apps/web/src/components/ui/input.tsx`,
`apps/web/src/components/ui/label.tsx`,
`apps/web/src/components/ui/select.tsx`,
`apps/web/src/components/ui/switch.tsx`.

## Files modified
`apps/web/src/App.tsx` (mounts `WordInspector`, passes `selectedWordId`).

## Why we chose this approach
The shared schema defines `Word.style` as `Style.partial().optional()` —
"per-word override from user or agent" (comment in
`packages/shared/src/project.ts`). `StyleOverrideFields` mirrors that
contract exactly: it edits a partial style object, not a full `Style`, and
collapses to `undefined` when empty so unedited words don't carry a stray
empty override object into the saved `Project`.

## Alternatives considered
No alternative was formally documented.

## Important constraints
- Only edits one word at a time (the selected one); no bulk/multi-word style
  editing.
- Style fields edited here are user overrides layered on top of the preset's
  `base`/`emphasis` styles (`packages/shared/src/presets.ts`) — this
  component does not touch preset definitions themselves.

## Integration boundary
Depends on `useSelection`'s `selectedWordId` (milestone 04) and dispatches
into `project-reducer.ts`'s `UPDATE_WORD` action (milestone 02). The style
shape it edits (`Partial<Style>`) is rendered by the renderer eventually
(P2/remotion) and by the local `CaptionPreviewOverlay` preview (added in the
redesign commit, milestone 09).

## Decisions future developers must preserve
- Keep `withField`'s "collapse to undefined when empty" behavior — it keeps
  the saved `Project` free of no-op override objects.
- Keep style editing scoped to `Partial<Style>`, matching the schema; do not
  widen `Word.style` to a full `Style` in the UI without a corresponding
  schema change (which requires lead sign-off per root `CLAUDE.md`).

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
No multi-word/bulk editing. No undo-friendly debouncing noted — every
keystroke in the text input dispatches an `UPDATE_WORD` action (each becomes
its own undo step).

## Future integration
The agent (P4) is expected to eventually write the same `Word`/`style` shape
via validated tool calls (per root `CLAUDE.md`) — this UI and the future
agent path both funnel through the same `UPDATE_WORD` reducer action and
schema validation, so they stay consistent by construction.
