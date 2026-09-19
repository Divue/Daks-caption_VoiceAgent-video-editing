# Layers Phase 1 — images and clips over the video

## Status
Built and verified end to end: the schema, upload and serving against real S3, the editor (render,
select, move, scale, rotate, trim, split, delete, undo), the Remotion export (frames extracted from a
real MP4 and inspected), and seven agent tools against live Bedrock. Two app-wide defects found on the
way are fixed: **undo never reached the server**, and **tools in one agent turn couldn't see each
other's changes**. **Not verified:** a cited survey of other editors (the research agents hit a rate
limit — see Deviations); rotation and opacity in the export; an unmuted overlay clip's audio; 40 items.

## Objective
The repo owner asked for "more layers, up to 2, where photos and videos can be put; basic editing —
cut the clip/img, reposition, scale"; for the workflow to be planned and attached to the agent's
tools; for research on how other editors do it; and for it to be implemented.

This reverses two written rules — `CLAUDE.md`'s "no general video editing" and an `INDEX.md` invariant
("a caption ribbon, not a timeline… do not re-add") — so I treated the request as the lead's decision
and rewrote both, keeping the boundary that still holds: the main video is never cut.

## Implementation
**The model** (`LayerItem`, `packages/shared/src/project.ts` + `schema.py`) keeps three things apart:
- placement in output time (`startMs`..`endMs`),
- source trim in source time (`trimStartMs` — the end is derived, never stored),
- transform in frame space (`x`/`y` as the centre, `width`, `rotation`, `opacity`; height follows
  `aspect`).

It has `track: 1 | 2` and a cap of 40 items. It sits optional and additive on `Project` (like
`presetOverride`), so there's no migration and no version bump. `LAYERS.md` is the full write-up.

**Backend:**
- `POST /projects/{id}/media` hands out a server-minted id and a presigned POST, reusing the main
  video's path and size cap.
- `GET /projects/{id}/media/{mediaId}` returns a 307 to a fresh presigned GET, so a `src` never expires.
- `PATCH /projects/{id}` accepts `layers` as a whole-list replace, validated as part of the `Project`.
- The media id pattern is what keeps `{prefix}/media/{mediaId}` a name and never a path. It's checked
  before S3 or the store is touched.

**Editor:**
- `lib/layers.ts` is the single home of the arithmetic (active items, box geometry, move, trims,
  split, placement of a new upload).
- `LayerEditorProvider` owns selection, every edit (one `patchProjectFields` write each, so one save
  and one Ctrl+Z), and the upload flow (measure → create → S3 → place at the playhead).
- `LayerStage` draws media over the video and under the captions. Each clip is slaved to the main
  clock: seeked exactly while paused, and corrected only past 0.3 s of drift while playing.
- `LayerHandles` sits above the captions (which are pointer-transparent): move with centre snapping,
  uniform corner scale, a rotate handle.
- `LayerLane` gives two timeline lanes: drag to move, drag an edge to trim, snapping to the playhead,
  the ends and other items.
- `LayerPanel` is the new **Layers** tab. Its sliders save on release, not per tick.
- The toolbar's **Add media / Split / Delete** are now real, disabled with a reason when they would do
  nothing. The inert "Trim" button is gone, because trimming is an edge drag.
- Keys: Delete, Ctrl/⌘+B, Esc.

**Export:** each item is a `<Sequence from durationInFrames layout="none">` containing an `Img`, or an
`OffthreadVideo` with `trimBefore`. Those are Remotion 4.0.526's current props, checked in the
installed `.d.ts` files, where `startFrom`/`endAt` are marked deprecated. The geometry is the editor's
own `layerBoxStyle`. The API mints a presigned URL per media id; the render server validates each as
http(s).

**Agent** (`tools/layer_tools.py`): `get_layers`, `update_layer_items` (nine named positions,
`scaleBy`), `retime_layer_item` (move vs trim start vs trim end vs in-point), `split_layer_item`,
`set_layer_track`, `duplicate_layer_item` and `remove_layer_items`. Each returns one validated
`SET_LAYERS` carrying the finished list. The prompt gains a MEDIA LAYERS section and a precise
boundary: layer items can be cut, the main video can't. The agent cannot add media, because it has
no file.

### Defect 1 — undo never reached the server (app-wide, pre-existing)
Seven call sites dispatched `UNDO`/`REDO` straight to the reducer. The screen changed; the server
kept the edit. A reload brought it back, and so did the **export**, which renders the saved project.
That includes the agent's "Undo that". It was found because the layer UI test's upload step waited
on a count that the server and the screen disagreed about.

The fix is `lib/project-diff.ts`, which works out the writes that make the server hold a given
document (removed style keys go out as explicit nulls). `useWordPatch().undo/redo` dispatch *and*
save. All seven call sites were rerouted, and a grep confirms there are 0 raw dispatches left.

### Defect 2 — every tool in a turn saw the turn's starting document (P4, pre-existing)
`planner.py` gave each tool `request.project`. For word edits, whose patches merge, that was mostly
harmless. For a tool that returns a finished list it was destructive: a second tool's list silently
overwrote the first tool's work. Live, the agent refused "cut the b-roll at 6 s and bring the second
half in front" because the half it had just made didn't exist for the next tool. The planner now
advances a `working` copy after each tool's patches. `request.project` is still never modified, and
the final validation is unchanged.

### Found and fixed on the way
- Catalogue prompt 1 **required** the old bug: every word stamped with the colour. It now requires
  the base face, and zero stamped words.
- A Bedrock `ThrottlingException` was reported as "The agent failed unexpectedly". It now says the
  service is busy, to wait a few seconds, and that nothing was changed.

## Files Created
`LAYERS.md`; `apps/web/src/lib/{layers,media-probe,project-diff}.ts`;
`apps/web/src/state/layer-editor-context.tsx`;
`apps/web/src/components/{preview/LayerStage,preview/LayerHandles,timeline/LayerLane,inspector/LayerPanel}.tsx`;
`apps/web/scripts/{check-layers.ts,check-layers-ui.mjs}`; `services/api/app/routers/media.py`;
`services/api/app/agent/tools/layer_tools.py`; `services/api/app/agent/tests/test_layer_tools.py`;
this audit. (The schema, store and S3 changes landed in the previous commit, `81dd406`.)

## Files Modified
- `apps/web`: `App.tsx`, `EditorBootstrap.tsx`, `VideoStage.tsx`, `Timeline.tsx`, `MediaLane.tsx`
  (comments), `EditorToolbar.tsx`, `project-context.tsx`, `word-patch-context.tsx`, `useWordPatch.ts`,
  `useUndoRedoShortcuts.ts`, `UndoRedoControls.tsx`, `useAgentCommand.ts`, `package.json`
  (`check:layers`).
- `remotion/`: `src/CaptionVideo.tsx`, `server/index.mjs`. **P2.**
- `services/api`: `routers/render.py`; `agent/{contracts,validation,planner,router}.py`;
  `agent/tools/__init__.py`; `agent/tests/{test_planner,test_tool_registry}.py`;
  `scripts/agent_demo.py`. **P1 / P4.**
- `CLAUDE.md`, `.claude/INDEX.md` — the scope exception and four new invariants.

## Files Intentionally Untouched
- The text `Overlay` type and the disabled `add_overlay` tool. Media layers are a separate, rendered
  thing; text overlays still render nowhere and remain refused.
- `patchWord`'s per-word route. It's still right for a single-word edit.

## Architecture
```
Add media → probe (browser) → POST /media → S3 (presigned POST) → SET_LAYERS (one write)
edit (video | timeline | panel | keys | agent) → one SET_LAYERS → PATCH /projects/{id} {layers}
render: preview  = LayerStage(layerBoxStyle)      under CaptionRenderer
        export   = <Sequence> + Img/OffthreadVideo(trimBefore) with the SAME layerBoxStyle
undo/redo: reducer step + diffProjects(before, after) → bulk words + project PATCH
agent turn: tool₁(working₀) → working₁ → tool₂(working₁) → …   (request.project untouched)
```

## Interfaces / Contracts
- `Project.layers?: LayerItem[]` (≤ 40). `PresetOverride` was unchanged in this commit.
- `ProjectPatch.layers` (whole list). `SetLayersAction` joins `AgentPatch` on both sides.
- `WordPatchValue.undo/redo(steps?)`; `ProjectContextValue.past/future`.
- Render server input: optional `mediaUrls: {mediaId: url}`.
- `VideoStage` has two new slots: `mediaLayer` and `editLayer`.

## Ownership
`apps/web` — P3. `remotion/` — P2. `services/api` routes and store — P1. `services/api/app/agent` —
P4. `packages/shared` + `schema.py` — lead. All are touched on the repo owner's explicit instruction
and flagged here.

## Security
- Media ids are server-minted and pattern-pinned. A traversal id is a 404 before any S3 or store call
  (tested: `..%2F..%2Fsource.mp4` → 404).
- Types are a closed allow-list: an `.exe` is a 415. An unknown project is a 404.
- Uploads reuse the existing presigned POST with its size cap and content-type condition.
- The render server rejects any non-http(s) media URL.
- Still true, and still out of scope: the API has no auth, and the render server's pre-existing
  hardening items (export audit, phase 1) are unchanged.

## Testing
- `check:layers` **43** (35 layer + 8 undo-diff) · `check:agent` · `check:captions` · `tsc -b` · build
  · oxlint identical to `HEAD` · remotion drift guard.
- pytest **128** · agent suite **13 modules** (new: `test_layer_tools`, 24 checks — the same numbers
  as the TypeScript side) · `test_planner` +3.
- Graded catalogue against live Bedrock, all four grades rerun after the planner fix — including two
  runs that were not clean. See Live Verification.

## Live Verification
- **Backend, real S3:** a PNG uploaded through the presigned POST (204), served back through the
  redirect byte-identical, saved as a layer (version 4→5), and still there after reload. Track 3 → 422
  with nothing written.
- **Browser, `check-layers-ui.mjs`: 18/18.** It rendered at the exact centre and width; a move saved
  as ONE write; a corner scale was uniform; Ctrl+B split into two saved items; one Ctrl+Z undid it
  **on the server**; an uploaded image landed at the playhead; an uploaded clip measured 3000 ms and
  stacked on layer 2; scrubbing showed source time 1.50 s; Delete saved; no page errors.
  - **Control:** with the old raw-dispatch undo, the undo check **fails** (1 on screen, 2 on the
    server).
- **Export, frames from the MP4:**
  - 1.0 s — the logo top right.
  - 5.5 s — nothing (between items).
  - 7.0 s — the clip at (30%, 60%) with "OH my GOD" drawn over it.
- **Agent, live Bedrock, 7/7 layer commands** — bigger + top-left, cut at 7 s, until 3 s, again at
  15 s, send behind, remove. Each took two tool calls. "Add a cat picture" was UNSUPPORTED, pointing
  at Add media.
- **Graded catalogue, after the planner fix:** easy 4/4, hard 5/5, asks 3/3, and average 8/8 in the
  first run — but not every rerun was clean, and these are the real numbers:
  - **Prompt 11** ("make it bigger", nothing selected — the most deliberately vague prompt) asked a
    question in 1 of 5 runs instead of acting: **4/5**. That's model variance on the one prompt
    designed to sit on the act/ask line, and it predates this work.
  - **Asks went 0/3 once**, in a back-to-back burst of about 30 Bedrock calls. One of those was a
    genuine second question after the user's answer; the other two I couldn't attribute, because the
    filtered log didn't keep their details (throttling is the likely cause, not a proven one). A clean
    run straight after: **3/3**.
  - **Prompt 19** (cut and restack) failed before the planner fix and passes after: the second half
    is on layer 2 with `trimStartMs` 2000.
  - **Control:** the deterministic planner test fails without the fix.

## Unverified / Untestable
1. Rotation and opacity in the export (the geometry is shared, but no rotated item was rendered).
2. An unmuted overlay clip's audio, in the preview or the export.
3. 40 items; long clips; slow networks (clip preload is 2 s ahead).
4. Media files orphaned by a delete stay in S3; nothing cleans them up.
5. A human at a real mouse and trackpad: all interaction was driven by Playwright.

## Deviations
- **Research:** the three research subagents failed on an API rate limit before returning anything.
  The conventions in `LAYERS.md` §3 are standard editor behaviour, applied conservatively and labelled
  as such. Only the Remotion API was verified against its source. I also corrected one wrong claim of
  my own in a code comment: Premiere's add-edit is ⌘/Ctrl+K, not B.
- The two defects were outside the ask. Both lost user work silently, and one of them blocked this
  feature's own test.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `81dd406`. `git status` reviewed before commit. The test data
created during verification was restored.

## Next Steps
1. Render a rotated, semi-transparent item and an unmuted clip, and check the MP4 (owner: P2).
2. Delete a layer's S3 object when the last item using it is removed (owner: P1).
3. P2 / P1 / P4 / lead sign-off on their parts.
4. A cited survey of CapCut/Kapwing/Canva overlay UX, if the team wants the design checked against
   sources (cheap now that the build exists to compare against).
