# Transcript Panel + Word Selection

## Status
Completed

## Commit
`5a9ce38` — "feat: add transcript panel and word selection" (no body recorded)

## Objective
Let the user see the project's words and select one to edit.

## What was implemented
- `TranscriptPanel`: lists `project.words` from `useProject()`.
- `TranscriptWordRow`: renders a single word row, highlighted when selected.
- `useSelection` hook: tracks `selectedWordId`; clicking the already-selected
  word clears the selection (toggle behavior).
- This commit's version had no search box (verified via `git show 5a9ce38` —
  a plain `project.words.map(...)` list, 24 lines). The search/filter UI
  (`Input` + case-insensitive substring match against `word.text`) was added
  later, in the redesign commit `628a3e6` (verified via `git show 628a3e6`).
  See `09-editor-ui-redesign.md` for that change.

## Files created
`apps/web/src/components/transcript/TranscriptPanel.tsx`,
`apps/web/src/components/transcript/TranscriptWordRow.tsx`,
`apps/web/src/hooks/useSelection.ts`.

## Files modified
`apps/web/src/App.tsx` (mounts `TranscriptPanel`, wires `useSelection`).

## Why we chose this approach
Selection state is local UI state (`useState`, not reducer state) because it
does not need undo/redo or schema validation — it is ephemeral view state,
not part of the `Project` document.

## Alternatives considered
No alternative was formally documented.

## Important constraints
Selection is a single word id, not a range or multi-select.

## Integration boundary
`selectedWordId` from `useSelection` is passed down from `App.tsx` into both
`TranscriptPanel` (for highlighting) and `WordInspector` (milestone 05, for
editing) — this is the seam connecting "pick a word" to "edit a word."

## Decisions future developers must preserve
- Keep selection as lifted state in `App.tsx`, shared between transcript and
  inspector, rather than duplicating selection state per panel.
- Preserve toggle-to-deselect behavior in `useSelection`.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
No multi-select, no keyboard navigation between words, no scroll-to-selected
behavior recorded as implemented.

## Future integration
Selection could later drive player playhead position (seeking to a word's
`startMs`) once a real player exists (P2) — not implemented yet.
