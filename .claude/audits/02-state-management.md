# Project State Management + Undo/Redo Foundation

## Status
Completed

## Commit
`3c6a822` — "feat: add project state management and undo" (message body: only
the co-author trailer; no further description recorded).

## Objective
Give the editor a single, schema-validated source of truth for the `Project`
being edited, with undo/redo history — the foundation every later editor
feature (inspector, presets, upload, undo controls) dispatches into.

## What was implemented
- `state/project-reducer.ts`: `ProjectHistoryState { past, present, future }`
  of `Project` snapshots; `ProjectAction` union
  (`SET_PROJECT`, `UPDATE_WORD`, `SET_PRESET`, `ADD_OVERLAY`, `UNDO`, `REDO`).
  Every mutating action builds a candidate `Project` and passes it through
  `Project.safeParse` before committing (`commit()` helper); a failed
  validation logs via `console.error` and leaves state unchanged. `UNDO`/
  `REDO` move between already-valid snapshots without re-validating.
- `state/project-context.tsx`: `ProjectProvider` seeds state from
  `packages/shared/fixtures/demo-project.json` via `Project.parse` (throws on
  an invalid fixture); `useProject()` exposes `{ project, dispatch, canUndo,
  canRedo }`.
- `App.tsx` rewritten to read from `useProject()` instead of local scaffold
  state.

## Files created
`apps/web/src/state/project-context.tsx`, `apps/web/src/state/project-reducer.ts`.

## Files modified
`apps/web/src/App.tsx` (rewritten to consume `useProject`),
`apps/web/src/main.tsx`, `apps/web/tsconfig.app.json`.

## Why we chose this approach
A reducer with past/present/future arrays is the standard, minimal pattern
for linear undo/redo without extra dependencies. Validating every candidate
against the shared `Project` Zod schema before committing enforces the root
`CLAUDE.md` rule that "agent tool calls are validated against the schema
before being applied" and, more generally, that the shared JSON is the only
contract — this reducer is the one place in `apps/web` allowed to mutate it.

## Alternatives considered
No alternative was formally documented.

## Important constraints
- `UNDO`/`REDO` do not re-validate (by design — they replay states that were
  already valid when committed).
- `ADD_OVERLAY` was added to the reducer with no dispatching UI at this
  point (UI came later, if at all — see `00-current-frontend-architecture.md`).
- The reducer never talks to a backend; it only ever operates on in-memory
  `Project` objects.

## Integration boundary
Every later milestone (`04` transcript/selection, `05` inspector, `06`
presets, `07` undo controls, `08` upload) dispatches actions defined here and
reads `project`/`canUndo`/`canRedo` from `useProject()`. This is the seam a
future backend-sync feature (persisting to DynamoDB, per root `CLAUDE.md`)
would hook into.

## Decisions future developers must preserve
- All project mutations go through `project-reducer.ts` actions — do not
  mutate `project` directly from components.
- Every new mutating action must validate its candidate with
  `Project.safeParse` before committing, matching the existing `commit()`
  pattern.
- Keep the fixture (`packages/shared/fixtures/demo-project.json`) as the
  seed for `ProjectProvider` until a real project-loading flow exists.

## Verification
No automated tests exist in the repository for the reducer. "Not verified
from repository history" beyond what the commit's diff shows compiling
correctly (later commits build on it without modification to its core logic
until this audit).

## Known limitations / deferred work
No persistence — history and project state live only in React memory and are
lost on refresh. No backend read/write.

## Future integration
A future "save project" feature would read `state.present` here and send it
to `services/api`/DynamoDB; a future "load project" feature would dispatch
`SET_PROJECT` with server-fetched data instead of the fixture.
