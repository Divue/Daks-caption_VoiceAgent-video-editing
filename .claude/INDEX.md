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
| — | `WORK-REPORT.md` (in `.claude/`, not `audits/`) | Team handover for the voice / video-player / **export** work (P4 + P3 + P2 + P1): what changed, how to run and test it, who reviews what, open problems, gotchas | **Start here** for anything touching voice commands, the video player, the command bar's feedback, or Export. Written in plain language; the four `audits/ai-agent/phase-16…19` rows below are its detailed evidence. |
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
| 17 | `audits/17-agent-capability-surface.md` | **Everything the editor can do, as agent tools** (P3 → P4) — **partly superseded, read its banner first** | Addressing rules (§2) and the style-key table (§3.3) still hold. The tool list, persistence limits, write contract and undo notes are out of date; current state is in `talk-and-edit/`. |
| — | `talk-and-edit/phase-01-agent-editing-mvp.md` | The agent MVP: turns become saved changes, the tool surface, preset overrides (P3+P4+P1) |
| — | `talk-and-edit/phase-02-live-voice-and-demo.md` | LiveKit running locally with no account; voice verified speech→transcript→patches; demo prompts in the UI |
| — | `talk-and-edit/phase-03-clarification-and-vision.md` | The agent asks when under-specified; analyze_frame works; mic bug; graded 16-prompt catalogue |
| — | `talk-and-edit/phase-04-ui-hardening.md` | Driving the real UI: wrong demo project, "bigger" shrinking the big word, the agent blind to its own preset |
| — | `talk-and-edit/phase-05-barge-in-and-targeting.md` | A pause mid-sentence lost the first half; the turn state machine; targeting words by how they look |
| — | `talk-and-edit/phase-06-voice-disconnect.md` | Stopping voice mid-connect left the mic live behind an "off" button; session token, Stop link, Esc |
| 16 | `audits/16-editor-ui-critique.md` | Editor UI critique + the redesign it drove (P3) | Any editor chrome/layout/colour work. Read §1 first: the timeline was a picture of a video editor we are not building, and most of the ugliness was downstream of that. |
| 15 | `audits/15-caption-style-panel-and-editor-ui.md` | Caption style panel, the 4 measured presets, **schema v2**, editor UI/theme (P3) | Anything touching `Style`, `Preset`, the style resolver, the inspector panel, style writes, or the editor's look. **Read before any `Style`/`PresetId` change** — v2 renamed two fields and one preset id. |
| — | `audits/ai-agent/phase-16-local-run-on-p3-branch.md` | Running `p3-agent-talk-edit` on a real machine (P4) | New machine or `.env` trouble: the recipe's traps (wrong `DEV_PREFIX`, LiveKit Cloud vs dev keys, missing `VOICE_STT_LANGUAGE`), and which AWS capabilities the shared identity lacks |
| — | `audits/ai-agent/phase-17-e2e-voice-and-editor.md` | Sarvam speech-to-text provider for the voice worker; voice + editor tested end to end in a real browser (P4) | Live voice not transcribing (AWS Transcribe streaming is denied), or `VOICE_STT_PROVIDER` / `VOICE_STT_LANGUAGE` |
| — | `audits/ai-agent/phase-18-voice-video-fixes.md` | Voice controls the video; the player no longer restarts/freezes; loading, layout, feedback; the "no sound" regression (P3 folder, flagged) | `lib/voice-intents.ts`, `VideoStage.tsx`, `playback-context.tsx`, video ducking, or the mis-heard word "pause" |
| — | `audits/ai-agent/phase-19-export.md` | Export: Remotion composition + local render server, API render route, editor Export button; the shared-renderer word-gap fix (P2 + P1 + P3) | Anything under `remotion/`, `services/api/app/routers/render.py`, `ExportButton.tsx`, or a change to `CaptionRenderer` (the export reuses it) |
| — | `talk-and-edit/phase-07-playback-vs-editing.md` | Playback commands were eating editing commands: a bare "stop" before a pause took the video AND half the sentence; one-word answers to the agent's questions were stolen; the Space guard missed Radix menus (P3) | Anything in `voice-intents.ts`, `useAgentCommand.ts`, or a new locally-handled voice command. Read it before adding one — the rule is that an opener carrying no object is provisional. |
| — | `talk-and-edit/phase-08-scope-colour-and-reset.md` | Three ways the editor did the opposite of what was asked: an unresolvable restriction was widened to all 94 words; a per-word colour was invisible under a gradient-emphasis preset; "go back to the original preset" could not be expressed (P3 + P4 folders, flagged) | Before changing `resolveWordStyle`'s precedence, the planner's asking rules, `find_words`, or anything that emits SET_PRESET_OVERRIDE. Read it if a write "succeeds" but nothing changes on screen. |
| — | `talk-and-edit/phase-09-all-captions-is-the-base-face.md` | "All captions" stamped every word and buried the preset's emphasis/tone colours; now it edits `presetOverride.base`. Also: agent override edits were never saved; per-word style writes went one request per word | Before touching the style panel's scope, `resolvePreset`, or anything that writes a style to every word. Read if a colour "disappears" or a change is lost on reload. |
| — | `layers/phase-01-media-layers.md` | Media layers: two tracks of images/clips over the video — schema, upload/serve, editor (move/scale/rotate/trim/split), export, 7 agent tools. Also: undo now SAVES (it never reached the server), and tools in one agent turn now see each other's changes | Anything touching `layers`, `lib/layers.ts`, `layer_tools.py`, the timeline lanes, undo/redo, or the planner's tool loop. Pair with `LAYERS.md`. |
| — | `audits/ai-agent/phase-20-video-aware-editing.md` | The agent can now SEE the video: stickers placed on a face, captions fitted to a hand, word ranges, and a size that ramps across words. Also a real bug — `analyze_frame(target="face")` returned the PERSON box (P1 + P4 folders, flagged) | Before touching `vision_tools.py`, `scene_tools.py`, the preset catalogue, or anything that places a `LayerItem` from a detection. Read it if you need to know what Rekognition can and cannot detect here, or why a fitted caption size is an estimate. |
| — | `word-editing/phase-01-text-and-timing.md` | **Hand editing of word TEXT and TIMING** in the inspector (P3) | Before touching `Word.text`/`startMs`/`endMs`, `lib/word-edit.ts`, or anything that assumes `Project.words` is in playback order. Holds the **word-id decision**, the **ripple-not-clamp** regression, (ids are opaque and permanent; the ARRAY is what must stay sorted — nothing in the repo parses an id for its index) and the phase-2 plan for add/delete/split/merge, which is NOT built. Also diagnoses (does not fix) the `prosody.py` repair pass being self-blocking on a RUN of degenerate ASR spans — the cause of 10 ms words. |
| — | `preset-segments/phase-01-preset-segments.md` | **A preset per STRETCH of the video** (`Project.presetSegments`) — schema, the one shared resolve both renderers use, the timeline's Preset lane, the API field and the agent's range argument (lead + P1 + P2 + P3 + P4) | Before touching `deriveBlocks`, `resolveEmphasis`, `resolvePreset`, `PresetPicker`, `PresetOverrideProvider` or `CaptionVideo.tsx`. Holds the **two decisions**: grouping is derived PER SEGMENT rather than as a fifth `deriveBlocks` break rule, and `emphasisEveryBlocks` counts per segment. Also the reason the preview draws with the BLOCK's preset and not the playhead's — they differ where a word overhangs a boundary, and the export follows the block. |
| — | `export/phase-01-containerised-render.md` | Export could not work on Linux and could not be deployed; the render server is now a container. Also: App Runner is closed to new customers (P1 + P2 folders, flagged) | Anything under `remotion/`, `routers/render.py`, or the compose `render` service. Pair with `DEPLOYING-EXPORT.md` at the repo root. |

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
- The bottom strip IS a timeline now, but a narrow one (repo-owner decision, 2026-09-19,
  superseding audit 16 §1): captions, two media-layer lanes, then the main video and audio.
  Layer items are real clips — select, move, trim by an edge, split, delete. The MAIN video is
  never cut, trimmed or re-timed, and the toolbar's transitions/effects/music/speed stay INERT
  and look it. Nothing may imply an operation that does not happen (see `LAYERS.md`).
- Every layer edit is ONE write of the whole `layers` list through `patchProjectFields` — one save,
  one Ctrl+Z. The arithmetic (placement vs source trim vs transform, split, trim) lives ONLY in
  `apps/web/src/lib/layers.ts`, mirrored in `services/api/app/agent/tools/layer_tools.py`; both
  suites test the same numbers. Change one, change both.
- Undo and redo SAVE: use `useWordPatch().undo/redo`, never `dispatch({ type: 'UNDO' })`, which
  changes only the screen — the undone edit came back on reload and in every export.
- Inside one agent turn, each tool sees what the earlier tools did (`planner.py`'s `working`).
  Tools that return a finished list (layers) depend on it; never pass `request.project` to a tool.
- NEVER write a style onto every word to change "all the captions". A per-word value beats the
  emphasis and tone layers, so it erases the preset's hierarchy and switching preset cannot bring
  it back. All-captions changes go to `presetOverride.base` (size: `baseFontSize`) — the inspector's
  "All captions" scope and the agent's `set_preset_override` both do this. Per-word styles are for
  words the user named (phase 9; the size version of this bug was fixed first, in phase 3/4).
- Word ids are OPAQUE and PERMANENT — never renumbered. Nothing in the repo derives an index
  from an id; what everything depends on is `Project.words` being in PLAYBACK ORDER
  (`deriveBlocks`, `findBlockIndexAt`'s BINARY SEARCH, the agent's `select_word_range` and
  `get_timeline` all read the array, not the digits). A hand timing edit therefore RIPPLES
  (`retimeWord` in `apps/web/src/lib/word-edit.ts`): the word goes where it is put and the
  words it runs into are pushed along, so the order can never break. Do NOT reintroduce a
  clamp into the neighbours' gap — that shipped first and froze the field solid on real
  transcripts, where neighbours touch. `shift_timing` (P4) still does neither.
- Orange has a budget: the playhead, the primary action, and the current
  selection. Everything else uses the warm neutral scale (audit 16 §3.3).
- Emphasis promoted by the rhythm rule is drawn OUTLINED, never filled — filled
  means the pipeline found it, outlined means the renderer is filling a gap.
- Schema v2: `Style.uppercase` is gone (use `textCase`), and the preset id
  `kathmandu` is gone (it is `rangmanch`). `store/projects.py` migrates stored
  v1 rows on read; do not reintroduce either name.
- There is no longer ONE active preset. `Project.presetSegments` gives a stretch of the video
  its own preset (and its own optional `presetOverride`, which REPLACES the project's rather
  than stacking on it). Everything that turns words into drawing decisions goes through
  `apps/web/src/lib/caption-timeline.ts` — `buildCaptionTimeline` — which BOTH the editor
  (`useCaptionBlocks`) and the export (`remotion/src/CaptionVideo.tsx`) call. Grouping and
  emphasis are derived PER SEGMENT there; `blocks.ts` and `emphasis.ts` needed no rule added
  and must not grow one. What DRAWS uses the preset of the block on screen
  (`presetOfBlock`); what EDITS uses the segment at the playhead. Those differ at the tail of
  a block whose last word overhangs a boundary, and following the playhead there would make
  the preview differ from the MP4. See `preset-segments/phase-01-preset-segments.md`.
- Preset segments are written as the WHOLE LIST, like `layers`, through `patchProjectFields`
  — one save, one Ctrl+Z. All the arithmetic lives in `apps/web/src/lib/preset-segments.ts`,
  mirrored in `services/api/app/agent/tools/preset_segments.py`; both suites test the same
  numbers. Never inline a clamp in a component: that is how the 1 ms-segment bug shipped.
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
