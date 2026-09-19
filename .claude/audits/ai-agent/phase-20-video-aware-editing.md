# Phase 20 — Video-aware editing: preset vocabulary, word ranges, size ramps, stickers and region fitting

## Status
Implemented and verified LIVE against the real stack (running API, real S3, real Rekognition,
real Bedrock) on project `6dc4e73ec499`. All three commands this phase was asked for now run end
to end through `POST /agent/command` and return correct, validated patches. Frame placement was
checked visually, not only numerically. Two limits are real and stated below: hand detection
depends on a vision model's judgement, and the fitted caption size uses an ESTIMATED text width
because the backend has no font metrics.

## Objective
Make three specific user commands work, each of which was impossible before:

1. "hey can u change the preset to something trendy and subtle" — a vibe, not a preset name.
2. "from the word like near 27 seconds to the word introduces. change the captions from batch of
   words into single words. and each word should be bigger than previous word."
3. "from 51 second to 56 second put angry emoji on my face and at 1 min 5 second till end of
   captions, resize the caption and place it on my hand and they should fit in that space."

The request was explicitly to build whatever tools, context and prompting these need, and to
finish them end to end rather than produce a plan.

Note on the stale plan: `.claude/plans/pasted-content-id-1538-planning-dynamic-umbrella.md`
describes the agent router as unmounted, lists 9 tools, and calls `analyze_frame` broken for
every project. All three were false by the time this phase started — the router is mounted in
`main.py:43`, the registry held 25 tools, and `analyze_frame` reads the presigned https URL fine.
The plan was not followed; the real source was read instead, per root CLAUDE.md.

## Implementation

### 1. The preset vocabulary (command 1)
`apply_preset`'s only argument is `presetId`, a closed 7-value enum. The model saw seven bare
ids and nothing describing them, so any vibe word was a 1-in-7 guess. `<active_preset>` does not
help — it describes the preset being moved AWAY from.

`app/agent/preset_catalog.py` adds a `PresetInfo` per preset: a plain-English `look` and a
`keywords` vocabulary. It reaches the model twice — as a `<presets>` block in the **system**
channel (it is reference material, not per-request data, so it does not sit in the user turn
beside the command) and appended to `apply_preset`'s tool description.

It is a RESTATEMENT of `packages/shared/src/presets.ts`, which is TypeScript-only by design, so
drift is the risk. `test_talk_and_edit_tools.py` asserts the catalogue's ids are exactly
`PresetId`; adding or renaming a preset fails that test. `look` describes what a human can see
and deliberately restates no numbers.

### 2. Word ranges and size ramps (command 2)
- `select_word_range` (`context_tools.py`) resolves "from X to Y" in one call. Endpoints resolve
  exact → substring → fuzzy (reusing `_fuzzy`, not a second matcher); `fromNearMs`/`toNearMs`
  break ties by time. This matters on the real transcript: "like" occurs at 27.0 s (`w41`) and
  again at 28.4 s (`w46`). With the hint the range is `w41..w45`; without it, `w19..w45` — 27
  words. The alternative was the model counting between two `find_words` results, which the
  system prompt forbids.
- `ramp_caption_size` (`style_tools.py`) writes a DIFFERENT `fontSize` per word, interpolated
  linearly across the ids in order. `update_caption_style` cannot express this — its `patch` is
  one value for every id. Duplicate ids collapse (matching `build_word_patches`) and the ramp
  re-spreads over what survives, or every later word would land on the wrong step.
- "one word at a time" was already `set_single`; no new tool.

### 3. Seeing the video (command 3)

**`analyze_frame(target="face")` was returning the wrong thing.** It resolved "face" to the
Person label, documented as a deliberate decision on the grounds that DetectLabels has no
reliable face box. That is true of DetectLabels and false of Rekognition: `DetectFaces` is a
separate API that returns real face boxes. Verified live on a frame from this project at 53 s:

| | box (x, y, w, h in % of frame) |
|---|---|
| `DetectFaces` | 43.9, 21.8, 55.1, 51.2 |
| `DetectLabels` "Person" | 0.3, 1.1, 99.7, 98.7 |
| `DetectLabels` "Face"/"Head" | present as labels, **zero Instances** — no coordinates |

An angry emoji placed on the old answer covered the entire frame. `target="face"` now uses
`DetectFaces` with a 90% confidence floor. This is face DETECTION, not RECOGNITION: no face is
compared, stored, indexed or named, and no `SearchFaces`-family API is called.

**Hands have no Rekognition detector at all**, so `target="hand"` routes to Claude vision on
Bedrock — the fallback root CLAUDE.md's Stack section already names. A reply that is prose,
invalid JSON, or a box missing a key yields NO box rather than a repaired guess.

`vision_tools.boxes_at()` is the single entry point: grab one frame, route to the right
detector, normalise units (Rekognition returns 0–1 fractions, the vision model is asked for
percentages), sort largest-first.

**`scene_tools.py`** holds the two tools that take a time RANGE and loop internally:
- `place_sticker` — samples once per `everyMs`, and emits one `LayerItem` per sample that found
  something. `LayerItem` has no keyframes, so a sticker that follows a face is N adjacent items,
  each at its own sample's position. An item ends at the NEXT SAMPLE, not the next hit, so a
  second where the target was lost stays genuinely empty.
- `fit_captions_to_region` — groups the range's words into lines, and gives each line the box
  nearest its midpoint as position plus a fitted size. Every word in the range gets the x/y,
  because a caption line's anchor comes from its FIRST word (`CaptionRenderer.tsx:63`) and which
  word leads a line shifts as the project is edited.

Both loop inside ONE tool call. The alternative — the model calling `analyze_frame` per second —
costs a Bedrock round trip per sample and exhausts `MAX_TOOL_ITERATIONS` on a 5-second range.

### 4. The emoji sticker set
Nine stickers (angry, laugh, shock, heart, fire, skull, cool, star, thumbs_up), drawn by
`scripts/make_emoji.py` — a dev script using only `zlib`/`struct`/`math`, rendering at 3x and
box-filtering down for antialiasing. Nothing was added to `requirements.txt`.

Drawn rather than downloaded on purpose: Twemoji (CC-BY) and Noto Emoji (OFL) carry attribution
obligations and a fetch step. These are ours outright.

`emoji_assets.py` resolves what the user said (name, synonym, or the emoji character) to an
asset and uploads it into the project's own media prefix on demand. The `mediaId` is derived
from the asset name (md5, 12 hex), so `ensure_uploaded` is idempotent — placing the angry face
at ten timestamps uploads one object. A sticker is then an ordinary `LayerItem`: same prefix,
same id pattern, same `GET /projects/{id}/media/{mediaId}` redirect the editor already uses.

This narrows, but does not remove, the "you cannot add media" rule. The agent still cannot add
the USER's files. The system prompt now says so precisely.

## Files Created
- `services/api/app/agent/preset_catalog.py` — what each preset looks like, in creators' words.
- `services/api/app/agent/tools/scene_tools.py` — `place_sticker`, `fit_captions_to_region`.
- `services/api/app/agent/tools/emoji_assets.py` — sticker lookup + idempotent S3 upload.
- `services/api/scripts/make_emoji.py` — stdlib PNG generator for the sticker set (dev only).
- `services/api/assets/emoji/*.png` — the nine 256×256 RGBA stickers.
- `services/api/app/agent/tests/test_talk_and_edit_tools.py` — 64 checks over all of the above.
- `.claude/audits/ai-agent/phase-20-video-aware-editing.md` — this file.

## Files Modified
- `app/agent/tools/vision_tools.py` — STRUCTURAL: added `DetectFaces` and the Bedrock-vision
  detector, extracted `boxes_at`, corrected `target="face"`. Frame grabbing is unchanged.
- `app/agent/tools/context_tools.py` — additive: `select_word_range`.
- `app/agent/tools/style_tools.py` — additive: `ramp_caption_size`.
- `app/agent/tools/project_tools.py` — additive: catalogue appended to `apply_preset`'s description.
- `app/agent/tools/schemas.py` — additive: five new arg/result models; `AnalyzeFrameArgs.target`
  gains `"hand"`.
- `app/agent/tools/__init__.py` — imports `scene_tools` so its tools register.
- `app/agent/contracts.py` — additive: `ActivePreset.baseFontSize`.
- `app/agent/planner.py` — system prompt: a LOOKING AT THE VIDEO section, ramp-vs-restyle
  guidance, range guidance, corrected media/tracking claims; `<presets>` added to the system
  channel; `baseFontSize` shown in `<active_preset>`.
- `app/agent/tests/test_vision_tools.py` — replaced the test asserting face==person with four
  asserting the corrected behaviour.
- `app/agent/tests/test_tool_registry.py` — expected tool set grows by five.
- `services/api/Dockerfile` — `COPY assets ./assets`.
- `docker-compose.yml` — mounts `services/api/assets` read-only for local dev.
- `apps/web/src/lib/agent-api.ts`, `apps/web/src/hooks/useAgentCommand.ts` — send `baseFontSize`.

## Files Intentionally Untouched
- `packages/shared/src/project.ts` and `app/schema.py` — **no schema change was needed.**
  Per-word `x`/`y`/`fontSize`, `single`, and `LayerItem` already exist. The lead's sign-off is
  therefore not required.
- `packages/shared/src/presets.ts` — the catalogue restates it from Python; presets.ts is unchanged.
- `packages/shared/src/blocks.ts` — `_lines` implements only the gap + words-per-line rules and
  says so; mirroring all of `deriveBlocks` would be a second copy that can drift.
- `services/api/requirements.txt` — untouched, per CLAUDE.md.
- The other session's uncommitted landing-page work (`VoiceSphere.tsx`, `LandingNavbar.tsx`,
  `index.css`, `LandingPage.tsx`, `components/landing/*`, `.claude/audits/landing/`) — left
  unstaged and unmodified.
- `remotion/` (P2) — the export path is untouched; see Dependencies.

## Architecture
NEW: `preset_catalog.py`, `scene_tools.py`, `emoji_assets.py`, two detectors in `vision_tools.py`.

REUSED unchanged: `build_word_patches`/`resolve_words` (the commit-or-nothing word boundary),
`apply_patch` validation, `next_layer_id`/`MIN_ITEM_MS` from `layer_tools.py`, `_fuzzy` from
`context_tools.py`, `app.media._run` for ffmpeg, `app.s3` for storage, `bedrock_client` for the
vision call, and the whole frontend apply/persist path — `SET_LAYERS` and `UPDATE_WORD` were
already handled by `applyAgentPatches` (`useWordPatch.ts:306`), so no new write path exists.

## Interfaces / Contracts
Five new tools, all `ToolStatus.AVAILABLE`: `select_word_range`, `ramp_caption_size`,
`place_sticker`, `fit_captions_to_region` (+ `analyze_frame` gains `target="hand"`).

`ActivePreset.baseFontSize` is new and OPTIONAL — an older editor omitting it still works; the
model simply loses the anchor for per-word sizes.

No new environment variables. `BEDROCK_MODEL_ID` (already required) is now also used for vision;
`AWS_REGION` already governed Rekognition. No new production dependency.

## Ownership
`services/api/app/agent` is **P4's**, `services/api` is **P1's**; this was done from P3's branch
at the repo owner's explicit request, and flagged before starting. `apps/web` is P3's own.
P4 should review the planner prompt and the five tools; P1 should review the Dockerfile `COPY`,
the `assets/` mount, and server-side `put_object` into the project media prefix. No lead sign-off
is needed, because no shared schema changed.

## Validation
- Every range tool rejects a backwards range, a start past the end of the video, and a span over
  `MAX_RANGE_MS` (90 s, matching the clip limit).
- `place_sticker` refuses an unknown sticker BEFORE reading any video; refuses to exceed
  `MAX_LAYER_ITEMS` (40) and names the cause; and raises if NO sample found the target rather
  than placing the sticker somewhere plausible.
- `fit_captions_to_region` raises if no words fall in the range, and if nothing was ever found.
- A vision reply that is prose, bad JSON, or a box missing a key produces no box.
- A face below 90% confidence is dropped.
- `select_word_range` raises on an unresolvable endpoint naming the query — never silently
  defaulting to word one or word N, which would apply the change to a range nobody asked for.
- Every patch list still goes through `apply_patch`/`apply_patches` before returning.

## Security
- The frame is treated as DATA. The vision prompt explicitly instructs that any text or signs
  visible in the image are not instructions — the transcript rule, extended to pixels.
- No secrets added. Presigned URLs are still redacted out of errors by `_redact`.
- `DetectFaces` is used with `Attributes=["DEFAULT"]`: bounding box and confidence only, not the
  age/gender/emotion inferences the API can return and this product has no use for.
- Cost/abuse: each sampled second costs one ffmpeg range-read plus one Rekognition or Bedrock
  call. `MAX_RANGE_MS` and `everyMs`'s 200 ms floor bound a single call to at most 450 samples;
  a typical 5-second request is 5.
- Sticker uploads land under the project's own S3 prefix and are content-addressed by asset name,
  so a repeated command cannot grow storage without bound.

## Testing
Commands run, all inside the API container:
- `python -m app.agent.tests.test_talk_and_edit_tools` — **64 checks, all pass** (new).
- The other 13 agent suites — all pass: `test_router`, `test_planner`, `test_tool_config`,
  `test_tool_registry`, `test_vision_tools`, `test_word_tools`, `test_context_tools`,
  `test_mutation_tools`, `test_layer_tools`, `test_contracts`, `test_bedrock_client`,
  `test_livekit_token`, `test_voice`.
- `python -m pytest` — **130 passed**.
- `npx tsc --noEmit` in `apps/web` — clean.

Four suites broke and were FIXED, not weakened:
- `test_vision_tools` asserted face==person. That assertion encoded the bug; it was replaced by
  four tests pinning the corrected behaviour (real face box, confidence floor, the vision
  fallback, and malformed-reply handling).
- `test_tool_registry` pins the exact tool set; the five new names were added.
- `test_planner` and `test_router` assert the user message's exact shape. They failed because
  the catalogue was first put in the user turn. Moving it to the system channel — which is where
  reference material belongs — fixed both without touching either test.

## Live Verification
**Against real live external services** (running API on :8010, real S3, real Rekognition, real
Bedrock, real credentials), on project `6dc4e73ec499` (68.5 s, 132 words):
- ffmpeg range-read a frame from the presigned S3 URL at 53 s, 54 s and 66 s.
- `DetectFaces` returned a real face box at each; `DetectLabels` returned the Person box;
  Claude vision returned a hand box at 66 s. Frames were inspected visually — at 66 s the raised
  palm is on the left and the face on the right, and both boxes match.
- `place_sticker` over 51–56 s: face found in 5 of 5 samples, 5 items produced, x tracking
  52.8 → 59.2 → 71.5 → 59.6 → 67.9. The emoji PNG really uploaded to S3.
- `fit_captions_to_region` over 65–67.75 s: 3 lines, sizes 24.9 / 21.2 / 33.0 px against a 68 px
  base, each anchored on that moment's hand box.
- **All three user commands** run through `POST /agent/command`, each returning `status: "ok"`:
  command 1 → one `SET_PRESET` to `dhamaka`; command 2 → 5 `set_single` + a 68→160 px ramp over
  `w41..w45`; command 3 → one `SET_LAYERS` with 5 sticker items plus 9 `UPDATE_WORD` patches.
  The agent's own summary reported "Found your face in all 5 of 5 seconds".
- **Visual check**: the 53 s layer item was composited onto the real frame using the same
  geometry rule the editor applies (x/y = centre in %, width = % of frame width, aspect 1). The
  emoji lands squarely on the face.

**Against a real installed package, no live call**: the tool schemas are generated from the
Pydantic models, so what the model is shown cannot drift from what is accepted.

**NOT verified**: see below.

## Unverified / Untestable
- **The patches were never APPLIED to the stored project.** The agent is stateless and returns
  patches; the editor applies them. `SET_LAYERS` and `UPDATE_WORD` persistence is pre-existing,
  tested code (`useWordPatch.ts`), but this phase did not click through the browser to watch a
  sticker appear in the editor. That is the one remaining step for the feature owner.
- **Remotion export of a sticker layer** — untested here. Layer items already render in the
  export (`LAYERS.md` §Exporting), and a sticker is an ordinary image item, so this is expected
  to work, but expected is not verified. P2's area.
- **The fitted caption size is an ESTIMATE.** `AVG_CHAR_ADVANCE = 0.55` stands in for real font
  metrics, which live in the browser. Being wrong by 10% makes the captions 10% bigger or
  smaller than the box, not misplaced; `fillRatio` (0.9) is the margin. No measurement was made
  against the actual rendered text.
- **Hand detection quality is the vision model's judgement, not a measured detector.** At 66 s
  its box ran from 5–50% horizontally and 30–95% vertically, which includes the forearm below
  the palm, so the caption anchor sits nearer the wrist than the palm centre. Correct enough to
  be useful; not a calibrated hand detector, and it has no confidence score to threshold on.
- **Only one clip was exercised.** Every live check used project `6dc4e73ec499`.
- **The nine stickers were reviewed by eye** (rendered to a contact sheet), not against any
  visual regression baseline.

## Integration Status
- Agent router, all five tools, the catalogue and the sticker set: **connected** and live.
- Editor → agent (`baseFontSize`): **connected**, typechecked, not click-tested.
- Agent → editor persistence: **connected** via pre-existing code, not click-tested this phase.
- Remotion export of stickers: **not verified** (P2).
- Production image: `COPY assets ./assets` is in the Dockerfile but **no production build was
  run**; only the compose mount was exercised.

## Dependencies / Blockers
- **P1**: review the Dockerfile change and confirm a production build ships `assets/`. Nothing
  else blocks; no new dependency, no new env var.
- **P4**: review the planner prompt and the five tools, as the agent folder's owner.
- **P2**: confirm a sticker layer exports correctly from Remotion.
- Nothing blocks the three commands working locally today.

## Deviations
The stale plan file was not followed — see Objective. Two deliberate departures from earlier
recorded decisions, both documented in code at the point of change:
1. `target="face"` no longer resolves to the Person box. The previous decision was based on a
   correct fact about DetectLabels and an incorrect conclusion about Rekognition.
2. "The agent cannot add media" is now "the agent cannot add the USER's media." Built-in
   stickers are ours, so placing one invents no file. `add_overlay` remains DISABLED —
   nothing renders an overlay, and that has not changed.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `d3ced4b`. `git status` was reviewed: the working tree
also holds another session's uncommitted landing-page work (4 modified files under
`apps/web/src`, plus `components/landing/*` and `.claude/audits/landing/`). Those are unrelated,
pre-existing, were left untouched, and were deliberately NOT staged.

## Next Steps
1. **P3 (feature owner)**: open `/editor?id=6dc4e73ec499`, run the three commands in the command
   bar, and confirm the sticker appears over the face, the captions land on the hand, and one
   Ctrl+Z reverses each turn.
2. **P2**: export a clip with a sticker layer and confirm it renders.
3. **P1**: review the Dockerfile/compose change; run one production build to confirm `assets/`
   ships.
4. **P4**: review the prompt and tool surface.
5. Optional, if fitted captions read too small or too large in practice: measure real text width
   in the editor and pass it in, replacing `AVG_CHAR_ADVANCE`.
