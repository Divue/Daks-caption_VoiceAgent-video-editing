# Editor UI Redesign

## Status
Completed

## Commit
`628a3e6` — "feat: redesign editor and add landing page" (no body recorded).
**This commit is shared with `10-landing-page.md`** — it combined an editor
redesign with a new landing page and router in one commit. This document
covers the editor-facing portion; `10-landing-page.md` covers the
landing/routing portion.

## Objective
Replace the milestone-03 editor shell and early panel versions with a more
complete, realistic editor layout, and add the (currently UI-only) voice
agent surface: mic button, command bar, and activity log.

## What was implemented
- `App.tsx` rewritten around a header + sidebar + 3-column main layout
  (player+upload / transcript / tabs for inspector·presets·agent log), plus
  a bottom `AgentCommandBar`. Replaces the milestone-03 `PanelPlaceholder`
  layout entirely (`PanelPlaceholder` deleted).
- `AppHeader`: back-to-projects, project id + rename (visual only),
  `UndoRedoControls`, Share/Export buttons (visual only — comment: *"no
  backend exists yet"*).
- `AppSidebar`: static nav rail (Home/Projects/Editor/Templates/Settings);
  only "Editor" is a live destination.
- `PlayerPlaceholder` rewritten to size itself to
  `project.width`/`project.height`'s real aspect ratio and render
  `CaptionPreviewOverlay` when captions are toggled on; comment explicitly
  states there is *"no player engine exists yet"* — this is a preview
  stand-in, not `@remotion/player`.
- `CaptionPreviewOverlay` (new): renders the first 3 `project.words` styled
  with the active preset's `base` (+ `emphasis` if `word.emphasis`) —
  comment: *"real project words with real preset styling — an honest live
  preview, not fabricated caption text."*
- `VideoControlBar` (new): shows duration/dimensions, caption toggle.
- `AgentCommandBar`, `MicButton`, `AgentActivityPanel` (new): text input +
  mic toggle + suggestion chips; submitting only appends a local log entry
  `Command submitted: "..." (agent not connected yet)` — no network request
  is made.
- `useAgentActivity` (new): derives log entries from real local state
  transitions (initial load, preset change, video change) plus events
  callers report about real local interactions. Comment: *"Logs real, honest
  local activity — never a fabricated agent/AI action."*
- `TranscriptPanel`/`TranscriptWordRow` gained the search input and
  scrollable list styling (see `04-transcript-selection.md` for the verified
  diff).
- `WordInspector`/`StyleOverrideFields` restyled/expanded; `format.ts`
  (`formatTimestamp`) added for the word's start/end time display.
- `components/ui/slider.tsx` added (used by expanded style override fields).
- `index.html`: page `<title>` set to "Expressive Captions"; Google Fonts
  preconnect + Inter font stylesheet added (Inter is one of the fonts
  referenced by `PRESETS`/`StyleOverrideFields`).
- `main.tsx` updated to mount `RouterProvider > AppRoot` instead of directly
  rendering `App` (see `10-landing-page.md`).

## Files created
`apps/web/src/components/agent/AgentActivityPanel.tsx`,
`apps/web/src/components/agent/AgentCommandBar.tsx`,
`apps/web/src/components/agent/MicButton.tsx`,
`apps/web/src/components/layout/AppHeader.tsx`,
`apps/web/src/components/layout/AppSidebar.tsx`,
`apps/web/src/components/player/CaptionPreviewOverlay.tsx`,
`apps/web/src/components/player/VideoControlBar.tsx`,
`apps/web/src/components/ui/slider.tsx`,
`apps/web/src/hooks/useAgentActivity.ts`,
`apps/web/src/lib/format.ts`.

## Files modified
`apps/web/index.html`, `apps/web/src/App.tsx`,
`apps/web/src/components/inspector/StyleOverrideFields.tsx`,
`apps/web/src/components/inspector/WordInspector.tsx`,
`apps/web/src/components/player/PlayerPlaceholder.tsx`,
`apps/web/src/components/presets/PresetPicker.tsx`,
`apps/web/src/components/transcript/TranscriptPanel.tsx`,
`apps/web/src/components/transcript/TranscriptWordRow.tsx`,
`apps/web/src/components/upload/UploadDropzone.tsx`, `apps/web/src/main.tsx`.

## Files deleted
`apps/web/src/components/layout/PanelPlaceholder.tsx`.

## Why we chose this approach
Root `CLAUDE.md` specifies a voice-agent editing surface (P4) and a
FastAPI/Bedrock agent backend that does not exist in `apps/web`'s scope. The
command bar/mic/log UI was built ahead of that integration but deliberately
never fabricates agent behavior — `useAgentActivity`'s and
`AgentCommandBar`'s code comments make this an explicit, evidenced design
rule (not just an audit inference), so P4 can wire a real backend into this
UI without first having to strip out fake responses.

## Alternatives considered
No alternative was formally documented.

## Important constraints
- The agent surface (mic, command bar, activity log) is entirely local UI
  state; no HTTP/WebSocket call exists anywhere in `apps/web` at this
  point.
- The player is not a video player — it has no play/pause/seek of actual
  video frames; `VideoControlBar` only displays metadata and toggles the
  caption overlay.
- Header actions (Rename/Share/Export) are visual only.

## Integration boundary
- `AgentCommandBar`'s `onSubmitCommand` is the seam where P4's real agent
  call belongs (currently just logs a string).
- `PlayerPlaceholder` is the seam where P2's `@remotion/player` integration
  belongs (currently a styled div sized to the project's aspect ratio).
- `AppHeader`'s Export button is the seam where P2's Remotion Lambda export
  trigger belongs.

## Decisions future developers must preserve
- Do not make `useAgentActivity`/`AgentCommandBar` simulate agent responses,
  progress, or success states before a real backend exists — this was an
  explicit, code-commented design choice, not an oversight.
- Keep `CaptionPreviewOverlay` rendering real `project.words`/`PRESETS` data
  — do not hardcode sample caption text.
- When integrating the real player (P2), preserve the aspect-ratio-driven
  sizing (`project.width`/`project.height`) already established here.

## Verification
"Not verified from repository history" — no test or explicit verification
notes recorded in this commit message. No automated tests exist in the
repository for this commit's UI.

## Known limitations / deferred work
- `MicStatus` type includes `processing`/`success`/`error` states that
  nothing in the app currently transitions into — reserved for P4's future
  integration (explicit code comment).
- No real video playback, no real export, no real agent call.

## Future integration
- P4: wire `AgentCommandBar.onSubmitCommand` and `MicButton` to the real
  Bedrock-backed agent; drive `MicStatus` through its full state machine.
- P2: replace `PlayerPlaceholder`'s inner box with `@remotion/player`; wire
  `AppHeader`'s Export button to Remotion Lambda.
- P1: wire `UploadDropzone` (see `08-video-upload.md`) to the real pipeline
  so `CaptionPreviewOverlay` shows real transcribed words instead of an
  empty list after upload.
