# Claude Project Context Index

## Purpose

`.claude/` contains engineering decisions, implementation audits, architectural
context and project constraints for the frontend (`apps/web`) work completed so
far. It supplements — never replaces — the root `CLAUDE.md`.

## Reading order

1. Root `CLAUDE.md` (rules, ownership, stack, branches).
2. `.claude/INDEX.md` (this file).
3. The relevant document(s) in `.claude/audits/` for the task at hand — see the
   map below.
4. Only then inspect the source files needed for the task.

**Read only the documents relevant to the current task to conserve context and
tokens.** Do not read every historical audit file for every task. For example,
a task touching the word inspector only needs `05-word-inspector.md` plus
`00-current-frontend-architecture.md` for context — not the full set.

## Documentation map

| ID | Document | Area | When to read |
|----|----------|------|---------------|
| 00 | `audits/00-current-frontend-architecture.md` | Whole `apps/web` | Any non-trivial frontend task; read first for orientation |
| 01 | `audits/01-frontend-foundation.md` | Vite/React/TS/Tailwind/shadcn scaffold | Build tooling, path aliases, workspace dependency issues |
| 02 | `audits/02-state-management.md` | `state/project-reducer.ts`, `state/project-context.tsx` | Any task that dispatches actions or reads/writes `Project` state |
| 03 | `audits/03-editor-shell.md` | Original editor layout (superseded by 09) | Historical context only — see 09 for current layout |
| 04 | `audits/04-transcript-selection.md` | `components/transcript/*`, `hooks/useSelection.ts` | Transcript search/selection work |
| 05 | `audits/05-word-inspector.md` | `components/inspector/*` | Per-word editing, style overrides |
| 06 | `audits/06-preset-picker.md` | `components/presets/PresetPicker.tsx` | Preset selection UI |
| 07 | `audits/07-undo-redo.md` | `components/layout/UndoRedoControls.tsx`, `hooks/useUndoRedoShortcuts.ts` | Undo/redo UI and shortcuts |
| 08 | `audits/08-video-upload.md` | `components/upload/UploadDropzone.tsx` | Upload flow, video metadata reading |
| 09 | `audits/09-editor-ui-redesign.md` | Editor shell v2, agent UI seam, layout components | Current editor layout, header/sidebar, agent command bar/mic/log |
| 10 | `audits/10-landing-page.md` | `pages/LandingPage.tsx`, `components/landing/*`, `router.tsx`, `AppRoot.tsx` | Landing page, routing between `/` and `/editor` |
| 11 | `audits/11-stt-prosody-pipeline.md` | `services/api/app/pipeline` + `scripts/stt_bakeoff/caption_eval` (P1) | Transcription, word timings, emphasis/stretch/tone, pipeline API design, proposed schema change. **Read the box at the top: ship `app/pipeline/`, the harness is for tuning.** |

Documents 09 and 10 both originate from a single commit (`628a3e6`) that
combined an editor redesign with a new landing page. They are split by file
area, not by commit, for readability.

Document 11 is the first audit **outside `apps/web`**. It covers the backend
transcription/prosody pipeline that produces the `Project` JSON the editor
consumes. Read it before any work on captions, word timings, emphasis/stretch
values, or the editor's future API integration.

## Current architecture summary

```
Browser
  → React frontend (apps/web, Vite + TS + Tailwind + shadcn/ui)
    → RouterProvider (custom, no library) — "/" vs "/editor"
      → LandingPage (stateless, no ProjectProvider)
      → ProjectProvider (mounts only for /editor)
        → project-reducer (validates every change against the shared Project schema)
        → Editor UI (player preview, transcript, inspector, presets, upload, undo/redo)
        → Agent command bar / mic button / activity log (UI-only, see below)
  → [NOT YET INTEGRATED] services/api (P1) — no HTTP calls exist in apps/web
       └─ STT + prosody pipeline: designed, built and measured on 4 real clips,
          NOT yet wired into the API or the editor. See audits/11.
  → [NOT YET INTEGRATED] services/api/app/agent (P4) — command bar has no backend wired
  → [NOT YET INTEGRATED] remotion/@remotion/player (P2) — preview is a styled div, not the real Player
```

**Currently implemented:** local, in-browser editing of a `Project` object
seeded from `packages/shared/fixtures/demo-project.json`, entirely client-side,
with schema-validated undo/redo.

**Future integration:** real video upload → backend pipeline → transcript,
real Remotion Player for preview, real Bedrock agent behind the command bar,
real export via Remotion Lambda.

**Not yet implemented:** anything server-side reachable from `apps/web`. See
`00-current-frontend-architecture.md` for the full IMPLEMENTED vs PLANNED
breakdown.

## Ownership boundaries

Per root `CLAUDE.md`:

| Folder | Owner |
|---|---|
| `packages/shared` (schema + fixture) | lead — changes need team agreement |
| `services/api` (pipeline, deploy) | P1 |
| `services/api/app/agent` (voice agent) | P4 |
| `remotion/` (composition, presets, export) | P2 |
| `apps/web` (editor UI) | P3 |

All work documented in `.claude/audits/` is inside `apps/web`, owned by P3, per
`apps/web/README.md`: *"React editor: upload, Remotion Player, transcript
panel, word inspector, preset picker, undo, mic button, agent step log."*

**Do not modify another team's owned area without coordination.** If a task
needs a schema change or a change outside `apps/web`, stop and tell the human
(per root `CLAUDE.md`).

## Critical invariants

Things Claude must preserve when working in `apps/web`:

- The shared `Project`/`Word`/`Style` schema (`packages/shared/src/project.ts`)
  is the only data contract. Every UI change reads/writes a `Project`; nothing
  invents its own shape.
- `packages/shared/src/schema.py` (Python) mirrors `project.ts` and changes
  together with it, by the lead, per root `CLAUDE.md`. `apps/web` never edits
  the schema itself.
- `state/project-reducer.ts` is the only place that mutates project state.
  Every action re-validates the candidate with `Project.safeParse` before
  committing; an invalid patch is dropped, not partially applied.
- `PRESETS` (`packages/shared/src/presets.ts`) is the single source of truth
  for preset visuals. Components read from it; they do not hardcode preset
  styling.
- Build and test against `packages/shared/fixtures/demo-project.json` first
  (per root `CLAUDE.md`).
- Caption elongation is carried by `Word.stretch` (a number), never by repeating
  letters in `Word.text`. The renderer draws the repeats. Writing "helloooo" into
  `text` corrupts real spellings — see `audits/11-stt-prosody-pipeline.md` §5.
- Branch ownership: `apps/web` work happens on `p3-editor`/`aman/*` branches;
  the lead merges to `main`.
- No fake backend/AI behavior: `useAgentActivity.ts` and `AgentCommandBar.tsx`
  are explicitly commented as logging "real, honest local activity" and
  stating the agent is "not connected yet" — this pattern must be preserved
  until P4's real agent is wired in. Do not simulate agent responses.
- No unnecessary dependencies: routing (`router.tsx`) and history are
  hand-rolled rather than using `react-router-dom`, because only two routes
  exist. Do not add a routing library without cause.
- Keep changes small and focused; verify (typecheck/build/lint) before
  committing, per root `CLAUDE.md`.

# Claude Context & Token Efficiency Rules

1. Read `CLAUDE.md` and `INDEX.md` first.
2. Determine which audit document is relevant before reading historical
   documents — use the documentation map above.
3. Do not read every `.md` file unless the task genuinely spans multiple
   areas.
4. Inspect the smallest relevant set of source files first.
5. Search before opening large files (`grep`/`Grep` over full-directory reads).
6. Prefer targeted search over dumping entire directories.
7. Use git history when historical reasoning is needed (`git log`, `git show`).
8. Do not repeatedly reread files whose relevant information is already
   established in the conversation.
9. Reuse existing architecture (reducer actions, `PRESETS`, shared UI
   primitives in `components/ui/`) instead of proposing duplicate
   abstractions.
10. Before modifying code, identify ownership boundaries (see above).
11. Never invent APIs, schemas, agent behavior, backend behavior, or
    undocumented decisions. If it's not in the schema or the code, it doesn't
    exist yet.
12. When requirements are unclear, inspect existing documentation/code before
    guessing.
13. Keep implementation changes scoped to the current task.
14. Run verification (typecheck/build/lint) after implementation.
15. Summarize important new architectural decisions in `.claude/audits/` after
    completing a milestone.
16. Do not use documentation as a substitute for reading the actual source
    code when implementation details matter — these audits describe intent
    and history, not a live API reference.

## Context hierarchy

When sources conflict, trust in this order:

1. Current source code (ground truth for what actually runs).
2. Root `CLAUDE.md` (current rules and ownership).
3. Current project architecture/contracts (`packages/shared/src/project.ts`,
   `packages/shared/src/presets.ts`).
4. `.claude/` historical audit documentation (this directory — explains why,
   may drift from current code).
5. Git history (`git log`/`git show` — for reasoning about intent, not current
   state).
6. General assumptions — lowest priority; avoid relying on these.

If `.claude/` documentation conflicts with current source code, inspect the
discrepancy — the documentation may be stale — rather than following it
blindly.
