# Media layers — images and clips over the video

Two tracks of your own media — a logo, a reaction picture, a B-roll cut — placed over the reel,
under the captions. You can move, scale, rotate, fade, trim, split, restack, duplicate and delete
them, with the mouse or by talking to the agent. They save as you go, undo in one step, and appear
in the exported MP4 exactly where the preview shows them.

What this is **not**: general video editing. The main video is never cut, trimmed or re-timed, and
there are no transitions, effects or music. (That boundary is written into `CLAUDE.md`.)

---

## 1. The model — three things, never mixed

Every editor that gets overlays right keeps three questions apart. Every bug in this area comes from
blurring them.

| Question | Field | Measured in |
|---|---|---|
| **When is it on screen?** (placement) | `startMs` … `endMs` | output time — the finished video |
| **Which part of the clip plays?** (source trim) | `trimStartMs` | source time — the uploaded file |
| **Where and how big?** (transform) | `x`, `y` (centre), `width`, `rotation`, `opacity` | % of the frame |

- There is **no "trim end" field.** A clip shows its source from `trimStartMs` for exactly
  `endMs − startMs`. The end is derived, so the two can never disagree.
- **Height is never stored.** It follows from the source's own `aspect`, so an item can be scaled but
  never squashed.
- `x`/`y` is the item's **centre**, the same convention captions use, and it may run from −50 to 150
  so a sticker can sit partly off-frame.
- `track: 1 | 2`. Track 2 draws over track 1; the captions draw over both.

The schema is `LayerItem` in `packages/shared/src/project.ts`, mirrored in `services/api/app/schema.py`.
It is optional and additive on `Project`, so existing projects needed no migration.

### The operations, precisely

| Operation | What changes | What must NOT change |
|---|---|---|
| **Move** in time | `startMs`, `endMs` by the same amount | length, `trimStartMs` — moving never changes which part plays |
| **Trim the left edge** | `startMs`, and for a clip `trimStartMs` by the same amount | the frame under the right edge |
| **Trim the right edge** | `endMs` | — and a clip can't run past the end of its source |
| **Split at T** | one item → two sharing the source; the second's `trimStartMs` advances by the first half's length | the picture at the cut: playback stays seamless until a half is moved |
| **Scale** | `width` | `aspect` — always uniform |

This arithmetic exists in exactly two places, tested against the same numbers:
`apps/web/src/lib/layers.ts` (the editor and the export) and `services/api/app/agent/tools/layer_tools.py`
(the agent).

---

## 2. The workflow

### Adding media — only the user can
1. **Add media** in the timeline toolbar, or in the **Layers** tab. PNG, JPEG, WebP, GIF, MP4, MOV and
   WebM are accepted.
2. The browser measures the file first — its shape, and a clip's length — so an unreadable file
   fails *before* it costs an upload.
3. `POST /projects/{id}/media` returns a server-minted id and a presigned S3 upload. The bytes go
   straight to S3, under the project's own prefix, and never pass through the API.
4. The item lands **at the playhead**: an image for 3 s, a clip for its own length (capped at the
   video's end). It goes on layer 1, or on layer 2 if layer 1 is busy there. Newly added items
   stack; they don't silently cover each other.
5. It's selected, and the **Layers** tab opens on its properties.

Media is served through `GET /projects/{id}/media/{mediaId}`. That's a redirect to a fresh presigned
URL, so a `src` in the editor never expires the way a stored presigned URL would.

### Editing — three surfaces, one write path
| Where | How |
|---|---|
| **The video** | Click an item to select it. Drag to move (it snaps to the centre lines); drag a corner to scale; drag the round handle to rotate (hold Shift for 15° steps). |
| **The timeline** | Two lanes, *Layer 2* and *Layer 1*. Drag an item's body to move it in time and an edge to trim it; edges snap to the playhead, the video's ends and other items. Click an empty lane to seek. |
| **The Layers tab** | Every item, grouped by layer. For the selected one: start/end, the clip's in-point, nine named positions, X/Y/size/rotation/opacity, Split at playhead, Duplicate, Move to the other layer, Mute, Delete. |
| **Keyboard** | **Delete** removes the selected item, **Ctrl/⌘+B** splits it at the playhead, **Esc** deselects. |

Whatever you use, a change is **one write** of the whole layer list, saved on the editor's single
write queue and undone with **one Ctrl+Z**. Drags and sliders follow the pointer locally and save
once, when you let go.

### Talking to it — the agent's tools
| You say | The agent calls |
|---|---|
| "make the logo bigger and put it top right" | `get_layers` → `update_layer_items(position="top-right", scaleBy=1.3)` |
| "cut the clip at 7 seconds" | `split_layer_item(atMs=7000)` |
| "show the logo only until 3 seconds" | `retime_layer_item(endMs=3000)` |
| "move the clip to 10 seconds" | `retime_layer_item(moveToMs=10000)` |
| "put the logo again at 15 seconds" | `duplicate_layer_item(startMs=15000)` |
| "bring the picture to the front" | `set_layer_track(track=2)` |
| "remove the logo" | `remove_layer_items` |
| "add a picture of a cat" | **UNSUPPORTED** — "use Add media", because it needs a file only you have |

The agent finds items by **name** ("the logo" is `logo.png`) or by when they're on screen, and asks
when more than one could be meant. Several edits in one sentence work: each tool in a turn sees what
the previous one did.

### Exporting
The export renders the saved project with the same geometry function the preview uses
(`layerBoxStyle`). Each item is a Remotion `<Sequence>` at its output time. A clip's source trim is
`trimBefore`, which is Remotion 4.0.526's current prop name — `startFrom` is deprecated, as checked
in the installed type definitions.

---

## 3. How other editors do it, and what we copied

The model and interactions follow conventions shared by timeline editors — CapCut, Final Cut Pro,
Premiere, and web tools such as Kapwing and Canva:

- **Placement and source trim are separate.** Moving a clip never changes which footage plays, and
  trimming the left edge also moves the in-point.
- **Split makes two clips sharing one source**, with adjacent in-points, so nothing jumps at the cut.
- **Overlay tracks stack above the main track**, and higher draws over lower.
- **Corner handles scale uniformly**; there's no stretch handle for media, which would distort it.
- **Snapping** to the playhead, to the frame's centre, and to other clips' edges.
- **Blade at the playhead with B** — CapCut uses Ctrl+B and Final Cut Pro ⌘B. (Premiere uses
  ⌘/Ctrl+K for the same thing.)

We cap it at **two tracks and 40 items**. That's enough for a short-form reel, keeps every project far
inside the store's 350 KB document limit, and keeps the agent's view of the layers small enough to
reason about in one read.

**Stated plainly:** a cited research pass across these tools was started, but it didn't complete — the
research agents hit an API rate limit. What's above is standard editor behaviour, applied
conservatively. The one thing verified against its source is the Remotion API, checked in the
installed types. A properly cited survey is a cheap follow-up if anyone wants it.

---

## 4. Limits and what's next

- **Not built:** no keyframes or animation, no crop, no per-item speed, no fades, no audio mixing. An
  unmuted clip's audio plays at full volume alongside the narration.
- **Not tested:** 40 items at once, very long clips, and the export of an unmuted overlay clip's audio.
- **Orphaned files:** deleting a layer item leaves its file in S3. Nothing references it, and nothing
  cleans it up yet.
- **The demo reel** (`/editor?demo=1`) can't take media, because it has no saved project to hold it.
  Open a real project.

## 5. Running the checks

```bash
cd apps/web && npm run check:layers                    # the arithmetic — and undo that saves
docker compose exec -T api python -m app.agent.tests.test_layer_tools   # the agent's side, same numbers
docker compose exec -T api python scripts/agent_demo.py --grade hard    # includes "cut and restack", live
# In a real browser, against the running stack (needs playwright; it restores the project afterwards):
PROJECT_ID=<id> IMAGE=logo.png CLIP=clip.mp4 node apps/web/scripts/check-layers-ui.mjs
```
