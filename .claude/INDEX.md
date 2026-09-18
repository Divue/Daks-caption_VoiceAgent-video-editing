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
| 12 | `audits/12-api-persistence-layer.md` | `services/api` API + DynamoDB/S3 persistence, job runner, cost logging (P1) | Any API endpoint, project storage, pipeline jobs/status, cost rows, the P4 agent / P2 render seams. Measured e2e on 4 clips; **not deployed, not called by `apps/web`**. |
| 13 | `audits/13-caption-emotion-and-single.md` | `Word.single` + editable line/word emotion (P3, schema change) | Caption grouping, `deriveBlocks`, emotion editing, or anything that writes words to the API |
| 14 | `audits/14-kalakar-reference-audit.md` | Kalakar competitor teardown: measured template/font/effect values | Caption *visual* work — presets, fonts, glow/gradient/stroke, reveal behaviour, or picking what to build next |
| 17 | `audits/17-agent-capability-surface.md` | **Everything the editor can do, as agent tools** (P3 → P4) | Building the voice agent, or adding an editor feature the agent should reach. Lists what is addressable, what persists, what cannot be persisted at all, and the write contract. |
| — | `talk-and-edit/phase-01-agent-editing-mvp.md` | The agent MVP: turns become saved changes, the tool surface, preset overrides (P3+P4+P1) |
| — | `talk-and-edit/phase-02-live-voice-and-demo.md` | LiveKit running locally with no account; voice verified speech→transcript→patches; demo prompts in the UI |
| — | `talk-and-edit/phase-03-clarification-and-vision.md` | The agent asks when under-specified; analyze_frame works; mic bug; graded 16-prompt catalogue |
| 16 | `audits/16-editor-ui-critique.md` | Editor UI critique + the redesign it drove (P3) | Any editor chrome/layout/colour work. Read §1 first: the timeline was a picture of a video editor we are not building, and most of the ugliness was downstream of that. |
| 15 | `audits/15-caption-style-panel-and-editor-ui.md` | Caption style panel, the 4 measured presets, **schema v2**, editor UI/theme (P3) | Anything touching `Style`, `Preset`, the style resolver, the inspector panel, style writes, or the editor's look. **Read before any `Style`/`PresetId` change** — v2 renamed two fields and one preset id. |

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
       ├─ REST API + DynamoDB/S3 persistence + async pipeline jobs: built and run
       │  end-to-end on 4 real clips; not deployed. See audits/12 and services/api/README.md.
       └─ STT + prosody pipeline: wrapped by the API's job runner. See audits/11.
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
  styling. `Preset` itself is still NOT stored — only `presetId` is — so it can
  grow in TypeScript freely, with no `schema.py` mirror and no migration.
  `Style` and `PresetId` are the opposite and cost both. Put new visual
  properties in `Preset` unless they must be overridable per word (audit 15 §2).
  EXCEPTION, added with the agent MVP: five conditional layers now have a stored
  home in `Project.presetOverride` (`wordsPerLine`, `emphasis`, `emphasisScale`,
  `reveal`, `emotion`) because "fewer words per line" and "make the emphasised
  words bigger" were otherwise impossible to express at all. That object is
  enumerated explicitly and mirrored in `schema.py`; it is NOT `Partial<Preset>`,
  precisely so the rest of `Preset` keeps its freedom. `glowLayers`, `stretch`
  and `align` remain session-only and are badged as such in the UI.
- `lib/caption-style.ts` is PURE — no React, no DOM, no context. P2 takes it
  into the Remotion composition unchanged. `CaptionRenderer` is props-only for
  the same reason; it receives its `Preset` rather than reading `PRESETS`.
- A gradient fill sets `color: transparent`, so its glow MUST be a wrapper
  `filter: drop-shadow()` and never a `text-shadow` — a text-shadow draws from
  the glyph colour and renders nothing at all, silently (audit 15 §3).
- Style overrides merge KEY BY KEY, and a cleared key must be sent as an
  explicit `null`. `undefined` is dropped by `JSON.stringify` and the removal
  never reaches the server. Use `patchStyle`/`StyleChange`, never a whole-object
  `style` write (audit 15 §4).
- The bottom strip is a CAPTION RIBBON, not a timeline: one lane, no Video/Audio
  tracks, no track headers, no editing toolbar. `CLAUDE.md` puts cutting,
  layering and mixing out of scope, so any UI implying them is a picture of a
  product we are not building (audit 16 §1). Do not re-add them.
- Orange has a budget: the playhead, the primary action, and the current
  selection. Everything else uses the warm neutral scale (audit 16 §3.3).
- Emphasis promoted by the rhythm rule is drawn OUTLINED, never filled — filled
  means the pipeline found it, outlined means the renderer is filling a gap.
- Schema v2: `Style.uppercase` is gone (use `textCase`), and the preset id
  `kathmandu` is gone (it is `rangmanch`). `store/projects.py` migrates stored
  v1 rows on read; do not reintroduce either name.
- Build and test against `packages/shared/fixtures/demo-project.json` first
  (per root `CLAUDE.md`).
- Caption elongation is carried by `Word.stretch` (a number), never by repeating
  letters in `Word.text`. The renderer draws the repeats. Writing "helloooo" into
  `text` corrupts real spellings — see `audits/11-stt-prosody-pipeline.md` §5.
- Branch ownership: `apps/web` work happens on `p3-editor`/`aman/*` branches;
  the lead merges to `main`.
- No fake backend/AI behavior. The agent IS connected now (`/agent/command` is
  mounted and the editor applies its patches), so the "not connected yet" copy
  is gone — but the rule that replaced it is stricter, not looser: a turn shows
  what really happened. `unsupported`/`not_implemented` render as a refusal and
  never as a green tick; a turn that failed says how many patches landed; the
  voice log names the transport that actually started rather than implying
  LiveKit when the browser fallback is running. Do not simulate agent
  responses, and do not offer a tool for a capability nothing renders — that is
  why `add_overlay` is registered DISABLED.
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
