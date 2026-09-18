# Frontend editor shell + captions workflow (`apps/web`, P3)

**Branch:** `p3-editor`, branched off **`p1-pipeline`** (lead answer 6)
**Written:** 2026-09-18. Every claim below is labelled **[M] measured** (run in this
session, against the real API on this machine) or **[A] assumed**.

---

## Context

`apps/web` today is a schema-validated, entirely client-side editor seeded from
`packages/shared/fixtures/demo-project.json`. **[M]** `grep -rn "VITE_\|import.meta.env"
apps/web/src` returns nothing: not one HTTP call exists in the app. Meanwhile P1's API
(audit 12) is built, measured on four real clips, and running — it just has no consumer.

This plan closes that gap for exactly one workflow — **upload → process → captions →
edit a word** — inside a full editor shell whose other surfaces (trim, split,
transitions, effects, stickers, music, export) are present with real labels and
correct icons and are **visibly inert**. `.claude/INDEX.md` forbids faking backend or
AI behaviour, so a button that does nothing must look like it does nothing.

The intended outcome: drop `Angry.mp4` into the real UI and, ~22 s later, watch its 46
words play across a timeline and over the video, click one, change it, and see preview,
timeline and a server refetch all agree.

---

## 0. Corrections to the brief (all [M])

The task brief carried four API/env facts that this session found to be wrong. They
change what the implementer writes, so they are corrected here rather than inherited.

| brief said | measured reality |
|---|---|
| "Base URL from `VITE_API_URL`" | **Still true and still broken.** `vite.config.ts` sets no `envDir` and no `.env` exists in `apps/web/`, so Vite — which reads env from its **own root** — never sees the repo-root `.env`. `import.meta.env.VITE_API_URL` is `undefined` today. Lead's answer 7 set the *value* correctly (8010 in both `.env` and `.env.example`, **[M]** re-read) but that does not make Vite read the file. **Task 0 must add `envDir: '../..'` to `vite.config.ts`.** |
| "the API may be on 8010 locally" | Resolved by the lead: **8010 is now the repo default.** **[M]** `.env` and `.env.example` both carry `API_PORT=8010` and `VITE_API_URL=http://localhost:8010`. No `.env.local` override needed. |
| "Errors are flat `{"error": ...}`" | True for application errors. **Not** true for FastAPI request validation: `POST /projects` with `contentType: "text/plain"` → `422 {"detail":[{...}]}`, and an unknown *route* → `{"detail":"Not Found"}`. The client must tolerate both shapes. |
| `expiresInSec` unstated | **900** (15 min), not an hour. A user who leaves the tab idle between dropping a file and the upload finishing can see the POST policy expire. |

Also **[M]**: `node_modules/` is not installed — `npm run dev` fails with `vite: not
found`. `npm install` at the repo root is step 0 for the implementer. Node is v24.21.0,
matching `.nvmrc` (`24`).

### 0.1 BLOCKER — `demo-project.json` does not validate against `Project`

**[M] `/editor` cannot mount on `p1-pipeline` today.** `ProjectProvider` calls
`Project.parse(demoProjectFixture)`, which **throws**:

- `Signals` in `packages/shared/src/project.ts` declares `extraMs: z.number()` — **required**.
- **All 16 words** in `packages/shared/fixtures/demo-project.json` have a `signals`
  object containing only `loudnessZ`, `pitchZ`, `durationRatio`. **No `extraMs`.**

`signals` is optional on `Word`, but these words *have* one and it is invalid, so the
parse fails rather than being skipped.

**Why nobody noticed** — the TS and Python schemas have **drifted**, in the one pair the
root `CLAUDE.md` says must change together:

| | `packages/shared/src/project.ts` | `services/api/app/schema.py` |
|---|---|---|
| `extraMs` | `z.number()` — required | `float = 0.0` — **defaulted** |

So `scripts/seed_fixture.py` (Python) accepts the fixture and silently fills
`extraMs = 0.0` — which is exactly why **[M]** the API's seeded
`GET /projects/demo-project` returns `"extraMs":0.0` while the file on disk has no such
key. The Python side papered over it; the TS side is the one that breaks.

**[M]** This is not a regression from the lead's fixture fix (`885278b` touched only the
two `text` values). `git log -S extraMs` shows `extraMs` entered the schema in `645a7c1`
("building stt api") and the fixture was never updated. It has been broken since then,
masked only because `node_modules` is absent so nobody has run `apps/web`.

**Two separate fixes, both `packages/shared`, both the lead's:**
1. Add `"extraMs"` to all 16 `signals` objects in `demo-project.json`. `0` is fine for
   the 14 unstretched words; the two stretched ones (`Hello` 2.6, `What` 2.2) want a
   value consistent with §8.6's `clamp(round(extraMs/120),1,5)` — roughly `312` and
   `240` to render 3 and 2 repeats.
2. Decide which side of the `extraMs` drift is right and make the other match. Defaulting
   in Python hides exactly this class of bug; requiring it in both is the stricter, safer
   choice, but it is a call for the lead (§10 item 9).

**[M] The other four fixtures already carry real `extraMs`** (260, 590, 522, 259 …), so
only `demo-project.json` is affected. They do still carry repeated letters — see §8.6.

Until fix 1 lands, `VITE_USE_FIXTURE=true` is unusable and the implementer must work
against the live API. **Task 0 verifies this before anything else.**

---

## 1. Reference catalogue — app.kalakar.io

**[M]** Catalogued live in Chrome, project "WhatsApp Video 2026-09-17 at 11.59.47"
(27 s, ~75 words, 24 caption blocks). Screenshots saved this session:
`/tmp/claude-chrome-screenshots-0lpNt4/screenshot-1789703486636-0.jpg` (templates
panel) and `…-1789703492710-1.jpg` (collapsed panel / timeline).

**Caveat:** the browser viewport would not go past **1075 CSS px** on this machine
(`resize_window` to 1440 and then 1920 both reported success; the screenshot stayed
1075×948 — a tiling WM, presumably). So this is a catalogue at ~1075px, not the 1440px
the brief asked for. The panels are visibly cramped at that width and some overlap.
**[A]** At a true 1440px the three columns get roughly 365 px more to share.

### Finding that outranks the rest

**`PRESETS` in `packages/shared` was derived from this product.** The Templates tab
contains a built-in template literally named **"Kathmandu"**, and the selected template
"Kalakar Motion" exposes `Primary #FFFFF0` and `Emphasis Color #A6190D` — byte-identical
to our `kathmandu` preset's `base.color` and `emphasis.color`. The Text panel shows
`Font Family: InstrumentSerifItalic` with `EMPHASIS Font Family: Anton`, which is our
`kathmandu` `base.fontFamily` / `emphasis.fontFamily`. This is not a coincidental
resemblance — it is the source. Where this plan and the reference disagree about
caption styling, the reference is probably right.

### 1.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ logo  WhatsApp Video 2026-09-17 at 11.59.47        [Upgrade ↗]  ◯ Shubh ⌄│
├────┬──────────────────────────┬───────────────────┬──────────────────────┤
│icon│  Captions list           │   Preview         │  Style panel         │
│rail│  (blocks, numbered)      │   (+ Replace,     │  Captions | Edit     │
│    │                          │    Safe zone,Res) │  Text|Templates|     │
│Cap-├──────────────────────────┤                   │  Transitions|AI Audio│
│tions│ timeline toolbar        │                   │                      │
│Cus-│ ┌──────┬────────────────┐│                   │  …sections…          │
│tom │ │ hdr  │ ruler          ││                   │                      │
│Fonts│ │Captions│ ▓▓▓▓ ▓▓ ▓▓▓ ││                   │                      │
│Lib-│ │Video 1 │ ███████████  ││  ▶ 🔊 00:00:00 /  │                      │
│rary│ │Audio 1 │ ∿∿∿∿∿∿∿∿∿∿  ││     00:27:01  ⛶   │            [Export]  │
└────┴─┴──────┴────────────────┴┴───────────────────┴──────────────────────┘
```

Both side panels **collapse** via a thin vertical handle with a chevron (`‹`/`›`)
centred on the divider; the state goes into the URL (`&stylePanel=collapsed`).

### 1.2 Icon rail (far left)

`Captions` (closed-caption glyph, active — green label + tinted tile), `Custom Fonts`
(`T`), `Library` (folder). Icon above label, vertical stack.

### 1.3 Captions list

Header: **Captions** title, a circular **search** button, and a **Caption Tools**
button (gear + chevron) that expands a settings panel *in place*.

Rows are **caption blocks, not words** — numbered `1…24` in a narrow gutter, each row
showing its words inline as a sentence, with a divider under each and a
**per-row layout/split icon** on the right. Emphasised words are drawn as **green
rounded pills** inline in the sentence. Emoji sit inside the word pill (`bekaar 😒`).

**[M] Blocks are irregular and single-word blocks are normal here**: row 1 is
`Hello bhai log kaise ho` (5 words), row 3 is `ye`, row 7 is `hai`, row 4 is `divya`.
This directly settles §8.4 — the reference ships single-word caption blocks without
apology.

**Caption Tools** panel:
- **DISPLAY SETTINGS** — three segmented controls: `Words` (`5 Words`), `Max Chars`,
  `Lines` (`1 Line`).
- **ACTIONS** — cards, each icon + title + one-line description + a toggle switch:
  `Remove Punctuation` ("Strip all punctuation for a cleaner, minimal look"),
  `Remove Emphasis` ("Remove all text emphasis for uniform appearance"),
  `Remove Gaps in Captions` ("Eliminate gaps between captions for seamless flow"),
  `Remove Emojis` ("Remove all emojis from captions").
- **TIMING** — `Caption Delay Control` ("Shift all captions earlier or later in time"),
  slider `-5s … 0 … +5s`, current value rendered as `No delay`.

### 1.4 Timeline

Toolbar above the tracks, left to right: `T` / layers **view toggle** (segmented) ·
`+` (add) · sliders (settings) · **scissors** (split) · `][` (trim) · **magnet**
(snapping — *green = on*) · **link** (green = on) · **zoom-out magnifier** + **zoom
slider**.

Ruler ticks every second, labelled `00:01.000` (mm:ss.mmm). Transport shows
`00:00:00 / 00:27:01` (mm:ss:ff).

Three tracks, each with a left **header** carrying a coloured type icon and a name:

| track | header | body |
|---|---|---|
| `Captions` | italic amber `I` | **one clip per word**, tan/khaki, each labelled with the word plus a small `Text` subtitle when wide enough; clips abut |
| `Video 1` | blue camera | one solid blue clip, label chip `Video 1` top-left |
| `Audio 1` | green waveform | one green clip, label chip `Audio 1`, with a **real rendered waveform** |

Playhead is a green vertical line with a handle at the ruler. A grip (`⠿`) sits between
track headers for reordering. Clicking a row in the captions list **zooms and scrolls
the timeline to that block** — list and timeline are bound both ways.

**[M] No per-track mute / lock / visibility buttons are visible** in the track headers
at this width. Our brief asks for them; they are our addition, not the reference's.

### 1.5 Preview

Top-left `⟳ Replace`. Top-right `Safe zone ⌄` and `● Res`. Bottom transport strip:
scrub bar, then `▶`, `🔊`, `00:00:00 / 00:27:01`, `⛶` fullscreen. No overlay handles or
selection boxes on the frame — captions are not dragged on the canvas; position is
numeric (X/Y %) in the style panel.

### 1.6 Style panel (right)

Two top-level tabs `Captions | Edit`, then four sub-tabs
`Text | Templates | Transitions | AI Audio`.

**Text** — collapsible sections with reset (`↺`) buttons on every field:
- `FONTS`: Font Family (stepper + reset), Font Face, Font Size (slider + numeric + `px`)
- `EMPHASIS`: Font Family, Font Face
- `FORMAT`: Styles `Tt | T | t | U`, Text Alignment (left/centre/right)
- `POSITION`: `X __ %`, `Y __ %` — **percentages, exactly our `Style.x`/`Style.y`**
- `COLOR`: `Solid | Gradient` segmented, then a swatch + hex field
- `EMPHASIS`: `Emphasize | Spotlight`, `Solid | Gradient`, Color, Size, Font, Font Face, Styles
- `SPACING`: Letter Spacing, Line Spacing
- `EFFECTS`: Drop Shadow, Glow, **3D Depth** (Color, %, Depth %, Angle °), 3D Depth —
  Layer 2, Text Stroke, Arc, Background

**Templates** — `Built-in Templates | My Presets`, a `Find a template` search, a
`Save preset` button, then cards. Each card: name, a badge (`New`, or a gold crown for
paid), a **live-rendered sample** of the style ("the quick brown fox jumps"), and
capability chips (`Bold`, `Shadow`). The selected card expands inline with a green
border + check and shows its `Colors → Primary`, `Emphasis → Emphasize|Spotlight`,
`Solid|Gradient`, `Color`, and a `Remove Style` button. Built-ins seen:
**Kalakar Motion, Kathmandu, Dhaka, Kalakar Glow (paid), Delhi (paid)**.

**AI Audio** — the pattern worth copying for an AI feature: an `✦ AI-Powered` pill, a
title (`Audio Enhancement`), a plain-language description, a caveat in italics
("Audio Enhancement Removes Background Music as well!"), one big labelled toggle
(`AI Audio Cleaning` / "AI enhancement is active"), a result card
(`● Enhanced Audio` + waveform), and a footer `Remaining Credits — 1 credits available`.

`Export` is a filled green button pinned bottom-right of the panel.

### 1.7 Not observed

Empty state, the import/upload flow, and the processing/progress UI — all sit before
the editor route and would have required creating a project on someone else's account.
**Not catalogued.** Our processing UI (§4.4) is therefore designed from our own stage
data, with no reference to compare against.

### 1.8 Adopt / adapt / skip

| item | call | note |
|---|---|---|
| Three tracks: captions / video / audio, headers with coloured type icons | **adopt** | matches the brief exactly |
| Caption **list** = blocks, numbered, words inline, emphasis as pills | **adopt** | maps 1:1 onto our `TranscriptPanel` + `CaptionBlock`; the pill is a better emphasis affordance than today's bold text |
| List ↔ timeline two-way binding (click a row → scroll/zoom the timeline) | **adopt** | cheap, and it is what makes "preview + timeline agree" legible |
| Single-word blocks left as-is | **adopt** | settles §8.4 — no merging heuristic |
| `Words` / `Max Chars` / `Lines` as *visible settings* | **skip** (lead answer 3) | `wordsPerLine` comes from the preset and is shown read-only. Editable grouping would need schema fields; out of MVP scope. The one grouping control we *do* expose is "Merge very short captions" (§3.1), held in local UI state |
| Timeline caption clips = **one per word** | **adapt** | at our fit-to-width zoom 94 words ≈ 4 px each. We draw the **block** as the clip with word subdivisions inside it as click targets — same information, legible at 15–27 s |
| Template card = name + badge + **live-rendered sample** + capability chips | **adopt** | our `PresetPicker` already renders a live sample; add the chips and the selected-state check |
| Style panel section order (Fonts → Emphasis → Format → Position → Color → Effects) with per-field reset `↺` | **adopt** | `StyleOverrideFields` gets the same order; `↺` = clear the per-word override, which we need anyway |
| Position as numeric X/Y **%** rather than canvas drag handles | **adopt** | our `Style.x`/`y` are already 0–100 % |
| Collapsible side panels with a chevron on the divider, state in the URL | **adopt** | cheap; at 1075px it is the difference between usable and not |
| Toolbar: split / trim / snapping / link / zoom | **adapt** | present with these icons, all **inert** except zoom (§5) |
| Snapping (magnet, on by default) | **skip** | §3.3 — our blocks abut, there is nothing to snap to |
| Audio waveform | **skip** | needs client-side decode; our audio track is one inert bar (§5) |
| Caption Tools ACTIONS (remove punctuation/emphasis/gaps/emojis) | **skip** | each is a bulk mutation of every word — out of scope, and `Remove Gaps` is meaningless on our data (gaps are already 0) |
| `Caption Delay Control` (±5 s global shift) | **skip** | tempting and cheap, but it is a bulk `startMs`/`endMs` rewrite with no endpoint for it |
| Transitions, AI Audio, Custom Fonts, Library, Upgrade/credits | **skip** | out of MVP scope; Transitions appears in our toolbar as an inert label only |
| `Save preset` / `My Presets` | **skip** | `PRESETS` is the lead's and is a closed enum of four |

---

## 2. Component tree

New files unless marked. Everything lives under `apps/web/src`.

```
AppRoot.tsx                    CHANGED — wrap App in ProjectSyncProvider (see §4)
App.tsx                        REWRITTEN — shell: header / sidebar / stage / timeline / rail
│
├── layout/AppHeader.tsx        CHANGED — Export wired to the 501 seam; Share/Rename stay inert
├── layout/AppSidebar.tsx       unchanged
│
├── shell/EditorStage.tsx       NEW — owns nothing; lays out preview + tool rail
│   ├── preview/VideoStage.tsx      NEW — the ONE <video>; owns the playback clock (§3)
│   │   ├── preview/CaptionRenderer.tsx  NEW — props-only. P2's swap point (§7)
│   │   └── preview/TransportBar.tsx     NEW — play/pause/seek/volume/CC/fullscreen (real)
│   └── (player/PlayerPlaceholder.tsx, CaptionPreviewOverlay.tsx, VideoControlBar.tsx DELETED)
│
├── timeline/Timeline.tsx       NEW — owns zoom/scroll; renders ruler + 3 tracks + playhead
│   ├── timeline/TimeRuler.tsx      NEW
│   ├── timeline/TrackHeader.tsx    NEW — per-track mute/lock/visibility (inert, §5)
│   ├── timeline/MediaTrack.tsx     NEW — one clip, real duration/dimensions (inert)
│   ├── timeline/AudioTrack.tsx     NEW — one clip, flat bar, no waveform (inert)
│   ├── timeline/CaptionTrack.tsx   NEW — derived blocks; INTERACTIVE
│   ├── timeline/CaptionBlockView.tsx NEW — one block; words inside it are click targets
│   └── timeline/Playhead.tsx       NEW
│
├── toolbar/EditorToolbar.tsx   NEW — Trim/Split/Transitions/Effects/Stickers/Music (inert, §5)
│
├── pipeline/ProcessingPanel.tsx NEW — the 7-stage map, real detail strings (§4)
├── pipeline/StageRow.tsx        NEW
│
├── upload/UploadDropzone.tsx   REWRITTEN — POST /projects → S3 → POST /process
│
├── inspector/WordInspector.tsx CHANGED — add a "why" block from word.signals; PATCH-backed
├── inspector/StyleOverrideFields.tsx  CHANGED — reorder to the reference's section order,
│                                       add a per-field reset (§1.6/§1.8)
├── transcript/CaptionList.tsx  NEW — numbered BLOCK rows, words inline, emphasis as
│                                     green pills (§1.3). Replaces the flat word list.
├── transcript/TranscriptPanel.tsx     CHANGED — hosts CaptionList + search; follows the playhead
├── transcript/TranscriptWordRow.tsx   CHANGED — becomes the word pill inside a block row
├── shell/CollapsiblePanel.tsx  NEW — chevron handle on the divider, state in the URL (§1.1)
├── presets/PresetPicker.tsx           CHANGED — dispatch + PATCH /projects (presetId)
├── agent/*                            unchanged — still honest-inert
│
├── state/project-reducer.ts    CHANGED — one new action, REPLACE_PRESENT (§4)
├── state/project-context.tsx   CHANGED — no fixture seed; starts empty (§4)
├── state/sync-context.tsx      NEW — server identity: projectId, version, status, errors
│
├── hooks/usePlayback.ts        NEW — the clock (§3)
├── hooks/usePipelineStatus.ts  NEW — the 2 s poll (§4)
├── hooks/useCaptionBlocks.ts   NEW — memoised words → blocks (§3)
├── hooks/useSelection.ts       CHANGED — see §3 (word + block selection)
│
└── lib/
    ├── api.ts                  NEW — typed fetch client, both error shapes
    │   (blocks.ts is NOT here — it lives in packages/shared, see §3.1)
    ├── caption-style.ts        NEW — pure: (word, preset, settings) → resolved CSS
    └── format.ts               CHANGED — add formatTimecode(ms) → "mm:ss.mmm"
```

### What each new piece owns

| component | owns |
|---|---|
| `VideoStage` | the `<video>` element and the **only** playback clock. Exposes `{timeMs, isPlaying, seek, toggle}` via `PlaybackContext`. |
| `CaptionRenderer` | nothing. Pure function of props. No context, no hooks beyond `useMemo`. |
| `Timeline` | `pxPerMs` (zoom), `scrollLeft`, and nothing else. Reads time from `PlaybackContext`. |
| `CaptionTrack` | no state; maps `useCaptionBlocks()` output to positioned divs. |
| `ProjectSyncProvider` | `projectId`, `version`, `lifecycle`, `lastError`. **Never** the `Project` itself. |
| `ProjectProvider` (existing) | the `Project` and its undo history. Unchanged responsibility. |

---

## 3. Timeline data model

### 3.1 Flat `words` → caption blocks

**[M]** The obvious rule — split on time gaps — does **not** work on this pipeline's
output. Measured non-zero gaps between consecutive words:

| clip | words | gaps > 0 | largest gaps (ms) |
|---|---|---|---|
| Angry | 46 | **7 of 45** | 180, 279, 530, 1979 |
| Real_reel | 94 | **8 of 93** | 160, 201, 450 |
| Excited | 15 | 6 of 14 | 1109, 1351, 2101 |
| Normal | 51 | 16 of 50 | 864, 870, 1540 |

A 320 ms gap threshold alone yields **3 blocks for Angry's 46 words** and **2 for
Real_reel's 94**. Unusable. The rule must be compound:

**The lead approved this rule (answer 3) and moved the module into the shared package
(answer 1)** so P2's Remotion composition imports the identical function rather than a
copy. Adding a module is not a schema change, so this needs no migration.

```ts
// packages/shared/src/blocks.ts  — PROPOSED. The lead lands it; apps/web only imports it.
// Pure, no React, no DOM. Exported from packages/shared/src/index.ts alongside project/presets.
export const BLOCK_GAP_MS = 320
export const MIN_BLOCK_MS = 250

export interface CaptionBlock {
  id: string          // `b:${words[0].id}` — stable across re-derives, NOT an index
  words: Word[]
  startMs: number     // words[0].startMs
  endMs: number       // words.at(-1).endMs
  emotion: Emotion    // words[0].emotion
}

export function deriveBlocks(
  words: Word[],
  wordsPerLine: number,
  opts?: { mergeShort?: boolean },   // default true
): CaptionBlock[]
// PASS 1 — start a new block when ANY of:
//   1. words[i].startMs - prev.endMs >= BLOCK_GAP_MS      (a real pause)
//   2. current block already has `wordsPerLine` words      (PRESETS[id].wordsPerLine)
//   3. words[i].emotion !== block.emotion                  (tone runs are contiguous)
// PASS 2 (mergeShort) — while any block is shorter than MIN_BLOCK_MS, merge it into
//   whichever neighbour it abuts more closely; first and last merge inward. Repeat to
//   a fixed point. A merged block keeps the FIRST block's emotion.
```

`wordsPerLine` is **already in the shared contract** (`packages/shared/src/presets.ts`:
2 for `mrbeast`, 3 for `kathmandu`/`hinglish-bold`, 4 for `minimal`). Do not invent a
new constant.

**Per lead answer 3, do NOT add `Words` / `MaxChars` / `Lines` settings fields** — the
reference exposes all three (§1.3) but they would need a schema change and are out of
MVP scope. `wordsPerLine` is read-only, sourced from the preset. (**[M]** our longest
derived block is 30 characters, inside any sane `maxChars` cap anyway.)

**Per lead answer 2, `mergeShort` defaults to ON**, with a user switch
**"Merge very short captions"** to see raw pipeline output. That switch is **local UI
state** — `useState` in the captions panel, threaded down as a prop. It is a view
preference, not project data, so it must not go in `Project.settings` (schema change)
and must not go through `project-reducer`.

**[M] Measured over the four real projects, `BLOCK_GAP_MS=320`, `MIN_BLOCK_MS=250`:**

| clip | preset | raw blocks (sub-250 ms) | merged blocks (sub-250 ms) |
|---|---|---|---|
| Angry | mrbeast | 23 (3) | **20 (0)** |
| Angry | kathmandu | 16 (0) | 16 (0) |
| Real_reel | mrbeast | 50 (8) | **42 (0)** |
| Real_reel | kathmandu | 35 (1) | **34 (0)** |
| Excited | kathmandu | 8 (0) | 8 (0) |
| Normal | mrbeast | 33 (4) | **29 (0)** |
| Normal | kathmandu | 25 (3) | **22 (0)** |
| Normal | minimal | 23 (3) | **20 (0)** |

Merging removes **every** sub-250 ms block on all four clips at every preset, costing
1–8 blocks. `mrbeast` (2 words/line) benefits most, which is expected — the tighter the
line, the more short blocks rule 2 creates.

**[M] Consequence the renderer must handle: merging can exceed `wordsPerLine` by one.**
Measured maxima are **4 words on `kathmandu`** (nominal 3) and **5 on `minimal`**
(nominal 4). `CaptionRenderer` and `CaptionBlockView` must not assume
`block.words.length <= wordsPerLine`; lay out with wrapping, not a fixed slot count.

Angry reads as: `What the fuck | bhai what the | fuck is happening | bhai | I am fed |
up of this`. Real_reel: `Ye jaante hue | ki har | saal | meri birthday kaise`.

**[M]** Rule 3 (emotion) was measured against dropping it: it costs 0–5 extra blocks
per clip. Keep it — the lead confirms tone now arrives in contiguous runs, and it makes
tone a visible block property.

**[M] One caveat on "tone arrives in runs":** true for Real_reel (`5 neutral, 1 excited,
20 neutral, 12 excited, 10 angry, …`) and Angry (46/46 angry), but **`Normal` has seven
isolated single-word `excited` runs**. Those are exactly what rule 2's merge pass now
absorbs — which is the main reason the merge default is right.

A merged block spanning two emotions keeps the first block's emotion, so a one-word
`excited` blip inside a neutral run disappears from the tone display. That is the
intended trade and the reason the toggle exists.

`useCaptionBlocks(mergeShort)` =
`useMemo(() => deriveBlocks(project.words, PRESETS[project.presetId].wordsPerLine, { mergeShort }), [project.words, project.presetId, mergeShort])`
— imported from `@captions/shared`, not from `apps/web/lib`.

**Sequencing note:** `packages/shared/src/blocks.ts` is the lead's to land. Until it
does, `apps/web` cannot import it and Task 3 is blocked. If it has not landed when the
implementer reaches Task 3, **ask the lead rather than writing a local copy** — a local
copy that later diverges from P2's is precisely the failure answer 1 exists to prevent.

### 3.2 The playback clock

**[M]** Verified across all four projects: words are **sorted by `startMs`**, **no gap is
negative**, and **no word is zero-width** (`endMs > startMs` everywhere). So lookup is a
binary search on `startMs`, not a scan, and `deriveBlocks` needs no defensive sort.
(Audit 11 §5.1 records that zero-width words *did* exist in the harness before the
island-assignment fix — worth an assertion in dev, not a runtime sort.)

`hooks/usePlayback.ts`, mounted once in `VideoStage`:

- The `<video>` element is the clock. **Do not** use `timeupdate` — it fires ~4×/s,
  far too coarse for word-level highlighting. Use `requestAnimationFrame` reading
  `video.currentTime`, started on `play` and cancelled on `pause`/`ended`.
- Also update on `seeking`/`seeked`, so scrubbing while paused stays in sync **[A]**.
- State shape: `{ timeMs, isPlaying, duration, seek(ms), toggle(), setRate(r) }` in a
  `PlaybackContext`, separate from `ProjectContext`.

**Hard rule: the clock never enters `project-reducer`.** Every reducer action runs
`Project.safeParse` over the whole project (46–94 words). At 60 fps that is 60 full
Zod validations per second. Time is ephemeral UI state and stays out.

To keep re-renders cheap, `timeMs` lives in a `useRef` + a `useSyncExternalStore`
subscription, so only components that actually read it re-render **[A]** — start with
plain `useState` and only reach for the store if the profiler shows a problem.

### 3.3 Zoom, scroll, playhead

- `Timeline` holds `pxPerMs` (`useState`) and the scroll container's `scrollLeft`.
- Zoom levels: fit-to-width, then discrete steps ×1.5 up to ~0.5 px/ms **[A]**.
  At fit-to-width, Angry (15.9 s) at 1200 px ≈ 0.075 px/ms → a 840 ms block ≈ 63 px:
  enough for 2–3 characters, so blocks show truncated text and reveal full text on
  hover/zoom **[M, from the block durations above]**.
- Playhead is `position: absolute; left: timeMs * pxPerMs` inside the scroll content,
  and is driven by CSS `transform: translateX` so it does not trigger layout **[A]**.
- Clicking the ruler or any track seeks (`playback.seek`). Dragging the playhead
  scrubs. **No snapping in v1** — blocks abut (gaps are 0), so snapping has almost
  nothing to snap to. Deliberate omission, not an oversight.
- Auto-scroll: when playing and the playhead leaves the middle 60% of the viewport,
  scroll to re-centre. Suspended while the user is manually scrolling **[A]**.

### 3.4 Selection

`useSelection` is currently `{selectedWordId, select}` with click-again-to-deselect.
Extend, keeping the existing signature working:

```ts
{ selectedWordId, selectedBlockId, selectWord(id), selectBlock(id), clear() }
```

- Selecting a word implies its block (derived, not stored).
- The transcript, the caption track and the preview all read the same
  `selectedWordId` — one source, three views. This is the property that makes
  "preview + timeline agree" testable.
- Selection lives in `App.tsx` as today and is passed down; it does **not** go into
  `ProjectContext` (it is not project data).

---

## 4. State and API integration

### 4.1 Two contexts, one mutator

```
ProjectSyncProvider        ← server identity: projectId, version, lifecycle, lastError,
  │                          localPreviewUrl. Plain state ONLY — it fetches nothing.
  └─ ProjectProvider       ← the Project + undo history (project-reducer, unchanged rule)
       └─ <ProjectLoader/> ← calls useSync() AND useProject(). ALL fetching lives here:
            │                usePipelineStatus, the GET-on-done, the PATCH queue.
            └─ App
```

**[Audit A2]** The provider order matters and is easy to get backwards. `usePipelineStatus`
has to `dispatch({type:'SET_PROJECT'})` when the job finishes, so it cannot live inside
`ProjectSyncProvider` — that provider is *above* `ProjectProvider` and has no dispatch.
Keep both providers as dumb state holders and put every hook that both reads sync state
and dispatches into `ProjectLoader`, a headless component mounted inside both. If you
find yourself wanting to call `useProject()` from `ProjectSyncProvider`, the layering is
wrong.

`version` is **not** in the `Project` schema and must not be smuggled into it
(`packages/shared` is the lead's). It lives in `ProjectSyncProvider`, updated from
the `X-Project-Version` response header **[M: present on `GET /projects/{id}`, value
`1` then `3` after two PATCHes]** and from PATCH response bodies.

`lifecycle` is an explicit union — every one of these is a real rendered state:

```ts
type Lifecycle =
  | { k: 'idle' }                                  // no project: full-bleed dropzone
  | { k: 'creating' }                              // POST /projects in flight
  | { k: 'uploading'; pct: number }                // XHR upload progress to S3 (real)
  | { k: 'queued' }                                // POST /process accepted, 202
  | { k: 'processing'; status: StatusResponse }    // polling; the stage map
  | { k: 'ready' }                                 // project loaded
  | { k: 'failed'; stage?: string; message: string }// server said failed
  | { k: 'unreachable'; since: number }            // WE cannot reach the API
```

`failed` and `unreachable` are deliberately distinct. **[M]** When P1 killed the
container mid-job, the server took **116 s** to report `failed` ("worker lost"). A
client that conflates "no answer" with "job failed" would either lie for 116 s or give
up too early.

### 4.2 `lib/api.ts`

One module, no library. Every function takes an `AbortSignal`.

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8010'
```

**Superseded by lead answer 7.** The repo now standardises on 8010 in the root `.env`
and `.env.example` **[M]**, so there is no `.env.local` and no per-machine override —
**Task 0 adds `envDir: '../..'` to `apps/web/vite.config.ts`** instead.

One consequence worth stating, because it is a real cost of that choice: `envDir`
points Vite at a file that also holds `AWS_SECRET_ACCESS_KEY` and `SARVAM_API_KEY`.
Vite only *exposes* `VITE_`-prefixed vars to client code, so nothing secret is bundled
— but the safety now rests on that prefix rule rather than on the secrets being in a
different file. Do not add a `VITE_`-prefixed secret to `.env`, ever.

The `?? 'http://localhost:8010'` fallback stays as a belt-and-braces default so a
missed `envDir` degrades to "works on the dev machine" rather than requests to
`undefined/projects`. Verification item 2 is what actually catches it.

Error normalisation — **[M]** three shapes observed, one type out:

```ts
// { error: "not_ready", ... }               → application error  (flat)
// { detail: [ {...} ] }                     → FastAPI 422 validation
// { detail: "Not Found" }                   → unknown route
type ApiError = { code: string; status: number; detail?: string; body: unknown }
// non-JSON body or a thrown TypeError → code: 'network'
```

Measured endpoint contracts, all confirmed first-hand this session against the live
API (project `f900dceba8e9`, created and processed during planning):

| call | measured result |
|---|---|
| `POST /projects {filename, contentType:"video/mp4", presetId?}` | `201 {projectId, upload:{url, fields}, expiresInSec:900}`. `presetId` **is honoured** — asked for `mrbeast`, got it back. |
| `POST upload.url` (multipart) | `204`, empty body. `fields` **then** `file`, in that order. Policy caps at 209 715 200 B (200 MB). S3 preflight from `Origin: http://localhost:5173` → `200`, `Allow-Methods: POST, PUT, GET, HEAD`. |
| `POST /projects/{id}/process` | `202` with the full job object incl. `runId`. Before upload: `400 {"error":"upload_missing", detail}`. After a manual edit: `409 {"error":"has_manual_edits", detail}`. |
| `GET /projects/{id}/status` | **`200` always**, even before `process` (`state:"not_started"`, all stages `pending`). Never 404s for a real project. |
| `GET /projects/{id}` | `200` + `X-Project-Version`, `X-Schema-Version`. Before the first run: `409 {"error":"not_ready","status":"awaiting_upload",detail}`. Unknown id: `404 {"error":"not_found","projectId"}`. |
| `PATCH /projects/{id}/words/{wordId}` | `200 {word, version}` — **the one word, not the project**. Merge it; do not replace. Stale `version` → `409 {"error":"stale_version","currentVersion":2}`. Bad id → `404 {"error":"word_not_found","wordId"}`. `stretch: 0` → `422 {"error":"invalid_project","detail":[…]}`. |
| `PATCH /projects/{id}` | `200 {project, version}` — the **whole** project, with a **freshly signed** `videoUrl`. `settings` **merges per key** — sending `{"settings":{"emojis":true}}` alone left `emotionLayer` untouched **[M]**. This is what the CC / emoji / emotion-layer toggles use. |
| `videoUrl` in a `<video>` | **[M]** `Accept-Ranges: bytes`, a range request returns `206 Partial Content` with `Content-Type: video/mp4`. Scrubbing and seeking work directly against the presigned URL — no proxy, no `crossorigin` attribute needed. |
| `POST /projects/{id}/agent` | `501 {"error":"not_implemented","owner":"P4","responseContract":{…}}` |
| `POST /projects/{id}/render` | `501 {"error":"not_implemented","owner":"P2","responseContract":{status:202,body:{renderId,state:"queued"}}}` |
| `GET /projects/{id}/cost` | `200 {totalUsd, byService, byStage, unverifiedRates, usdPerMinute, events[]}`. Angry run: **$0.0198**. |

API CORS preflight for `PATCH` from `localhost:5173` → `200`,
`Allow-Methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`, and
`Access-Control-Expose-Headers: X-Project-Version, X-Schema-Version` **[M]** — so the
version header really is readable from the browser.

### 4.3 The upload flow

`fetch` gives no upload progress, so the S3 POST uses **`XMLHttpRequest`** with
`upload.onprogress` → `lifecycle.uploading.pct`. That percentage is a real byte count,
not a simulation. `Angry.mp4` is 3.9 MB **[M]**, so on a fast link it will flash past;
it matters for a 200 MB file.

```
file dropped
  → readVideoMetadata(objectURL)         // REUSE: already in UploadDropzone.tsx today
  → reject non-video / > 200 MB locally, with the real reason
  → POST /projects                        → projectId + presigned fields
  → XHR POST to S3 (fields..., file)      → 204
  → POST /projects/{id}/process           → 202
  → usePipelineStatus starts
```

The local `objectURL` is used for the preview **while processing**, then replaced by
the server's presigned `videoUrl` once `GET /projects/{id}` succeeds — so the video is
watchable during the ~22 s wait instead of showing a spinner over a black box.
Revoke the object URL on swap (the existing dropzone already revokes correctly).

### 4.4 Polling

`usePipelineStatus(projectId, enabled)`:

- **`setTimeout` chain, not `setInterval`** — a slow response must not let requests
  pile up. 2000 ms between the end of one response and the start of the next.
- Stops on `done` / `failed`. On `done`, fires `GET /projects/{id}` once, then
  `dispatch({type:'SET_PROJECT'})` and `lifecycle → ready`.
- Network failure: count consecutive failures. ≥ 3 (≈6 s) → `unreachable` with a
  Retry button. Polling continues in the background at 5 s so it self-heals.
- `AbortController` on unmount; ignore a response whose `runId` differs from the one
  `POST /process` returned (guards a re-process racing an old poll) **[A]**.

**[M] Real stage timeline for `Angry.mp4`, captured this session** — this is what the
UI renders, and why it is a stage map and not a bar:

```
 9.1s  running  audio ✓3470ms   transcribe ▸running  sarvam ✓1204ms  align · prosody · tag · build ·
17.9s  running  audio ✓3470ms   transcribe ✓13546ms  sarvam ✓1204ms  align ✓214  prosody ✓345  tag ▸running
21.7s  done     … tag ✓93ms  build ✓106ms
```

Total **21.7 s**; `transcribe` alone is 13.5 s and `sarvam` finishes at 1.2 s — a
single progress bar would sit at "2 of 7" for two thirds of the run and be a lie.

**[M]** Stages carry genuinely user-facing `detail` strings. Render them verbatim;
they are the honest substitute for fake progress:

- `audio` → `"15.9s 478x850"`
- `transcribe` → `"46 words"`
- `align` → `"46/46 Sarvam words matched a Transcribe timing"`
- `tag` → `"13.0% emphasis, tones {'neutral': 0, 'hype': 0, 'anger': 46}"`
- job-level `detail` → `"46 words in 21.7s"`

**Do not parse `tag`'s detail** — it is a Python dict repr, not JSON. Display as text.
Stage states seen or documented: `pending | running | done | skipped | failed`.
`sarvam` reports `skipped` when the key is absent — render it as a neutral "skipped",
never as an error.

### 4.5 Editing a word — optimistic, with a real conflict path

```
user changes text in the inspector
  → debounce 400ms (text) / immediate (switches, selects)
  → dispatch UPDATE_WORD                       ← optimistic, reducer validates
  → PATCH /words/{id} { ...patch, version }
      200 → merge response .word, set version               (usually a no-op visually)
      409 stale_version → GET /projects/{id}
                        → dispatch REPLACE_PRESENT(server)  ← see below
                        → toast: "Reloaded — this project changed elsewhere."
      422 invalid_project → dispatch UPDATE_WORD(previous values); show detail[0].msg
      404 word_not_found  → refetch; the word list is stale
      network             → keep the optimistic value, mark the word "unsaved", retry once
```

**One reducer change.** `SET_PROJECT` clears `past` and `future` — using it for a
409 refetch would silently destroy the user's undo history. Add a sixth action that
follows the existing `commit()` pattern exactly:

```ts
case 'REPLACE_PRESENT':          // server state wins, history survives
  return commit(state, action.project)
```

Six lines, same `Project.safeParse` gate, same file, no new mutation site. Undo after
a conflict then walks back to the pre-conflict local state, which is the behaviour a
user expects. `project-reducer.ts` remains the only place project state mutates.

### 4.6 Bootstrapping — how the editor starts with no project

**Do NOT make `project` nullable.** `ProjectProvider` currently calls
`Project.parse(fixture)` at mount, and `useProject()` returns a non-null `Project`.

**[Audit A1]** The tempting change — `project: Project | null` — is a trap. **[M]**
Eight call sites read `project.*` directly (`App.tsx`, `PresetPicker`,
`UploadDropzone`, `TranscriptPanel`, `WordInspector`, `CaptionPreviewOverlay`,
`PlayerPlaceholder`, `useAgentActivity`), and `useAgentActivity` reads
`project.presetId`/`project.videoUrl` inside an effect's dependency array. Making it
nullable means a null guard in every one of them, for a state that only exists before
the first project loads.

Instead, **gate the mount**. `AppRoot` decides:

```
no projectId  → <EmptyEditor/>      // shell chrome + dropzone. No ProjectProvider.
has project   → <ProjectSyncProvider><ProjectProvider initial={project}> … 
```

`ProjectProvider` keeps `project: Project` non-nullable and gains one prop:
`initial?: Project`, defaulting to the fixture when `VITE_USE_FIXTURE=true` and
otherwise required. Every existing component is untouched. This is the same trick
`AppRoot` already uses to keep `ProjectProvider` off the landing page.

**[Audit A4]** `EmptyEditor` also owns the `objectURL` of the dropped file, because
during `creating`/`uploading`/`processing` **there is no `Project` yet** — `GET
/projects/{id}` returns `409 not_ready` until the first run succeeds **[M]**. §4.3's
"show the local video while processing" therefore cannot read `project.videoUrl`. The
URL lives in `ProjectSyncProvider.localPreviewUrl`, and `VideoStage` takes an optional
`srcOverride` prop that wins over `project.videoUrl` while it is set.

**[M]** `VITE_USE_FIXTURE` is referenced in `.env.example` but read by nothing today.

### 4.7 Every state is a real state

| surface | loading | empty | error |
|---|---|---|---|
| Editor root | skeleton shell (header/sidebar/tracks in place, no data) | full-bleed dropzone, "Drop a video to start" | `unreachable` banner + Retry |
| Preview | poster from the local object URL | "No video yet" | `<video>` `onError` → "Could not play this video. The link may have expired." (presigned GET is 1 h **[M]**) |
| Caption track | striped placeholder rows during processing | "No captions yet — processing" / after a 0-word run: "No speech detected" | stage-failed message from `stages[x].error` |
| Transcript | 8 shimmer rows | "No words yet" | same banner |
| Inspector | — | "No word selected" (exists today, keep) | inline field error from `422 detail[0].msg` |
| Stage map | per-stage spinner only on the `running` stage | — | failed stage turns red with its own `error` string |
| Export / Agent | — | — | 501 → "Not implemented yet (P2/P4)" with the `owner` from the body |

---

## 5. Real vs inert, component by component

**Real** (does what it looks like it does):

| component | real behaviour |
|---|---|
| `UploadDropzone` | create → presigned S3 POST → process. Real byte progress. |
| `ProcessingPanel` | real 7-stage map, real per-stage ms and detail strings. |
| `VideoStage` / `TransportBar` | real `<video>`: play, pause, seek, volume, rate, fullscreen. |
| `CaptionRenderer` | real words at real times with real preset + emotion + emphasis + per-word style. |
| `Timeline` ruler, playhead, zoom, scroll | real. |
| `CaptionTrack` | real blocks; click selects, double-click seeks to the block start. |
| `MediaTrack` / `AudioTrack` | real duration and dimensions from the Project; **one clip each**. |
| `TranscriptPanel` | real list, real search, follows the playhead. |
| `WordInspector` | real edits via PATCH, real `signals` readout. |
| `PresetPicker` | real `SET_PRESET` + `PATCH /projects`. |
| `UndoRedoControls` | real (already). |

**Inert** — rendered with real labels and correct icons, and *made to look inert*:
`disabled` attribute, muted foreground, `cursor-not-allowed`, and a `title`/tooltip
naming the owner and the reason. No click handler at all — not even a toast.

| surface | label / icon | tooltip |
|---|---|---|
| Toolbar | Split (`Scissors`), Trim (`SplitSquareHorizontal`), Snapping (`Magnet`), Link tracks (`Link`), Transitions (`Shuffle`), Effects (`Wand2`), Stickers (`Sticker`), Music (`Music`), Speed (`Gauge`). First four mirror the reference's toolbar order (§1.4); zoom-out + zoom slider sit at the right and are **real**. | "Not in the MVP scope" |
| Track headers | mute (`Volume2`/`VolumeX`), lock (`Lock`), visibility (`Eye`) on all three tracks. **[M]** The reference has no such buttons (§1.4) — these are our brief's addition, so they are ours to make look inert. | "Not implemented" |
| Media / audio track bodies | drag, resize, split handles absent entirely | — |
| Header | Share (`Share2`), Rename (`Pencil`) | "No sharing in the MVP" |
| Header | **Export** (`Download`) | **enabled** — calls `POST /render`, shows the real `501 … owner: "P2"`. An honest 501 beats a disabled button, because the seam is real. |
| Agent command bar | unchanged from today — still logs `(agent not connected yet)` | wire `POST /agent` only if Task 8 lands; otherwise leave exactly as-is |
| Sidebar Home/Projects/Templates/Settings | unchanged (inert today) | — |

Rule the implementer must hold: **no mock data, no fake progress, no simulated agent
replies, no `setTimeout` that pretends to be work.** If a number is on screen, it came
from the API, the `<video>` element, or the `Project`.

---

## 6. Build order

Each task is 1–2 h and ends somewhere committable. Tasks 1–3 put something visible on
screen before any timeline work starts.

| # | task | ends when |
|---|---|---|
| **0** | `npm install` at the repo root. `git checkout -b p3-editor` off **`p1-pipeline`** (lead answer 6 — `master` has no API, no audit 12). Add **`envDir: '../..'`** to `apps/web/vite.config.ts` so Vite reads the repo-root `.env` (§0); no `.env.local` needed now that 8010 is the default. **Confirm §0.1** — if `Project.parse(fixture)` still throws, chase the lead before building on it. | `npm run dev` serves `/editor` without throwing, `import.meta.env.VITE_API_URL` is `http://localhost:8010`, `npm run build` passes. |
| **1** | `lib/api.ts` + `state/sync-context.tsx`. No UI. Add a temporary dev-only line in `App.tsx` rendering `lifecycle.k`. | Console/DOM shows a real `GET /projects` result; both error shapes parse. |
| **2** | **Real video on screen.** `VideoStage` + `usePlayback` + `TransportBar`. Delete `PlayerPlaceholder`/`VideoControlBar`. Load an existing processed project by id from the URL (`/editor?id=…` — extend `resolveRoute`). | `/editor?id=7f415222f70f` plays Angry.mp4 with working transport. **First visible win.** |
| **3** | **Captions over the video.** `lib/caption-style.ts`, `useCaptionBlocks`, `CaptionRenderer`, the "Merge very short captions" switch. Delete `CaptionPreviewOverlay`. **Blocked on the lead landing `packages/shared/src/blocks.ts`** (§3.1). | Words appear, in time, styled by preset + emotion + emphasis, while the video plays. |
| **4** | **The shell + fonts.** Rewrite `App.tsx` into header / icon rail / captions list / stage / style panel / timeline, per §1.1. `CollapsiblePanel`, `EditorToolbar` and track headers with real labels, correct icons, visibly inert. Replace `index.html`'s Inter-only `<link>` with one loading **`CAPTION_FONTS`**, plus the guard that every preset font is in that list (§8.9). | 1440px screenshot of the full shell; all four presets render in their real faces; nothing fake on screen. |
| **5** | **Timeline + caption list.** `TimeRuler`, `Playhead`, `MediaTrack`, `AudioTrack`, `CaptionTrack`, zoom, scroll, click-to-seek, auto-scroll; `CaptionList` with numbered blocks and emphasis pills, bound both ways to the track (§1.8). | Scrub the timeline, video follows; click a list row, the timeline scrolls to it. |
| **6a** | **Create + upload.** `EmptyEditor` (§4.6), `POST /projects`, XHR upload with real byte progress, `POST /process`. Stop at "job accepted". | `Angry.mp4` reaches S3 and a `runId` comes back. |
| **6b** | **Process + load.** `ProjectLoader`, `usePipelineStatus`, `ProcessingPanel`, the GET-on-done, mount `ProjectProvider`. | Drop `Angry.mp4`, watch seven real stages, land on 46 captioned words. **The workflow.** |
| **7** | **Edit a word.** `REPLACE_PRESENT` action; inspector PATCH wiring with optimistic + 409 + 422 paths; `signals` "why" block; stretch fix as one click. | Edit a word; preview, timeline and a hard refresh all agree. |
| **8** | **Seams + polish.** Export → real 501. Empty/loading/error states for every surface in §4.7. Phone-width pass. `npm run lint && npm run build`. | Screenshots at 1440px and 390px; verification list in §9 passes. |

Commit after every task. Audit document (`.claude/audits/13-…`) is written by the
implementing session at the end, not now.

**[Audit A5] Honest sizing.** Nine tasks at 1–2 h is **12–18 h**, not a comfortable
day. Tasks 5 and 6b are the ones most likely to overrun — 5 because timeline
interaction always does, 6b because it is four moving parts at once (hence the 6a/6b
split). If time runs short, the order to cut is: Task 8's phone-width pass, then the
inert toolbar in Task 4, then Task 5's auto-scroll. **Do not** cut Task 7 (the edit
path) — without it the workflow in the brief is incomplete.

---

## 7. Rejected alternatives

**A timeline library (`wavesurfer.js`, `react-timeline-editor`, `@xzdarcy/react-timeline-editor`) — rejected.**
What we need is: a horizontal scroll container, `left = ms * pxPerMs`, and a playhead.
That is ~150 lines. Every library brings its own clip model, which our clip model
(`Word[]` derived into blocks, re-derived when the preset changes) does not fit, so we
would spend the time adapting to it rather than writing it. `wavesurfer` additionally
decodes audio client-side for a waveform we do not need — the audio track is one inert
bar. `.claude/INDEX.md` requires an argument for any new dependency; there isn't one.
Hand-roll it, consistent with the already-hand-rolled router.

**Keeping the caption renderer inside `VideoStage` — rejected.** P2's Remotion `<Player>`
must be able to replace it. `CaptionRenderer` therefore takes only props
(`{words, blocks, timeMs, activeWordId, project, frameWidth}`), reads no context, and
is rendered by `VideoStage` as a child. The swap is: change one JSX element, keep
`lib/caption-style.ts` (pure, portable to a Remotion composition). No Remotion
dependency is added — `remotion/` is a README today. Grouping is no longer a
duplication risk at all: per lead answer 1, `deriveBlocks` lives in
`packages/shared/src/blocks.ts` and P2 imports the same function (§3.1).

**Putting `timeMs` in `project-reducer` — rejected.** 60 full-project `Project.safeParse`
calls per second, and it would pollute undo history with playback.

**Putting `version` inside the `Project` object — rejected.** `packages/shared` is the
lead's and the schema has no `version` field. It lives in `ProjectSyncProvider`.

**Server state in a query library (TanStack Query, SWR) — rejected for this MVP.** Two
endpoints are polled or fetched (`/status`, `/projects/{id}`); everything else is a
one-shot mutation. The cache-invalidation machinery would be larger than the code it
replaces, and the reducer already owns the only cache that matters.

**Uploading through the API instead of straight to S3 — rejected.** The API is a
single App Runner container; proxying 200 MB through it is exactly what the presigned
POST exists to avoid.

**`?force=true` re-process as a normal button — rejected.** **[M]** It renumbers every
word id and discards manual edits. It appears only inside the `409 has_manual_edits`
dialog, with that consequence spelled out in the dialog text, and a destructive-styled
confirm.

**Gap-only caption blocks — rejected on measurement.** See §3.1: 3 blocks for 46 words.

---

## 8. Known weak points in this plan

Written plainly, because this is the section that saves the implementer time.

1. **§1 was catalogued at 1075px, not 1440px** — the browser viewport would not grow on
   this machine. The panels are cramped and overlapping at that width, so my reading of
   *proportions* and of what fits in a column is unreliable. Labels, icons, sections and
   behaviour are solid; column widths are not. I also never saw the reference's empty
   state, upload flow or processing UI (§1.7), which is precisely the workflow this plan
   implements — §4.4's stage map has no reference to check against.
2. **I never ran `apps/web`.** `node_modules` is absent and installing it is a write I
   was not permitted in planning. Every claim about how the current UI *looks or
   behaves at runtime* is read from source, not observed. The API claims are all
   first-hand; the frontend claims are not.
3. **`BLOCK_GAP_MS = 320` is tuned on four clips, n=1 each.** It is the only free
   parameter in §3.1 and it was chosen because it sits above Angry's 279 ms gap and
   below its 530 ms one. That is a fit to one clip. Expect to retune.
4. **Rule 3 fragments `Normal`.** Seven isolated single-word `excited` runs become
   seven single-word blocks, four of them under 300 ms. **[M]** The reference ships
   single-word blocks too (`ye`, `hai`, `divya` — §1.3), so this is normal for the
   genre and I no longer propose merging them. What the reference does *not* have is
   four of them under 300 ms; if those flash on screen, that is a real problem and
   the fix (merge sub-250 ms runs into a neighbour) hides pipeline output, so it is
   the lead's call — now settled by answer 2: merge by default, with a toggle (§3.1).
5. **`EMOTION_STYLES.excited.fontSize` is `1.15`, a multiplier, not pixels** — the
   comment in `presets.ts` says so. Spreading `EMOTION_STYLES` into a resolved style
   like the other layers sets `fontSize: 1.15px` and makes captions vanish.
   `lib/caption-style.ts` must special-case it. This is the single most likely bug in
   Task 3.
6. **Stretch rendering has two sources that disagree.** `Word.stretch` is a number ≥ 1,
   but the brief says derive repeats from `signals.extraMs`. **[M]** They do not track
   each other: Angry's `w1 "What"` has `extraMs: 60` with `stretch: 1.0`, while `bhai`
   has `extraMs: 260` with `stretch: 2.18`. The rule must be *gate on `stretch > 1`,
   then size from `extraMs`* — `clamp(round(extraMs/120), 1, 5)`, capped at
   `14 - text.length`. Using `extraMs` alone would stretch words the pipeline decided
   not to stretch.

   **Fixture status after the lead's answer 5 — [M], re-read this session:**
   `demo-project.json` **is** fixed (`Hello`/`What`, `stretch` preserved at 2.6/2.2) but
   is **invalid for a different reason** — see §0.1. The other four fixtures are
   **not yet fixed**: `angry-project.json` still has `bhaiii`/`fuuuck`,
   `excited_long_texts-project.json` `guuuuuuys`, `normal-project.json`
   `guuuuuyz aaaaaaaj loooog noooow haaash` **and `ST`** (damaged from `STT`),
   `real_reel-project.json` `saaaal`/`saaaaal`. They are root-owned (`-rw-r--r-- root`),
   which is why the lead asked for the `chown`.

   **The lesson the lead drew is a renderer constraint, not just a data fix:** the true
   spellings were recovered by re-running the pipeline, **not** by collapsing repeated
   letters — collapsing would turn `noooow` into "now" when the word is **"know"**, and
   `STT` had already been destroyed down to `ST`. So `CaptionRenderer` must **only ever
   add repeats derived from `signals.extraMs`, and never attempt to normalise or collapse
   `Word.text`**. If a fixture still shows repeats, that is bad data to be fixed upstream,
   not something the renderer should paper over.

   **[M] Also note `real_reel-project.json` has 95 words** where the live API returns 94
   for the same clip — the fixtures are from an older run and are not a substitute for
   the API when checking counts.
7. **A 409 refetch still costs the redo stack.** `REPLACE_PRESENT` preserves `past`
   but `commit()` clears `future`, by design. Acceptable; worth knowing.
8. **No test framework exists** in this repo (**[M]** no vitest/jest/playwright config,
   no CI). Everything in §9 is manual. `deriveBlocks` and `resolveStyle` are pure and
   are the two things most worth a test, if the implementer wants to add vitest —
   that is a new dependency and needs its own argument.
9. **Font availability — resolved by the lead (answer 4), but the `apps/web` half is
   still outstanding and is ours.** **[M]** `packages/shared/src/presets.ts` now exports
   **`CAPTION_FONTS`** (12 Google families: Anton, Bebas Neue, Archivo Black, Luckiest
   Guy, Bangers, Titan One, Fredoka, Montserrat, Poppins, Inter, Instrument Serif,
   Oswald) and `mrbeast.base.fontFamily` is now **`Luckiest Guy`** at weight **400**
   (single-weight family — do not request 700/800 for it). **[M]** `apps/web/index.html`
   still loads **Inter only**, so three of four presets render in a fallback right now.
   Task 4 replaces that `<link>` with one covering `CAPTION_FONTS` (`display=swap`,
   weights 400–900 where the family has them) and adds a guard asserting every
   `PRESETS[*].base.fontFamily` and `.emphasis.fontFamily` is in `CAPTION_FONTS`.
   Remaining risk: a 12-family webfont link is a real payload, and `Luckiest Guy` at
   weight 400 against a preset system that assumes numeric weights is the most likely
   place the preview still looks wrong.
10. **Auto-scroll and manual scroll will fight.** The "suspend auto-scroll while the
    user scrolls" heuristic is **[A]** and is the kind of thing that feels wrong until
    it is tuned against a real 94-word timeline.
11. **Presigned URLs expire.** `videoUrl` lasts 1 h and the upload policy 900 s **[M]**.
    A tab left open over lunch shows a dead `<video>`. §4.7 gives it an error state;
    silent re-fetch on `<video>` error is the better fix and is not planned.
12. **No project picker** (lead answer 8). `GET /projects` is a Scan of a table shared
    by p1–p4 (audit 12 §6) and stays a debug endpoint. After upload the app navigates to
    `/editor?id=…`; recent ids go in `localStorage` for a cheap "recent" strip. Revisit
    after the MVP. The weak point: `localStorage` ids can outlive the projects they name,
    so the strip must tolerate a `404 not_found` per entry rather than assuming they resolve.

---

## 9. Verification list for the implementer

Everything manual — there is no test runner.

**Setup**
1. `npm install` (repo root). `docker compose up --build` — `API_PORT=8010` is now the
   repo default, so `curl localhost:8010/health` → `{"ok":true}` with no extra flags.
2. **Prove Vite actually reads the env**: `console.log(import.meta.env.VITE_API_URL)`
   must print `http://localhost:8010`, not `undefined`. This fails without the
   `envDir` change (§0) and is the single easiest thing to get silently wrong.
3. **Prove the fixture parses**: `VITE_USE_FIXTURE=true npm run dev`, open `/editor`.
   If it throws in `Project.parse`, §0.1 has not landed yet — do not work around it.
4. Confirm all four presets render in their real faces, not a fallback — `mrbeast`
   should be chunky `Luckiest Guy`, `kathmandu` a serif with `Anton` emphasis (§8.9).

**The workflow**
5. Upload `services/api/scripts/stt_bakeoff/clips/Angry.mp4` through the real UI.
   Expect, and check against the stage map: **15.9 s, 478×850, 46 words, 13.0%
   emphasis (6 words), all 46 `angry`, ~18–22 s end to end** — this session measured
   21.7 s and $0.0198 for exactly this clip. Any disagreement means something is wrong.
6. Confirm the seven stages appear with `transcribe` and `sarvam` running concurrently,
   and that `transcribe` sits at `running` for ~13 s while `sarvam` is already `done`.
7. `Real_reel.mp4`: 23.5 s, 94 words, 720×1280. Check timeline density (≈35 blocks at
   `kathmandu`) and that the portrait 9:16 frame letterboxes correctly.
8. `Normal.mp4`: toggle **"Merge very short captions"** off and on. Off should show the
   seven isolated single-word `excited` blocks; on should absorb them — **[M]** 25 → 22
   blocks at `kathmandu`, with zero sub-250 ms blocks remaining. Confirm no block flashes.
9. Switch preset to `mrbeast` (2 words/line) on `Real_reel` — the hardest case,
   **[M]** 50 raw blocks → 42 merged. Check some blocks now hold **4** words, over the
   nominal 2, and that the renderer wraps rather than clipping (§3.1).

**Sync**
10. Scrub the timeline fast, in both directions, while paused; captions must track the
   playhead, not lag it. Then play at 2× and confirm the same. Playing from zero is the
   easy case and proves little.
11. Seek to a gap between blocks (Angry has one at ~1.98 s) — nothing should be showing.
12. Edit a word's text → the preview, the timeline block and the transcript all change
   at once → hard-refresh the page → the server has it.
13. Force a conflict: `curl -X PATCH …/words/w3 -d '{"text":"X"}'` from a terminal, then
   edit the same word in the UI. Expect the `409 stale_version` path: refetch, a visible
   notice, **no silent overwrite**, and undo still available.
14. Set stretch to `0` in the inspector → `422 invalid_project` with the field message,
    and the UI reverts rather than showing an invalid value.

**Failure**
15. `docker compose stop api` mid-poll → `unreachable` with a Retry button within ~6 s.
    Not an infinite spinner. `docker compose start api` → it recovers on its own.
16. Open a project id that does not exist → the `404 not_found` state, not a crash.
17. Open a project created but never processed → `409 not_ready` rendered as
    "no captions yet", with the process action available. Not an error.
18. Click Export → the real `501` with `owner: "P2"` visible. Submit an agent command →
    unchanged honest local log (or the real 501 if Task 8 wired it).
19. Re-process a project that has manual edits → `409 has_manual_edits`, and the dialog
    says in words that `force` renumbers every word id and discards edits.

**Presentation**
20. Screenshots at **1440px** and at **390px** (phone). At phone width the timeline
    should scroll horizontally without the page scrolling horizontally. Compare the
    1440px shot against §1.1 — this plan's reference study was done at 1075px, so the
    column proportions are the part most likely to need adjusting (§8.1).
21. Click a row in the caption list → the timeline scrolls and zooms to that block, and
    the block is selected in both. Click a word clip on the track → the same word is
    highlighted in the list and opens in the inspector.
22. `npm run lint && npm run build` clean.
23. Walk the §5 inert table: every listed control is present, correctly labelled and
    iconed, and *looks* disabled. Click each one — nothing may happen, including no toast.

---

## 9b. Audit of this plan (second pass, same session)

The first draft was audited before sign-off by re-checking its claims against the
running API and the source, rather than re-reading its own prose. Five findings; two
would have blocked the implementer. All are folded into the sections above.

| id | finding | where it landed |
|---|---|---|
| **A1** | *Blocking.* "Make `ProjectProvider` start empty" reads as one sentence but means `useProject(): Project \| null`, which breaks **8 measured call sites** and an effect dependency array in `useAgentActivity`. Replaced with mount-gating at `AppRoot` + an `EmptyEditor`. | §4.6 |
| **A2** | *Blocking.* `ProjectSyncProvider` sits **above** `ProjectProvider`, so the polling hook inside it could never `dispatch(SET_PROJECT)`. Introduced a headless `ProjectLoader` inside both providers to own all fetching. | §4.1 |
| **A3** | The plan said "show the local video while processing" but there **is no `Project`** during processing (`GET` → `409 not_ready`), so nothing could hold the object URL. Moved to `ProjectSyncProvider.localPreviewUrl` + a `srcOverride` prop. | §4.6 |
| **A4** | Two [A] claims promoted to [M]: the presigned `videoUrl` serves `206` with `Accept-Ranges: bytes` and `Content-Type: video/mp4` (so `<video>` seeking works), and `PATCH /projects` **merges `settings` per key**. | §4.2 |
| **A5** | Build order was nine tasks sold as "1–2 h each" without stating the total. It is 12–18 h. Task 6 split into 6a/6b, and a cut-order named. | §6 |

**Claims re-verified and found correct:** words sorted with no negative gaps and no
zero-width entries (§3.2); `index.html` loads **only** Inter, so three of four presets
fall back (§8.9); the emphasis budget on the live project is 6/46 = 13.0%.

**What this audit could not do:** I wrote the plan, so it shares my blind spots. It
re-checked *facts*, not *judgement*. The judgement calls most worth a second opinion
are `BLOCK_GAP_MS = 320` (§8.3), drawing blocks rather than words on the caption track
(§1.8), and the decision to hand-roll the timeline (§7).

---

## 10. Lead decisions (answered) and what is still open

### Answered 2026-09-18 — binding

| # | question | ruling |
|---|---|---|
| 1 | `lines[]` schema change | **Not landing it.** Instead `deriveBlocks` moves to **`packages/shared/src/blocks.ts`** so P2 imports the identical function. Adding a module is not a schema change. **Proposed here; the lead lands it** (§3.1) |
| 2 | Short blocks | **Merge by default**, `MIN_BLOCK_MS = 250`, with a **"Merge very short captions"** switch in **local UI state** — not `Project.settings` (§3.1) |
| 3 | `BLOCK_GAP_MS = 320` | **Approved**, with the three-way split rule. **No** Words/MaxChars/Lines settings fields (§3.1, §1.8) |
| 4 | Fonts | **Applied in the repo.** `mrbeast` → **Luckiest Guy** (weight 400); new **`CAPTION_FONTS`** export. `apps/web/index.html` must load them + a guard — **ours, Task 4** (§8.9) |
| 5 | Fixture vs invariant | `demo-project.json` **fixed**; four root-owned fixtures pending the `chown`. Renderer rule: **never reconstruct text from repeats** (§8.6) |
| 6 | Branch | **`p3-editor` off `p1-pipeline`**, not `master`. `aman/editor-ui` already merged (`0d2f8d7`) (§6 Task 0) |
| 7 | Port | **8010 is the repo default** in `.env` and `.env.example`. No `.env.local` (§0) |
| 8 | Project picker | **Out of scope.** `/editor?id=…` + `localStorage` recents (§8.12) |

### Still open — raised by this pass

9. **BLOCKER, needs you before Task 0 clears: `demo-project.json` does not validate.**
   All 16 `signals` objects lack `extraMs`, which `Signals` requires, so
   `Project.parse()` throws and `/editor` cannot mount. Full detail and both fixes in
   **§0.1**. Two decisions: (a) the `extraMs` values to write into the fixture, and
   (b) the TS/Python drift — `project.ts` requires `extraMs`, `schema.py` defaults it to
   `0.0`, which is *why* the Python seeder accepted a fixture the browser rejects. Root
   `CLAUDE.md` says these two files change together; right now they disagree.
10. **The four remaining fixtures are still root-owned and still carry repeated letters**
    (§8.6). **[M] I could not run `sudo chown` — this session is in plan mode and
    restricted to writing the plan file.** Please run it yourself (typing `!` first runs
    it in this session): `! sudo chown shubh:shubh packages/shared/fixtures/*.json`
11. **`packages/shared/src/blocks.ts` blocks Task 3.** Landing it early unblocks the
    first genuinely visible milestone. The exact signature and both passes are specified
    in §3.1 so it can be landed without re-deriving anything.
12. **`CLAUDE.md` says the lead merges to `main`; the default branch is `master`.**
    Flagged, not fixed, per your instruction (also audit 12 §9.10).
13. **Merged blocks can exceed `wordsPerLine` by one** — measured 4 words on `kathmandu`,
    5 on `minimal` (§3.1). Confirm that is acceptable for P2's renderer, since
    `wordsPerLine` stops being a hard guarantee the moment merging is on.

---

## 11. Handoff prompt for the implementing session

This block is live at `.claude/next-session-prompt.md` (it superseded P1's, consumed on
2026-09-18). Paste it into a fresh Claude Code session. It is written to be read
**without this session's context**.

> Implement the frontend editor shell + captions workflow for Expressive Captions
> (`apps/web`, P3's folder). The plan is written, audited and approved. Build it.
>
> ## Read first, in this order
> 1. Root `CLAUDE.md` — rules, ownership, stack, branches.
> 2. `.claude/INDEX.md` — critical invariants (especially: no fake backend/AI behaviour;
>    `project-reducer.ts` is the only mutation site; `PRESETS` is the only preset source;
>    stretch never goes in `Word.text`).
> 3. **`.claude/plans/frontend-editor-captions.md` — the plan. Read all of it.**
>    §0 corrects four facts the earlier brief got wrong. §9b is its own audit; the two
>    findings marked *Blocking* (A1, A2) are the ones that will bite you first.
> 4. `packages/shared/src/project.ts` and `presets.ts` — the data contract.
> 5. `.claude/audits/00-current-frontend-architecture.md` for orientation, then `02`
>    (reducer contract) and `09` (current editor layout). Skim `04`–`08` only when you
>    touch those components.
>
> Do **not** read `services/api/app/**` — `services/api/README.md` §Endpoints plus the
> plan's §4.2 table is the whole API surface you need, and both were verified against
> the running API.
>
>
> ## Two things may block you on day one — check both before writing code
> - **Plan §0.1:** `packages/shared/fixtures/demo-project.json` is missing `extraMs` in
>   every `signals` object, which `Signals` requires, so `Project.parse()` throws and
>   `/editor` cannot mount. The lead owns the fix. Verify it has landed; if not, ask —
>   do not work around it, and do not edit `packages/shared` yourself.
> - **Plan §3.1:** `packages/shared/src/blocks.ts` (`deriveBlocks`) is the lead's to land
>   and Task 3 needs it. If it is missing, ask rather than writing a local copy — a copy
>   that diverges from P2's is the exact failure that module exists to prevent.
>
> ## Before you write code
> - `npm install` at the repo root (`node_modules` is absent; `npm run dev` fails without it).
> - `docker compose up --build`; `API_PORT=8010` is the repo default, so
>   `curl localhost:8010/health` → `{"ok":true}`.
> - Add `envDir: '../..'` to `apps/web/vite.config.ts`. Without it Vite never reads the
>   repo-root `.env` and `import.meta.env.VITE_API_URL` is `undefined` (plan §0). Prove it
>   with a `console.log` before trusting any fetch.
> - `git checkout -b p3-editor` off **`p1-pipeline`** — `master` has no API and no audit 12.
>
> ## Scope
> Whole editor shell, but **only the captions workflow is implemented**: drop a video →
> `POST /projects` → presigned S3 upload → `POST /process` → poll `/status` showing the
> real 7-stage map → `GET /projects/{id}` → captions on the timeline and over the playing
> video → select a word → `PATCH /words/{id}`. Everything else (trim, split, transitions,
> effects, stickers, music) is present with real labels and correct icons and is
> **visibly inert**. No mock data, no fake progress, no simulated agent replies.
>
> Stay inside `apps/web`. Never touch `packages/shared/`, `services/api/`, `remotion/`
> or `app/agent/`. If a task seems to need a schema change, stop and ask — plan §10 lists
> the changes already proposed to the lead; propose, never apply.
>
> ## How to work
> Follow the plan's §6 build order. It is nine tasks, 12–18 h total, each ending
> somewhere committable; commit after each. Tasks 2 and 3 put a real video and real
> captions on screen early — do those before the shell.
>
> The plan's §9 is your verification list. The headline check: upload
> `services/api/scripts/stt_bakeoff/clips/Angry.mp4` and expect **15.9 s, 478×850, 46
> words, 6 emphasised (13.0%), all 46 `angry`, ~18–22 s end to end**. Disagreement means
> something is wrong. Run `npm run lint && npm run build` before each commit.
>
> Two invariants that are easy to break and expensive to debug: **never reconstruct
> `Word.text` from repeated letters** — repeats are drawn from `signals.extraMs`, and
> collapsing them turns `know` into `now` (plan §8.6). And **`timeMs` never enters
> `project-reducer`** — it would run a full-project Zod validation 60×/s (plan §3.2).
>
> When you are done, write `.claude/audits/13-frontend-editor-captions.md` in the style
> of audit 12: label every claim measured or assumed, record deviations from the plan
> and why, and list what is weak or unfinished.
