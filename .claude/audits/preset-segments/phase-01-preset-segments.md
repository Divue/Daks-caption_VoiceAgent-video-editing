# Preset Segments — Phase 1 Audit

Stretches of the video drawn with a preset other than the project's: schema, the one
shared resolve both renderers use, the API field, a timeline lane, and a range argument
on the agent's `apply_preset`.

Date: 2026-09-20. Branch: `master`. Seven commits, `a323a2b`..`2059a1c`.

---

## Status

Implemented across all five owned areas and verified: 41 TypeScript checks, 48 Python
checks (11 pytest + 37 agent-suite), 11 UI checks driven against the real editor in a real
browser, and 6 checks against **real rendered export frames**. The preview and the export
resolve identically (asserted frame by frame) AND the export's pixels were rendered and
compared by hash. NOT verified: a full MP4 encode (`renderMedia`; only single frames were
rendered) and a live Bedrock turn choosing the new range arguments.

## Objective

`Project` carried exactly one `presetId`, so a whole video had one caption look. The task
was to let a range of the video carry its own preset — additively, with no migration —
and to make the editor, the exporter, the API and the agent all agree about it.

The shape was specified by the repo owner before implementation: an optional
`presetSegments: { startMs, endMs, presetId, presetOverride? }[]` on `Project`, with each
segment carrying its own optional override, merged by the existing `resolvePreset`.

Two design questions were left open and are answered in **Deviations / Decisions** below:
where the boundary rule lives, and what `emphasisEveryBlocks` means when there are several.

## Implementation

### The data

`PresetSegment` in `packages/shared/src/project.ts`, mirrored in
`services/api/app/schema.py`. A word belongs to the segment containing its **startMs** —
one lookup, so a word straddling a boundary has exactly one answer. A word in no segment
falls back to `project.presetId` / `project.presetOverride`. A segment's `presetOverride`
**replaces** the project's rather than stacking on it, because two overrides merged in
sequence would make "clear this one key" depend on which level last wrote it.

Segments must be sorted, disjoint and non-empty. That rule is enforced on **both** sides
(`arePresetSegmentsValid`, and `Project._preset_segments_sorted_and_disjoint`) rather than
left to the renderers, because "which preset is this word in" must not depend on iteration
order in two different implementations.

The field is optional and additive, so every stored v2 document parses unchanged. Checked
against `MIGRATIONS` in `services/api/app/store/projects.py` (`SCHEMA_VERSION = 2`, one
entry, `1 -> 2`): no migration and no version bump are needed, and
`tests/test_preset_segments.py::test_absent_is_valid_and_needs_no_migration` asserts both
that the fixture parses with no key and that a round trip does not invent one.

### The resolve — one function, both renderers

`apps/web/src/lib/caption-timeline.ts` is new and is the only place segments become
drawing decisions:

```
buildCaptionTimeline(project, { mergeShorterThanMs })
  -> blocks, wordById, wordsOf, emphasisIds, promotedIds,
     presetOfBlock(blockId), presetAt(timeMs)
```

It partitions `project.words` into runs by segment, then per run calls the **existing**
`deriveBlocks` with that run's `wordsPerLine` and the **existing** `resolveEmphasis` with
that run's `emphasisEveryBlocks`, unioning the id sets. `packages/shared/src/blocks.ts`
and `emphasis.ts` are untouched.

Both renderers call it: `useCaptionBlocks` (editor) and `remotion/src/CaptionVideo.tsx`
(export). It sits in `apps/web/src/lib/` for the same reason `resolve-preset.ts` and
`layers.ts` do — the Remotion bundle aliases `@` to `apps/web/src`
(`remotion/server/bundle.mjs`), so the export imports the editor's copy rather than
keeping its own.

`findBlockIndexAt` moved from `hooks/useCaptionBlocks.ts` into this file and is re-exported
from its old path. It is pure, and both the composition and the check scripts needed it
without pulling in a module that reaches React.

### The renderer is unchanged

`CaptionRenderer` still takes `preset: Preset` as a prop and still draws exactly one block.
Both call sites now pass the preset of the block **on screen**:

- export: `timeline.presetOfBlock(blocks[findBlockIndexAt(blocks, timeMs)].id)`
- preview: the same, with this session's unsaved tweaks layered on
  (`App.tsx`'s `previewPreset`).

Fonts are collected across every block's preset, not one
(`collectFontFamilies([presets, …])`), so a typeface does not start loading when its
segment arrives and draw its first frames in the fallback.

### Editing scope

`PresetOverrideProvider` now resolves against the segment **at the playhead**: base preset,
stored override, and the session tweaks, all scoped there. `setOverride` writes to that
segment (whole-list) or to `project.presetOverride` when the playhead is outside every
segment. The session half is keyed by scope, so moving the playhead into another segment
drops it during render — the same rule, and the same reason, as switching preset.

`PresetPicker` follows the same rule and prints which of the two a click will change.
There is deliberately **no separate "selected range" state**: the lane seeks into a segment
when you touch it, so selecting one and moving the playhead into it are one gesture, and
the picker and the style panel cannot be editing different things.

### Writes

One `SET_PRESET_SEGMENTS` action, mirroring `SET_LAYERS` at every layer of the stack
(reducer, agent patch union, write queue, API route, store, `validation.py`). Whole-list
replace, `[]` removes the key. The reason is the `layers` reason, stronger: applying a
preset to a range **carves** the segments it lands on — trimming, splitting or removing any
number of them — so there is no per-item expression of it at all.

### The agent

`apply_preset` gains optional `startMs`/`endMs`. Without them it still emits `SET_PRESET`.
With them it emits `SET_PRESET_SEGMENTS` carrying the carved list, and leaves `presetId`
alone. The planner's `<active_preset>` data block now lists the segments after the resolved
look; `activePreset` is resolved by the editor at the playhead, so it stayed correct on its
own, but without the list the model cannot tell a second look exists.
`preset_catalog.py` is untouched.

## Files Created

| File | Purpose |
| --- | --- |
| `apps/web/src/lib/caption-timeline.ts` | Words -> blocks, emphasis and a preset per block. The one shared resolve. |
| `apps/web/src/lib/preset-segments.ts` | The segment arithmetic: normalise, carve, move, resize, remove. Pure. |
| `apps/web/src/hooks/usePresetSegments.ts` | One write of the whole list through the editor's write queue. |
| `apps/web/src/components/timeline/PresetLane.tsx` | The timeline lane: draw, move, resize, remove. |
| `apps/web/scripts/check-preset-segments.ts` | 41 checks: arithmetic, grouping, emphasis, preview-vs-export, schema. |
| `services/api/app/agent/tools/preset_segments.py` | Python mirror of `lib/preset-segments.ts`. |
| `services/api/app/agent/tests/test_preset_segments.py` | 37 checks, the same numeric cases as the TS suite. |
| `services/api/tests/test_preset_segments.py` | 11 pytest cases for the schema and the PATCH route. |
| `remotion/scripts/check-export-segments.mjs` | 6 checks against REAL RENDERED FRAMES: does a segment change the exported pixels. |
| `.claude/audits/preset-segments/phase-01-preset-segments.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `packages/shared/src/project.ts` | ADDITIVE: `PresetSegment`, `MAX_PRESET_SEGMENTS`, `arePresetSegmentsValid`, the optional field. |
| `services/api/app/schema.py` | ADDITIVE: the mirror plus a `model_validator` for the sorted/disjoint rule. |
| `apps/web/src/hooks/useCaptionBlocks.ts` | STRUCTURAL: now a thin wrapper over `buildCaptionTimeline`; `findBlockIndexAt` re-exported. |
| `apps/web/src/App.tsx` | STRUCTURAL: emphasis comes from the timeline; the preview draws with the active block's preset. |
| `apps/web/src/state/preset-override-context.tsx` | STRUCTURAL: scope is the playhead's segment; exposes `activeSegment` and `sessionOverride`. |
| `apps/web/src/state/project-reducer.ts` | ADDITIVE: `SET_PRESET_SEGMENTS`; `mergePresetOverride` exported. |
| `apps/web/src/hooks/useWordPatch.ts`, `lib/api.ts` | ADDITIVE: `presetSegments` on the project patch. |
| `apps/web/src/components/preview/CaptionRenderer.tsx` | Import path only (`findBlockIndexAt`). No behaviour change. |
| `apps/web/src/components/presets/PresetPicker.tsx` | STRUCTURAL: scoped to the playhead's segment; prints its scope. |
| `apps/web/src/components/timeline/Timeline.tsx` | ADDITIVE: the Preset lane and its track header. |
| `remotion/src/CaptionVideo.tsx` | STRUCTURAL: one preset -> the block's preset; fonts across all presets. |
| `services/api/app/routers/projects.py`, `store/projects.py` | ADDITIVE: one field, one branch. |
| `services/api/app/agent/contracts.py`, `validation.py` | ADDITIVE: `SetPresetSegmentsAction` and its apply branch. |
| `services/api/app/agent/tools/schemas.py`, `project_tools.py` | ADDITIVE: range args on `apply_preset`. |
| `services/api/app/agent/planner.py` | STRUCTURAL: `_active_preset_block` takes the project and lists segments. |
| `apps/web/package.json` | ADDITIVE: `check:segments`. |
| `remotion/package.json` | ADDITIVE: `check:export-segments`. |

## Files Intentionally Untouched

- `packages/shared/src/blocks.ts` and `emphasis.ts` — the whole point of deriving per
  segment is that neither needed a rule added. They are shared with the pipeline.
- `packages/shared/fixtures/demo-project.json` — the fixture still has no `presetSegments`
  key, which is what proves the field is additive.
- `services/api/app/agent/preset_catalog.py` — keyword matching works unchanged, and a
  test asserts `apply_preset` still carries the catalogue.
- `apps/web/src/lib/caption-style.ts`, `resolve-preset.ts` — the style resolver and the
  override merge already took a preset; nothing about them is per-video.
- `services/api/app/store/projects.py`'s `MIGRATIONS` — deliberately not extended. See
  **Validation**.
- `remotion/src/fonts.ts` — `collectFontFamilies` is a recursive walk, so an array of
  presets needed no change to it. Confirmed by a check, not assumed.

## Architecture

```
Project.presetSegments  (NEW, optional, additive)
        |
        v
buildCaptionTimeline()               <- NEW, apps/web/src/lib/caption-timeline.ts
  partition words by segment
    |-- deriveBlocks(run, wordsPerLine of that segment)     <- REUSED, unchanged
    |-- resolveEmphasis(run, blocks, everyBlocks of that segment) <- REUSED, unchanged
    \-- resolvePreset(PRESETS[id], override)                <- REUSED, unchanged
        |
        +--> useCaptionBlocks -> App.tsx ----> CaptionRenderer   (preview)  <- REUSED
        \--> CaptionVideo.tsx --------------> CaptionRenderer   (export)   <- REUSED
```

The only genuinely new logic is the partition and the carve arithmetic. Everything that
draws a pixel is code that already existed and already had tests.

## Interfaces / Contracts

**Schema** (`Project`, additive):

```ts
presetSegments?: { id: string; startMs: int; endMs: int;
                   presetId: PresetId; presetOverride?: PresetOverride }[]   // max 40
```

Sorted, disjoint, `endMs > startMs`. `MAX_PRESET_SEGMENTS = 40`, mirroring
`MAX_LAYER_ITEMS` and its reasoning (well inside the store's 350 KB document limit).

**API**: `PATCH /projects/{id}` accepts `presetSegments: [...]` — whole-list replace, `[]`
removes the key. An overlapping list is a **422** and does not bump the version.

**Agent**: `apply_preset(presetId, startMs?, endMs?)`; new patch type
`{ type: "SET_PRESET_SEGMENTS", presetSegments: [...] }`.

**Editor policy constant**: `MIN_SEGMENT_MS = 100` in `lib/preset-segments.ts`, mirrored in
`tools/preset_segments.py`. Not a schema rule — the schema's outer bound is still
`endMs > startMs`; this is the editor's and the agent's floor for a segment worth having.

No new environment variables, no new dependencies.

## Ownership

| Area | Owner | Commit |
| --- | --- | --- |
| `packages/shared/src/project.ts` + `services/api/app/schema.py` | **lead** — needs team agreement | `a323a2b` (both in one commit, as the rule requires) |
| `apps/web` | P3 | `045a7bc`, `678ffa0` |
| `remotion/` | P2 | `1e925d4` |
| `services/api` (route + store) | P1 | `1cb29bd` |
| `services/api/app/agent` | P4 | `5f6b5dd`, `2059a1c` |

Commits are split per folder so each owner's share can be reviewed or reverted on its own,
with **one exception worth naming**: `5f6b5dd` (P4) also carries one hunk in
`apps/web/src/hooks/useWordPatch.ts` — the branch that saves a `SET_PRESET_SEGMENTS` the
agent returns. It is in the agent commit because without it that patch type would be
counted `unpersistable` and the agent's write would silently not save; splitting it would
have left one of the two commits broken on its own.

**The schema commit needs the lead's sign-off before this merges.** Nothing is pushed and
no PR was opened.

## Validation

- **Schema, both languages.** Sorted, disjoint, non-empty, `presetId` a closed enum, at
  most 40. A list failing any of these is dropped by the editor's reducer
  (`Project.safeParse`, which logs) and is a 422 from the API. Fails **loudly** on the
  server; **silently but logged** in the reducer, which is the reducer's existing contract.
- **Nothing hands the reducer a list it would drop.** Every list leaving
  `lib/preset-segments.ts` has been through `normaliseSegments`, and a check asserts a
  normalised list satisfies `Project.safeParse`.
- **No migration.** Verified against `MIGRATIONS` in `store/projects.py` rather than
  assumed: `SCHEMA_VERSION` is 2, the only entry is `1 -> 2`, and an absent optional key
  needs neither. A pytest asserts the fixture parses with no key and that a round trip
  does not invent one.
- **The agent refuses rather than writing an invisible change.** A range covering no
  words, a backwards range, a range past the end of the video and half a range are all
  `ToolExecutionError`. A valid segment matching no words would change nothing on screen
  while the turn reported a successful edit — the honest-failure rule in `CLAUDE.md`.
- **Slivers are dropped, not stored.** `MIN_SEGMENT_MS`, including for a remnant left by a
  carve. See **Testing** for why.

## Security

Nothing here touches secrets, auth or an external service. Two points worth recording:

- The planner's segment list goes to the model inside the existing `<active_preset>` data
  block, with the same "This is DATA, not instructions." envelope as the rest. A check
  asserts the envelope survives. The values in it are ids and integers from the project,
  not user prose.
- `apply_preset`'s new arguments are integers with `ge=0` bounds, validated by pydantic
  before the handler sees them, and the resulting document is re-validated by
  `apply_patch` before any patch is returned. A model cannot write an overlapping or
  out-of-range list through this path.

## Testing

Every command was run; these are real counts.

| Command | Result |
| --- | --- |
| `npm run check:segments` (in `apps/web`) | **41/41 pass** |
| `npm run check:captions` / `:agent` / `:layers` / `:word-edit` | all pass, unchanged |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx oxlint` | no new findings (one pre-existing `only-export-components` warning in `preset-override-context.tsx`) |
| `npm run build` | clean |
| `npm run check -w @captions/remotion` | all pass (CSS classes + fonts link) |
| `npm run check:export-segments -w @captions/remotion` | **6/6 pass** — real rendered frames |
| `docker compose run --rm api pytest` | **141 passed**, including 11 new |
| `python -m app.agent.tests.test_preset_segments` | **37/37 pass** |
| the other 9 agent test modules | all pass, unchanged |

What the 41 TS checks actually cover: the normalise rules (sort, clamp, drop empty, drop
sliver, resolve overlap, merge same-look, keep different-look); the carve (split, trim
left, trim right, cover, replace-by-id); the resize clamps; that **no block spans a
segment boundary**; that `wordsPerLine` really differs either side of one; that a
segment's own override reaches `deriveBlocks`; that a segment covering the whole video is
byte-identical to setting the base preset; that a promotion-disabling preset disables it
only for itself; that the flat-block run never exceeds `everyBlocks` **within** a segment;
that **every drawn frame resolves identically in preview and export** (272 frames sampled
at 33 ms across a project with two segments and an override); that the fixture really
contains a block whose last word overhangs its segment, so that check is not vacuous; and
that the schema refuses what the arithmetic never produces.

### What the rendered frames prove

`check:segments` can only show that the two sides RESOLVE the same preset; it never renders
anything. `check-export-segments.mjs` renders real stills through the real bundle, the real
Chromium and the real `CaptionRenderer`, over the same background clip every time so a hash
difference can only be the captions:

- a segment covering the whole video is **byte-identical** to setting the base preset
  (`5f0563a4d2d73c00` both ways), and that is not trivially true because the base preset
  renders differently (`07129cb5b474f337`);
- **inside** a half segment the export uses the segment's preset, **outside** it the
  project's own, and those two frames genuinely differ;
- the render is deterministic — the same project and frame produce the same bytes.

Eyeballed as well as hashed: the frame inside the segment draws "ITNA / BEKAAR 😒" in
MrBeast's two-words-a-line yellow-and-red, which is not what Rangmanch draws.

### The bug the browser found

`check:segments` and the Python suite both passed before the UI existed. Driving the real
editor then found something neither could: dragging a segment's **start** edge past its
end clamped it to `endMs - 1`, leaving a **1 ms segment** that had silently replaced a
real one and that could not be clicked or removed. The lane had inlined its own clamps
instead of using the library — which is exactly how two implementations drift. Fixed with
`MIN_SEGMENT_MS` and three new library helpers, mirrored in Python, and covered in both
suites.

## Live Verification

**Verified against real installed code, no network:** everything in the table above. The
Python side was run inside the API container (root `CLAUDE.md` forbids installing these
deps on the host); moto stands in for AWS in the pytest suite, as it already did.

**Verified in a real browser:** the editor was served by Vite with
`VITE_USE_FIXTURE=true` and driven by headless Chrome over the DevTools Protocol —
**11/11 UI checks**: the lane is in the timeline; dragging empty lane space creates one
segment; it is labelled with its preset and its real times; the Presets tab opens; the
picker says *"Changing the segment at 0:07.7–0:18.5"* rather than "the whole video";
clicking the MrBeast card retargets **the segment**; the × removes it. A screenshot with
a segment in place shows the caption count going **25 -> 30**, which is the per-segment
grouping happening for real (MrBeast packs 2 words a line against Rangmanch's 3).

**Rendered for real:** eight stills at 1080x1920 through `@remotion/renderer`
(`selectComposition` + `renderStill`) against a bundle built by the project's own
`bundleComposition`. No API and no stored project were needed — the shared fixture is the
project and a bake-off clip is served over http for `OffthreadVideo`.

**Not verified against a live external service:** nothing here calls one.

## Unverified / Untestable

- **A full MP4 encode.** Single frames were rendered (`renderStill`), not a video
  (`renderMedia`), and no audio or encode path was exercised. That path is untouched by
  this change — the feature lives entirely in the caption layer, which is what was
  rendered — but nobody produced an .mp4 end to end. `remotion/scripts/still.mjs` and the
  render server still need a live API and a stored project, and the API is not deployed.
- **`remotion/src/` has no `tsconfig.json`.** It was typechecked with a temporary config
  that was then deleted; `CaptionVideo.tsx` came back clean. That run also surfaced four
  **pre-existing** errors in `Root.tsx` (an untyped `fps` prop), left untouched as out of
  scope. Nothing typechecks `remotion/src` in CI today.
- **A live Bedrock turn.** No model was asked to use the new range arguments. The tool
  schema, the description, the handler and the patch were all tested directly; whether a
  model reaches for `startMs`/`endMs` on "make the intro loud" is unknown.
- **Chrome extension automation** was unavailable in this environment, hence CDP.
- **`MAX_PRESET_SEGMENTS = 40` against the 350 KB document limit** is reasoned from
  `MAX_LAYER_ITEMS`, not measured. 40 segments each carrying a full `presetOverride` is
  larger than 40 layer items; it is still far from 350 KB, but nobody measured it.

## Integration Status

| Piece | Status |
| --- | --- |
| Schema (TS + Python) | connected, in one commit, **awaiting lead sign-off** |
| Editor: lane, picker, style panel, preview | connected, verified in a browser |
| Export (`CaptionVideo`) | connected and **verified in rendered pixels**; no full MP4 encode |
| API route + store | connected, 141 tests green; **not deployed** (unchanged from audit 12) |
| Agent tool + planner context | connected, tests green; **no live model turn** |

## Dependencies / Blockers

- **lead** — must agree the schema change (`project.ts` + `schema.py`, commit `a323a2b`)
  before any of this merges. Everything else depends on it.
- **P2** — nothing blocking. Frames are verified; a full `renderMedia` pass through the
  container would close the last of it.
- **P4** — should run the graded prompt catalogue with a range prompt ("make the first
  five seconds loud") to see whether the model reaches for the new arguments.
- **P1** — nothing blocking. The route works against moto; deployment is the same
  pre-existing blocker audit 12 records.

## Deviations / Decisions

Two questions the brief left open, answered here with reasoning.

**1. Boundary rule: derived per segment, NOT a fifth `deriveBlocks` break rule.**
The brief proposed adding "the word's preset segment differs" as rule 5. Rejected, for two
reasons found by reading the code:

- `wordsPerLine` is a *preset* property that `deriveBlocks` consumes as `maxWords`, a
  single argument. A break rule cannot make it time-dependent, so per-segment calls would
  be needed anyway and rule 5 would be redundant with them.
- `mergeShortBlocks`'s `canJoin` would need a matching guard. Without one, a short block
  at a boundary folds into its neighbour and the resulting block spans two presets — which
  has no drawable answer, since `CaptionRenderer` takes one preset per block.

Deriving per segment gives both properties for free and leaves `blocks.ts` and
`emphasis.ts` — lead-owned and shared with the pipeline — untouched. Asserted:
*"no block spans a segment boundary"*.

**2. `emphasisEveryBlocks`: one counter per segment.**
`resolveEmphasis` takes one `everyBlocks`; with segments there are several. It is run per
segment with that segment's own value and the id sets are unioned. The rule exists to stop
several blocks in a row going by with nothing emphasised **under one look** — flat body
text is what a preset's size/face/colour jump is there to break. A preset change is itself
that break, so the counter restarting at a boundary is what the rule means rather than an
approximation of it. It also stops `minimal` (`emphasisEveryBlocks: 0`) from disabling
promotion for the rest of the video, which a project-wide counter would have done.

**3. A deviation, found while implementing: the preview follows the BLOCK, not the
playhead.**
The natural reading of "scope everything to the playhead" is wrong for drawing. A word can
start before a segment boundary and end after it, so a block's span can reach past its own
segment; at the tail of such a block the playhead is already in the next segment while the
caption on screen still belongs to the previous one. The export draws by block, so a
playhead-driven preview would have differed from the MP4 for exactly those frames, with
nothing throwing anywhere. The preview therefore draws with `presetOfBlock`, and only
*editing* is playhead-scoped. Both behaviours are asserted, and the check that proves it
is built on a fixture chosen so a word really does overhang.

Everything else follows the brief. No schema field beyond `presetSegments` was needed.

## Git / Change Scope

Branch `master`, seven commits `a323a2b`..`2059a1c` plus the docs commit `6b5346b`, split
by owned folder (see **Ownership** for the one deliberate crossover). 28 files,
+1932/-149 excluding this audit. Nothing pushed, no PR opened.

**Uncommitted at the time of writing, at the repo owner's request** (they are committing
it themselves): `remotion/scripts/check-export-segments.mjs`, the
`check:export-segments` line in `remotion/package.json`, and this audit's render section.
That is P2's share and belongs in one commit of its own.

`git status` shows one unrelated modified file:
`.claude/audits/word-editing/phase-01-text-and-timing.md`, which was **already dirty at
the start of this session** and was left untouched — it is not in any of these commits.
A temporary `remotion/tsconfig.check.json` was created for a typecheck and deleted; it is
not in the tree or in any commit.

## Next Steps

1. **lead** — review and agree `a323a2b` (schema, both languages). Blocks everything else.
2. **P2** — run one full `renderMedia` (not just stills) of a project with two segments
   through the container, to exercise the encode path as well as the caption layer.
3. **P2 / P3** — give `remotion/src` a real `tsconfig.json` and fix the four pre-existing
   `Root.tsx` type errors, so the export is typechecked in CI rather than ad hoc.
4. **P4** — run the graded prompt catalogue with range prompts against live Bedrock.
5. **P3** — decide whether a segment should be creatable from the transcript selection as
   well as the lane ("apply this preset to these lines"). Not built; not required by the
   brief.
