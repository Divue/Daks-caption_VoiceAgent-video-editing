# Editor UI (apps/web, `/editor`)

The editor uses the same design system as the landing page (`.claude/design.md`; see
`docs/landing-page.md`). This file covers only what is specific to the editor. Behaviour is unchanged:
the same `ProjectProvider`, reducer actions (`UPDATE_WORD`, `SET_PRESET`, `SET_PROJECT`, `UNDO`, `REDO`),
selection hook and undo/redo shortcuts.

## Theme
`apps/web/index.html` sets `<html class="dark theme-brand">`, so the design.md palette applies to the whole
app, including Radix portals (the Select menus in the inspector), which render into `<body>`. The
`.theme-brand` block in `src/index.css` also maps the shadcn `--sidebar-*` and `--destructive` tokens and sets
`color-scheme: dark` for native controls (number inputs, colour pickers, scrollbars).

## What each area looks like
| Area | File | Treatment |
| --- | --- | --- |
| Sidebar | `components/layout/AppSidebar.tsx` | Surface panel, waveform mark in `signal-dim`, coral active rail |
| Header | `components/layout/AppHeader.tsx` | Project id in mono, pill Share/Export (Export is the coral primary) |
| Player | `components/player/PlayerPlaceholder.tsx` | Grid-textured stage, dark frame at the project's aspect ratio (a size container) |
| Caption preview | `components/player/CaptionPreviewOverlay.tsx` | Renders through the shared `CaptionLine`, so every layer shows (see below) |
| Transport | `components/player/VideoControlBar.tsx` | Glass bar, mono time and size, coral CC toggle |
| Transcript | `components/transcript/*` | Mono cyan timestamps, coral selected rail, layer tags per word |
| Inspector | `components/inspector/*` | Mono section labels (`PanelLabel`), the word in display type with its layer tags |
| Presets | `components/presets/PresetPicker.tsx` | Each preset renders the same line through `CaptionLine`; the selected one has a coral border |
| Agent log | `components/agent/AgentActivityPanel.tsx` | Mono step log with success checks |
| Command bar | `components/agent/AgentCommandBar.tsx`, `MicButton.tsx` | Glass bar, round mic with the coral listening pulse, Hinglish suggestion chips |

## Shared pieces (`components/captions/`)
- `CaptionLine.tsx` renders a caption in layers, in this order:
  1. preset base
  2. emphasis
  3. emotion (angry = `EMOTION_STYLES.angry` plus a shake; excited = a pop plus stretched text)
  4. the word's own `style` override, applied last so an edit always wins

  Sizes are in `cqmin`, so it must sit inside a size container. It's used by the landing page and the editor.
- `caption-effects.ts` holds the four effects plus `LAYER_COLORS`: angry is coral, excited indigo, emphasis
  violet. The same hues appear on the landing hero.
- `LayerTags.tsx` shows a word's layers as small coloured tags.

`components/layout/PanelLabel.tsx` is the mono uppercase section label used across the panels.

## Loading state
While the editor's code loads, `AppRoot.tsx` shows `components/loading/EditorSkeleton.tsx` instead of a blank
page. It lays out the editor as shimmering `.skeleton` blocks: sidebar items, header pills, the 9:16 player
frame, transcript rows of varied widths, inspector fields and the command bar. It fades in, is marked
`role="status"` ("Loading editor"), and its shimmer is static under reduced motion.

## Behaviour changes worth knowing
- **The preview shows the group around the selected word.** It renders the caption group
  (`preset.wordsPerLine` words) that contains the word selected in the transcript, or the first group when
  nothing is selected. Before, it always showed the first three words.
- **Inspector edits now appear in the preview:** style overrides, emotion and emoji.
- **The suggestion chips are now Hinglish commands.** "Add a zoom effect" was dropped because the agent has
  no zoom tool.
- **On small screens the panels stack without overlapping** (`shrink-0`), and the suggestion chips sit in one
  horizontally scrollable row.

## Known limitations
- The player frame is still a stand-in: there's no video playback yet, and the transport buttons are visual only.
- Commands are logged locally. The agent isn't connected on this branch.
- Caption sizes in the preview follow true 1080p proportions, so on a small frame they look small, as they
  would in the export.
