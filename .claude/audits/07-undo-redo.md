# Undo/Redo Controls + Keyboard Shortcuts

## Status
Completed

## Commit
`387fc02` — "feat: add undo redo controls" (no body recorded)

## Objective
Expose the undo/redo history (built in milestone 02) through visible buttons
and keyboard shortcuts.

## What was implemented
- `UndoRedoControls`: two buttons dispatching `UNDO`/`REDO`, disabled per
  `canUndo`/`canRedo` from `useProject()`.
- `useUndoRedoShortcuts`: global `keydown` listener wiring Ctrl/Cmd+Z (undo)
  and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo). Skips handling when the event
  target is an `<input>`, `<textarea>`, or `contentEditable` element
  (`isEditableTarget`), so it doesn't hijack a user's undo inside a text
  field.
- `components/ui/button.tsx` shadcn primitive added.

## Files created
`apps/web/src/components/layout/UndoRedoControls.tsx`,
`apps/web/src/components/ui/button.tsx`,
`apps/web/src/hooks/useUndoRedoShortcuts.ts`.

## Files modified
`apps/web/src/App.tsx` (mounts `UndoRedoControls`, calls
`useUndoRedoShortcuts()`).

## Why we chose this approach
Reuses the `UNDO`/`REDO` actions already defined in `project-reducer.ts`
(milestone 02) rather than introducing a second history mechanism. The
editable-target guard follows standard browser UX convention: form fields
keep their native undo, the app-level shortcut only applies elsewhere.

## Alternatives considered
No alternative was formally documented.

## Important constraints
Single global keyboard listener — no scoping to a focused panel; it is
attached to `window` and active anywhere in the editor except inside
editable fields.

## Integration boundary
Both the buttons and the shortcut dispatch directly into
`project-reducer.ts`'s existing `UNDO`/`REDO` cases — no new reducer logic
was added in this milestone.

## Decisions future developers must preserve
- Keep the editable-target guard in `useUndoRedoShortcuts` — removing it
  would break native undo inside text inputs (e.g., the word-text field in
  `WordInspector`).
- Keep undo/redo as the single mechanism for reverting `Project` changes;
  do not add a parallel "revert" feature that bypasses the reducer's
  past/future stacks.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message.

## Known limitations / deferred work
No visual indication of how many steps are available to undo/redo (no
counter/tooltip beyond enabled/disabled state).

## Future integration
None specific — this is a self-contained UI layer over the existing history
state.
