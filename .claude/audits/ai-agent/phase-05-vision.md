# Phase 5 — Visual Analysis Contract (`analyze_frame`)

## Status
COMPLETE (implementation is real and production-ready; the tool is
practically unusable today because of an external dependency — see "Media
Dependency" below, not a defect in this phase's work)

## Objective
Implement a real `analyze_frame` handler using the architecture decided in
root `CLAUDE.md`'s Stack section (ffmpeg frame grab → Rekognition
DetectLabels), with no fabricated frame content or analysis results, and an
honest `ToolExecutionError` when the required video isn't backend-reachable
— rather than a mock or a permanently-stubbed placeholder. See
[phase-01-agent-contracts.md](phase-01-agent-contracts.md) through
[phase-04-mutation-tools.md](phase-04-mutation-tools.md) for the contracts,
registry, and validation boundary this phase builds on.

## Implementation

- **`tools/vision_tools.py`** (new):
  - `_resolve_media_location(project)` — the honest-failure boundary.
    Returns `project.videoUrl` if it's an `s3://` URI; otherwise raises
    `ToolExecutionError` naming the actual `videoUrl` value and explaining
    why (no video storage integration exists yet — a P1 dependency, not a
    bug here).
  - `_grab_frame_bytes(s3_uri, at_ms)` — **real** implementation: downloads
    the object from S3 via `boto3`, then runs a real `ffmpeg` subprocess to
    extract one JPEG frame at the requested timestamp. No synthetic bytes
    anywhere in this path.
  - `_detect_labels(frame_bytes)` — **real** implementation: a real
    `boto3` Rekognition `detect_labels` call over the frame bytes, returning
    the raw `Labels` response list unmodified.
  - `analyze_frame(args, project, *, grab_frame=_grab_frame_bytes,
    detect_labels=_detect_labels)` — the registered handler. Checks
    `args.atMs <= project.durationMs`, resolves the media location, calls
    `grab_frame`/`detect_labels` (the real functions by default), then
    filters the returned labels to `"Person"` instances with a
    `BoundingBox`, normalizing each to 0–100 x/y/width/height (matching
    `Style.x`/`y`'s existing units, so a box is directly usable by
    `move_caption` with no unit conversion).
  - Registered as `ToolStatus.AVAILABLE` — it has a real handler, which is
    the registry's own hard invariant from Phase 2 (`AVAILABLE` requires a
    handler; `PLANNED` forbids one). "Available" here means "really
    implemented," not "currently produces a result" — see "Media
    Dependency."
- **`tools/catalog.py`** (modified) — the `analyze_frame` entry removed
  (same remove-from-catalog pattern as Phases 3–4). `_PLANNED_TOOLS` is now
  an **empty list**: every tool in the approved MVP set has a real handler.
  The file and its registration loop are kept (not deleted) as the
  canonical place a *future* tool would be catalogued before it has one.
- **`tools/__init__.py`** (modified) — now also imports `vision_tools`.
- **`tests/test_vision_tools.py`** (new) — see "Testing."
- **`tests/test_tool_registry.py`** (modified) — `EXPECTED_AVAILABLE_TOOLS`
  now includes `analyze_frame`; `EXPECTED_PLANNED_TOOLS` is now empty. Same
  pattern as Phases 3–4.
- **`tests/test_mutation_tools.py`** (modified) — Phase 4's
  `test_analyze_frame_is_still_the_only_planned_tool` asserted an exact
  PLANNED set that included `analyze_frame`; renamed and narrowed to only
  assert Phase 4's own 5 tools aren't PLANNED, so it doesn't need updating
  again for unrelated future phases. See "Deviations From Plan."

**Target-label design decision (documented in `vision_tools.py`'s module
docstring):** Rekognition DetectLabels' `"Person"` label with per-instance
`BoundingBox` is well-established and reliable; a distinct, reliable
`"face"`-specific label with its own bounding boxes is not something
DetectLabels alone guarantees (that's Rekognition's separate `DetectFaces`
API, which root `CLAUDE.md`'s Stack decision does not name and this phase
does not add). The originally approved architecture plan is also explicit
that face recognition is out of scope ("no object tracking ..., no face
recognition"). So `target="face"` currently resolves via the same
`"Person"`-label lookup as `target="person"` — this is a documented,
deliberate simplification, not a bug or an unverified claim about
Rekognition's label taxonomy for faces.

## Files Created
- `services/api/app/agent/tools/vision_tools.py`
- `services/api/app/agent/tests/test_vision_tools.py`
- `.claude/audits/ai-agent/phase-05-vision.md` (this file)

## Files Modified
- `services/api/app/agent/tools/catalog.py` — `analyze_frame` entry
  removed; `_PLANNED_TOOLS` is now empty.
- `services/api/app/agent/tools/__init__.py` — added
  `from . import vision_tools`.
- `services/api/app/agent/tests/test_tool_registry.py` — catalog-state
  assertions updated (all 9 tools now AVAILABLE, 0 PLANNED).
- `services/api/app/agent/tests/test_mutation_tools.py` — one Phase-4-era
  assertion renamed/narrowed (see "Deviations From Plan").

All other Phase 1–4 files (`contracts.py`, `validation.py`, `router.py`,
`tools/registry.py`, `tools/schemas.py`, `tools/context_tools.py`,
`tools/style_tools.py`, `tools/project_tools.py`, `tools/errors.py`, and
`tests/test_contracts.py`, `tests/test_router.py`,
`tests/test_context_tools.py`) are byte-for-byte unchanged.

## Files NOT Modified
Per this phase's explicit instructions:
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — no
  schema changes.
- `services/api/app/pipeline/` — P1's pipeline untouched; `analyze_frame`
  does not call into it, and does not implement any upload/storage logic
  itself (see "Media Dependency").
- `services/api/app/main.py` — untouched.
- `apps/web/`, `remotion/` — untouched.

## Media Dependency

**Confirmed directly (not assumed) for this audit:** every fixture in
`packages/shared/fixtures/` was inspected —
`demo-project.json` → `"demo.mp4"`, `angry-project.json` → `"Angry.mp4"`,
`excited_long_texts-project.json` → `"Excited_long_texts.mp4"`,
`normal-project.json` → `"Normal.mp4"`, `real_reel-project.json` →
`"Real_reel.mp4"`. **None is an `s3://` URI.** This means `analyze_frame`,
as implemented, will raise `ToolExecutionError` against every real Project
in this repository today — this is the correct, intended, "fail honestly"
behavior this phase's instructions explicitly require, not a gap to close
in this phase.

**Forward compatibility (explicitly designed for):** the moment a `Project`
exists with a real `videoUrl` of the form `s3://bucket/key`, `analyze_frame`
requires zero code changes to start working for real — `_resolve_media_location`
already accepts that exact shape, and `_grab_frame_bytes`/`_detect_labels`
are already real, unmocked AWS calls. Nothing about this phase's
implementation assumes anything false about P1's eventual storage format
beyond "an s3:// URI," which is the format root `CLAUDE.md`'s own Stack
section already commits to ("Storage: S3 (media)").

## Architecture Decisions

1. **Dependency injection at the I/O boundary (`grab_frame`/`detect_labels`
   keyword parameters, defaulting to the real implementations).** This
   phase's instructions require both "use only real media input... never
   fabricate" in production AND tests that don't need real AWS credentials
   or real uploaded video. Those two requirements are only simultaneously
   satisfiable by separating "the real implementation exists and is the
   default" from "tests substitute a double at a narrow, explicit seam" —
   which is what this does. A hidden `if TESTING:` branch or an
   environment-variable-gated fake inside production code would have been
   the wrong shape: it would put test-only logic inside the production
   module itself, which this phase's instructions explicitly forbid
   ("Do not fake Rekognition responses in production code").
2. **`_resolve_media_location`'s check runs before any I/O**, so the "media
   unavailable" case (true for every real Project today) is cheap and
   requires no network/subprocess calls to detect — consistent with the
   fail-fast pattern established in Phase 3/4's handlers (`get_timeline`'s
   range check, `add_overlay`'s duration check).
3. **`target="face"` maps to the same `"Person"` label lookup as
   `target="person"`**, rather than guessing at Rekognition's label
   taxonomy for faces or adding a second AWS API (`DetectFaces`) that
   wasn't part of the decided Stack. Documented in the module docstring so
   this isn't mistaken for an oversight later.
4. **`catalog.py`'s registration loop is kept even though its list is now
   empty**, rather than deleting the file. If a genuinely new tool is
   proposed later (beyond the approved MVP set), it has an obvious,
   already-working place to be catalogued as `PLANNED` before it has a
   handler — deleting the mechanism now would mean re-inventing it.

## Interfaces / Contracts

No changes to `AnalyzeFrameArgs`/`AnalyzeFrameResult`/`BoundingBox` from
Phase 2 — all three shapes are used exactly as already declared. What's new
is the real, callable handler:
```python
from app.agent.tools import default_registry
from app.agent.tools.schemas import AnalyzeFrameArgs

handler = default_registry.get_handler("analyze_frame")
result = handler(AnalyzeFrameArgs(atMs=1200, target="person"), project)
# raises ToolExecutionError today for every real Project (no s3:// videoUrl yet)
# once a Project has one: AnalyzeFrameResult(found=True, boxes=[BoundingBox(...)])
```

## Validation

1. **Argument-level** (`schemas.py`, unchanged): `atMs >= 0`, `target` is a
   closed `Literal["person", "face"]`.
2. **Handler-level semantic checks** (new, this phase): `atMs <=
   project.durationMs`; `videoUrl` must be an `s3://` URI
   (`_resolve_media_location`); a malformed `s3://` URI (missing bucket or
   key) is rejected by `_parse_s3_uri`.
3. **Execution-level**: `ffmpeg` failures (`CalledProcessError`,
   `FileNotFoundError` if ffmpeg isn't installed) are caught and re-raised
   as `ToolExecutionError` rather than propagating a raw subprocess
   exception or, worse, silently returning an empty/fabricated result.
4. **Output shape**: every `BoundingBox` is built from Pydantic's own
   `Field(ge=0, le=100)` constraints (Phase 2's `schemas.py`, unchanged) —
   a Rekognition box outside the expected `[0, 1]` fractional range would
   fail construction rather than silently producing an out-of-range percent
   value.

`apply_patch`/commit-or-nothing (Phase 1) does not apply here in the same
sense as Phase 4's mutation tools: `analyze_frame` is a **read-only** tool
(`reads=True, writes=False`, unchanged from Phase 2's original metadata) —
it never produces an `AgentPatch` and never touches `project` at all beyond
reading `durationMs`/`videoUrl`. There is nothing for it to commit or roll
back; "no mutation" is trivially true because no mutation is attempted.

## Security Considerations

Same posture as Phases 1–4: no LLM involvement in this phase. One property
specific to this tool: **no user-controlled string ever reaches a shell or
is interpolated into a command.** The `ffmpeg` subprocess call uses
`subprocess.run` with an argument list (no `shell=True`, no string
concatenation) — `project.videoUrl` only ever contributes to an S3
bucket/key lookup via `boto3` (a structured API call, not a shell command),
and the only value derived from `args.atMs` that reaches `ffmpeg` is a
number formatted as `"{seconds:.3f}"`, not raw user text.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/tools/vision_tools.py services/api/app/agent/tools/catalog.py services/api/app/agent/tools/__init__.py services/api/app/agent/tests/test_vision_tools.py services/api/app/agent/tests/test_tool_registry.py services/api/app/agent/tests/test_mutation_tools.py
python services/api/app/agent/tests/test_contracts.py      # Phase 1 — regression check
python services/api/app/agent/tests/test_router.py           # Phase 1 — regression check
python services/api/app/agent/tests/test_tool_registry.py    # Phase 2 — updated, see above
python services/api/app/agent/tests/test_context_tools.py    # Phase 3 — regression check
python services/api/app/agent/tests/test_mutation_tools.py   # Phase 4 — one assertion updated, see above
python services/api/app/agent/tests/test_vision_tools.py     # Phase 5 — new
```

**Phases 1–4 regression check:** `test_contracts.py` (20/20),
`test_router.py` (6/6), `test_context_tools.py` (22/22) unchanged and clean.
`test_tool_registry.py` (19/19) and `test_mutation_tools.py` (47/47) — both
have the one documented assertion update each; every other assertion in
both files is untouched and still passes.

**Phase 5 — `test_vision_tools.py`** (21/21 checks passed):
```
[PASS] at least one fixture exists to test against
[PASS] analyze_frame raises ToolExecutionError against every real fixture (none has an s3:// videoUrl)
[PASS] the error message mentions the actual videoUrl value, not a generic failure
[PASS] the error message mentions s3, the actual requirement
[PASS] analyze_frame raises ToolExecutionError when atMs is past durationMs
[PASS] _parse_s3_uri raises ToolExecutionError for a URI missing a key
[PASS] _parse_s3_uri correctly splits a well-formed URI
[PASS] found=True when a Person instance with a bounding box is present
[PASS] exactly one box is returned
[PASS] box.label is 'Person'
[PASS] box.x is normalized to 0-100 (Left=0.3 -> 30.0)
[PASS] box.y is normalized to 0-100 (Top=0.1 -> 10.0)
[PASS] box.width is normalized to 0-100 (Width=0.4 -> 40.0)
[PASS] box.height is normalized to 0-100 (Height=0.6 -> 60.0)
[PASS] found=False when no matching label is present
[PASS] boxes is empty when nothing is found
[PASS] target='face' currently resolves via the same Person-label lookup as target='person'
[PASS] grab_frame defaults to the real _grab_frame_bytes function
[PASS] detect_labels defaults to the real _detect_labels function
[PASS] analyze_frame is registered as AVAILABLE
[PASS] analyze_frame's handler is retrievable without ToolNotImplementedError
[PASS] catalog.py's planned-tool list is now empty (every MVP tool has a real handler)

All checks passed.
```

**What's genuinely exercised without AWS credentials/real video, and why
that's legitimate, not a shortcut:**
- The media-unavailable path runs the **real, unmocked**
  `_resolve_media_location` against every real fixture in the repo — this
  needs no credentials because it fails before any network call, which is
  exactly the behavior being verified.
- The bounding-box normalization/filtering logic is real production code,
  exercised with injected `grab_frame`/`detect_labels` doubles standing in
  for the network boundary only — never faking what `analyze_frame` itself
  does with the data once it has it.
- A dedicated test (`test_production_defaults_are_the_real_implementations`)
  confirms, via `inspect.signature`, that the function's actual default
  parameters are the real `_grab_frame_bytes`/`_detect_labels` — i.e. that
  the injection seam used for testing is never what runs in production.

**What is NOT tested, honestly stated:** the real `_grab_frame_bytes`
(actual S3 download + actual ffmpeg subprocess) and real `_detect_labels`
(actual Rekognition API call) have not been executed end-to-end against a
real video in this phase — doing so would require AWS credentials and a
real uploaded video, which this phase's instructions explicitly say not to
require. This is a known, stated gap, not a claim of full coverage.

## Verification Result
**PASSED.** 21/21 new checks, plus 20/20 + 6/6 + 19/19 + 22/22 + 47/47 from
Phases 1–4 re-confirmed (135/135 total across all six test files).

## Deviations From Plan

- **`test_mutation_tools.py` was modified** — Phase 4's
  `test_analyze_frame_is_still_the_only_planned_tool` hard-coded an exact
  PLANNED set that included `analyze_frame`; since Phase 5 legitimately
  implements it, that assertion would fail. Renamed to
  `test_this_phases_five_tools_did_not_leave_anything_planned_that_they_own`
  and narrowed to only check Phase 4's own 5 tools aren't PLANNED, so it
  reflects what Phase 4 actually owns rather than needing another edit for
  every future phase. Flagged explicitly, not silently changed.
- Same host-Python-instead-of-Docker note as every prior phase; no AWS
  credentials were used (as required by this phase's instructions) — the
  real AWS/ffmpeg code paths exist but were not executed.
- No scope deviations: no planner, no LLM calls for planning, no voice, no
  new schema fields, nothing outside `services/api/app/agent/`.

## Dependencies / Blockers

- **P1's video storage/upload integration** remains the sole blocker to
  `analyze_frame` ever producing a real result — unchanged since Phase 1.
  No project in this repo will have an `s3://` videoUrl until that exists.
- **The Bedrock-vision fallback** named in root `CLAUDE.md`'s Stack
  ("fallback: Claude vision on Bedrock") is **not implemented** in this
  phase. Only the DetectLabels path exists. If Rekognition access isn't
  available in the shared dev AWS account, or its cost/quota is a concern,
  implementing the fallback is future work — not silently assumed to exist.
- **End-to-end verification against a real S3 object and real Rekognition
  call has never been performed** (see "Testing" — explicitly out of this
  phase's required scope, but worth doing once P1's storage exists, ideally
  by whoever owns that integration test).
- With this phase complete, **every tool in the approved MVP set now has a
  real handler** — `catalog.py`'s `PLANNED` list is empty. Phase 6 (planner/
  executor) is the first phase that will actually call these tools from a
  real command rather than via hand-constructed `Args` in tests.

## Next Phase

**Phase 6 — Planner/executor (Bedrock tool-use loop):** the first phase
that calls Bedrock, implementing prompt analysis, tool selection, and the
execution loop that turns a real natural-language command into calls
against the tools built in Phases 3–5. Will NOT be started until explicit
approval ("Proceed to Phase 6").
