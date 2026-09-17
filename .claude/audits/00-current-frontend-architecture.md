# Current Frontend Architecture

Not a milestone document — describes the state of `apps/web` after all 9
completed commits (`259ab2a` through `628a3e6`), as of this audit.

## Structure

Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (new-york style).
Path alias `@/*` → `apps/web/src/*`. Workspace dependency `@captions/shared`
→ `packages/shared`. Lint via `oxlint` (`npm run lint`); build via
`tsc -b && vite build`.

```
apps/web/src/
  App.tsx                 editor screen (mounted at /editor)
  AppRoot.tsx              route → LandingPage | (ProjectProvider + App)
  router.tsx                custom "/" | "/editor" router, no library
  main.tsx                   entrypoint: RouterProvider > AppRoot
  state/
    project-context.tsx      ProjectProvider, useProject()
    project-reducer.ts       validated reducer + undo/redo history
  components/
    agent/                    MicButton, AgentCommandBar, AgentActivityPanel
    inspector/                WordInspector, StyleOverrideFields
    landing/                  9 marketing section components + AnimatedSection
    layout/                   AppHeader, AppSidebar, UndoRedoControls
    player/                   PlayerPlaceholder, CaptionPreviewOverlay, VideoControlBar
    presets/                  PresetPicker
    transcript/                TranscriptPanel, TranscriptWordRow
    upload/                   UploadDropzone
    ui/                        shadcn primitives (button, card, input, label,
                                select, slider, switch, tabs)
  hooks/
    useSelection.ts            selected word id (click again to deselect)
    useUndoRedoShortcuts.ts    Ctrl/Cmd+Z / Shift+Z / Y
    useAgentActivity.ts        derives an honest local activity log
    useInView.ts                IntersectionObserver hook for landing animations
  lib/
    utils.ts (cn), format.ts (formatTimestamp)
  pages/
    LandingPage.tsx
```

## Ownership

`apps/web` is owned by P3 (root `CLAUDE.md`, `apps/web/README.md`). All files
above were created/modified inside this folder plus root `package-lock.json`
(workspace install artifact). No commit in this history touched
`packages/shared`, `remotion/`, or `services/api`.

## State model — IMPLEMENTED NOW

- `ProjectProvider` (`state/project-context.tsx`) seeds state from
  `packages/shared/fixtures/demo-project.json`, parsed with `Project.parse`
  (throws on invalid fixture — fail fast).
- `project-reducer.ts` holds `{ past, present, future }` (undo/redo stacks of
  `Project` snapshots). Every mutating action (`UPDATE_WORD`, `SET_PRESET`,
  `ADD_OVERLAY`, `SET_PROJECT`) runs the candidate through
  `Project.safeParse` before committing; a failed validation is dropped and
  logged via `console.error`, leaving state unchanged.
- `UNDO`/`REDO` move between snapshots without re-validating (they replay
  already-valid states).
- `ADD_OVERLAY` exists in the reducer but no UI currently dispatches it —
  reducer-complete, UI-incomplete.

## Editor UI flow — IMPLEMENTED NOW

- **Upload** (`UploadDropzone`): reads a local `File`, extracts real
  width/height/duration via an off-DOM `<video>` element, replaces the entire
  `Project` via `SET_PROJECT` with `words: []` and `overlays: []`. This is a
  **local-only replacement** — no upload to any backend, no transcription is
  triggered.
- **Transcript** (`TranscriptPanel` + `TranscriptWordRow`): lists
  `project.words`, client-side substring search, click to select/deselect
  (`useSelection`).
- **Inspector** (`WordInspector` + `StyleOverrideFields`): edits text,
  emphasis, emotion, stretch, and a per-word `Partial<Style>` override for the
  selected word, dispatching `UPDATE_WORD`.
- **Presets** (`PresetPicker`): renders every entry of the shared `PRESETS`
  map with a live-styled preview string, dispatches `SET_PRESET`.
- **Undo/redo** (`UndoRedoControls` in the header + `useUndoRedoShortcuts`):
  dispatch `UNDO`/`REDO`; buttons disable via `canUndo`/`canRedo` from
  context.
- **Player preview** (`PlayerPlaceholder` + `CaptionPreviewOverlay`): a
  styled `<div>` sized to `project.width`/`project.height`'s aspect ratio,
  overlaying the first 3 `project.words` styled with the active preset
  (base + emphasis). Explicitly commented as a stand-in — **not** the real
  Remotion Player.
- **Agent command bar** (`AgentCommandBar`, `MicButton`,
  `AgentActivityPanel`, `useAgentActivity`): mic toggle and text input are
  fully interactive locally, but submitting a command only logs
  `Command submitted: "..." (agent not connected yet)` — no request leaves
  the browser. The activity log only records real local state transitions
  (project loaded, preset changed, video uploaded) plus these local UI
  events; it never fabricates agent responses.
- **Header actions** (`AppHeader`): Rename (pencil icon), Share, Export are
  rendered but not wired to any handler — comment: *"visual only — no
  backend exists yet."*
- **Sidebar** (`AppSidebar`): static nav rail; only "Editor" is a real
  destination (comment: *"there's no router yet"* — predates the router
  added in the redesign commit; "Home"/"Projects"/"Templates" remain
  non-functional).

## Routing — IMPLEMENTED NOW

Hand-rolled `RouterProvider`/`useRoute` (`router.tsx`) using
`window.history.pushState` + `popstate`, supporting exactly two routes: `/`
(landing) and `/editor`. No routing library. `AppRoot.tsx` lazy-loads
`LandingPage` and `App`, and only mounts `ProjectProvider` for `/editor` —
the landing page never touches project state.

## Landing page — IMPLEMENTED NOW

`pages/LandingPage.tsx` composes 8 stateless marketing sections
(`components/landing/*`). `AnimatedSection` + `useInView` add scroll-in
animation via `IntersectionObserver`. No data fetching, no project state.

## What is frontend-only (no backend exists to call)

- Video upload (clears words/overlays locally; nothing is sent to P1's
  pipeline).
- Agent command bar / mic (nothing is sent to P4's agent).
- Export/Share/Rename buttons (no-ops).
- Player preview (not the real Remotion `@remotion/player`, owned by P2).

## PLANNED / FUTURE (not implemented)

- Real video upload → `services/api` pipeline (P1) → transcript populated via
  Transcribe + vision + audio analysis.
- Real `@remotion/player` integration for preview (P2).
- Real Remotion Lambda export behind the "Export" button (P2).
- Real Bedrock agent behind `AgentCommandBar` (P4) — tool calls validated
  against the schema, per root `CLAUDE.md`.
- `ADD_OVERLAY` UI (reducer action exists, no dispatching UI yet).
- Persistence beyond in-memory React state (no DynamoDB/localStorage wiring
  from `apps/web`).

## Verification tooling present in the repo

- `npm run build` (tsc -b + vite build), `npm run dev`, `npm run lint`
  (oxlint). No test framework (no Jest/Vitest/Playwright config) and no
  `.github/workflows/` CI exist in this repository as of this audit —
  verification has been manual (build/dev/lint) per commit messages, not
  automated tests.
