# Phase 4 — Caption Mutation Tools

## Status
COMPLETE

## Objective
Implement real handlers for the five mutation tools
(`update_caption_style`, `move_caption`, `scale_caption`, `apply_preset`,
`add_overlay`), each producing an `AgentPatch`-shaped result validated
through Phase 1's `apply_patch` before being returned, with commit-or-
nothing behavior preserved — no planner, no Bedrock, no voice, no vision,
no new schema capabilities. See
[phase-01-agent-contracts.md](phase-01-agent-contracts.md) (contracts +
validation boundary),
[phase-02-tool-registry.md](phase-02-tool-registry.md) (registry
mechanism), and
[phase-03-context-tools.md](phase-03-context-tools.md) (the
remove-from-catalog/register-in-own-module pattern this phase repeats).

## Implementation

- **`tools/style_tools.py`** (new) — `update_caption_style`, `move_caption`,
  `scale_caption`. All three share one private helper,
  `_build_and_validate_style_patch(project, word_id, style_patch)`, which
  builds an `UpdateWordAction(wordId=..., patch=WordPatch(style=...))` and
  runs it through `app.agent.validation.apply_patch` — `apply_patch` never
  mutates `project`; its resulting (revalidated) `Project` is discarded once
  confirmed valid, and only the patch is returned. `move_caption` and
  `scale_caption` build a narrower `StylePatch` (`x`/`y` only, `fontSize`
  only, respectively) and go through the exact same helper — no separate
  mutation path.
- **`tools/project_tools.py`** (new) — `apply_preset` (builds/validates a
  `SetPresetAction`) and `add_overlay` (builds a real `Overlay` with a
  generated id, `overlay-<8 hex chars>`, then builds/validates an
  `AddOverlayAction`). `add_overlay` additionally checks `startMs < endMs`
  and `endMs <= project.durationMs` before ever constructing the overlay —
  checks Pydantic's per-field validation (`schemas.py`) can't express, since
  they're either cross-field or reference the specific project's duration.
- **`tools/catalog.py`** (modified) — all five `ToolSpec` entries removed;
  only `analyze_frame` remains `PLANNED`. Docstring updated to describe the
  now-established pattern (repeated from Phase 3) rather than predicting it.
- **`tools/__init__.py`** (modified) — now also imports `style_tools` and
  `project_tools`, so all 8 implemented tools register on package import.
- **`tests/test_mutation_tools.py`** (new) — see "Testing."
- **`tests/test_tool_registry.py`** (modified) — `EXPECTED_AVAILABLE_TOOLS`
  extended from Phase 3's 3 tools to all 8 now-implemented tools; same
  pattern as the Phase 3 update, same reasoning (see Phase 3's audit,
  "Deviations From Plan").

**Style properties used — no new schema fields invented.** Every field
`update_caption_style`/`move_caption`/`scale_caption` can set is one
`StylePatch` already declares in `app/schema.py`: `fontFamily`, `fontSize`,
`color`, `gradient`, `weight`, `uppercase`, `glow`, `shake`, `x`, `y`. No
zoom, spotlight, or other unrepresented effect was added — `StylePatch` is
imported and reused as-is, never extended.

## Files Created
- `services/api/app/agent/tools/style_tools.py`
- `services/api/app/agent/tools/project_tools.py`
- `services/api/app/agent/tests/test_mutation_tools.py`
- `.claude/audits/ai-agent/phase-04-mutation-tools.md` (this file)

## Files Modified
- `services/api/app/agent/tools/catalog.py` — removed the 5 now-implemented
  `ToolSpec` entries; only `analyze_frame` remains.
- `services/api/app/agent/tools/__init__.py` — added
  `from . import style_tools` and `from . import project_tools`.
- `services/api/app/agent/tests/test_tool_registry.py` — updated
  `EXPECTED_AVAILABLE_TOOLS`/`EXPECTED_PLANNED_TOOLS` to reflect that 8 of 9
  tools are now implemented (was 3 of 9 after Phase 3). The registration/
  lookup/duplicate/missing-tool mechanism assertions are untouched.

`contracts.py`, `validation.py`, `router.py`, `tools/registry.py`,
`tools/schemas.py`, `tools/context_tools.py`, `tools/errors.py`, and all
Phase 1–3 test files besides the one noted above are byte-for-byte
unchanged.

## Files NOT Modified
Same boundary as Phases 1–3:
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — no
  schema changes. Every mutation tool builds its result from `StylePatch`,
  `Overlay`, `PresetId` exactly as already defined.
- `services/api/app/pipeline/`, `services/api/app/main.py` — untouched.
- `apps/web/`, `remotion/` — untouched; out of scope for this phase.

## Architecture Decisions

1. **All three style tools funnel through one helper and one patch type
   (`UpdateWordAction`)**, per the approved plan's explicit tool-design
   principle (atomic, validated tools; `move_caption`/`scale_caption` as
   "thin wrappers" over the same mechanism `update_caption_style` uses).
   This means adding a future style-related tool (if ever needed) is a
   matter of choosing which `StylePatch` fields to expose, not writing a new
   mutation path.
2. **Tools never return a mutated `Project` — only the patch.** `apply_patch`
   is called purely to *validate* (confirm the resulting Project would be
   schema-valid); its return value is discarded. This matches the
   stateless-agent architecture (Phase 1, "the agent is stateless per
   request... no DynamoDB/session persistence") — there is nothing for this
   phase to persist, so there's nothing to return except the patch itself.
3. **`add_overlay`'s `reads` flag was corrected from `False` (Phase 2's
   provisional guess) to `True`.** Phase 2 catalogued it before any real
   logic existed and guessed it wouldn't need to read the project; the real
   handler does (`project.durationMs`, for the bounds check). Documented
   directly in the `ToolSpec.notes` field rather than silently changing the
   metadata.
4. **`add_overlay` validates its time range against `project.durationMs`,**
   not just that `startMs < endMs` — an overlay is meaningless if it extends
   past the actual video, and nothing in `Overlay`'s own schema (each field
   validated independently) could catch that; it's project-relative, so it
   has to be a handler-level check, following the exact same pattern
   Phase 3's `get_timeline` established for its own range check.
5. **No new `ToolExecutionError` subclasses per tool.** One error type
   (Phase 3's `ToolExecutionError`) carries a human-readable message for
   every "semantically invalid, individually valid fields" case across all
   five tools — consistent with Phase 3, and sufficient for a future
   planner to log "unsupported/invalid" without needing to branch on
   exception subtype.
6. **Zoom/spotlight/gradient-as-a-separate-tool were not built**, per this
   phase's explicit instruction and the approved plan's existing exclusion
   (`catalog.py`'s docstring, unchanged reasoning from Phase 2/3). Gradient
   remains available through `update_caption_style`'s general `StylePatch`
   (it's just the `gradient` field), not a dedicated tool — exactly the
   approved plan's recommendation.

## Interfaces / Contracts

No changes to `contracts.py`'s `AgentPatch` union, and no changes to any
`schemas.py` Args/Result model — every shape Phase 2 already declared for
these five tools is used as-is. What's new: real, callable handlers behind
them:
```python
from app.agent.tools import default_registry
from app.agent.tools.schemas import UpdateCaptionStyleArgs
from app.schema import StylePatch

handler = default_registry.get_handler("update_caption_style")
result = handler(UpdateCaptionStyleArgs(wordId="w1", patch=StylePatch(color="#FFE600")), project)
# result.patch == UpdateWordAction(type="UPDATE_WORD", wordId="w1", patch=WordPatch(style=StylePatch(color="#FFE600")))
```
Every tool's `result.patch` is a value from Phase 1's `AgentPatch` union,
directly usable by `app.agent.validation.apply_patches` (a future executor
step, Phase 6) or, once Phase 8 wires it up, directly dispatchable through
`apps/web`'s existing reducer with no translation.

## Validation

Layered exactly per the approved plan's "strict tool schemas" +
"every mutation validated" rules:
1. **Pydantic field validation** (reused `StylePatch`/`Overlay`/`PresetId`
   from `app/schema.py`, unchanged) rejects out-of-range values the moment
   a tool's `Args` model is constructed — before any handler runs.
2. **Handler-level semantic checks** catch what per-field validation can't:
   unknown `wordId` (all three style tools, via `apply_patch`'s referential
   check), inverted/out-of-bounds time range (`add_overlay`, checked
   directly against `project.durationMs`).
3. **Full-document revalidation** (`apply_patch`'s `Project.model_validate`
   on the complete merged result) is the final gate every mutation tool goes
   through before returning a patch — confirmed to be real, not decorative,
   by `test_apply_patch_still_catches_a_smuggled_invalid_value`, which uses
   `model_construct()` to bypass Pydantic's normal validation entirely and
   confirms the final revalidation still catches the resulting invalid
   document.
4. **No partial application, ever**: every handler either returns a fully
   valid result or raises before constructing one — there is no code path
   where a patch is returned that hasn't passed step 3.

## Security Considerations

Same posture as Phases 1–3: no LLM involvement in this phase, so no
prompt-injection surface. One property worth naming: **every mutation tool's
output is restricted to fields `StylePatch`/`Overlay`/`PresetId` already
define** — there is no code path, in this phase, by which a tool could
introduce an arbitrary key into a `Word`'s `style` or an `Overlay`, because
each tool builds its patch from a real `StylePatch`/`Overlay` Pydantic
instance, which silently drops unknown fields per Pydantic's normal
construction rules rather than accepting them. This is the concrete
mechanism behind "the LLM must never directly manipulate arbitrary Project
JSON" (approved plan, rule 3) for this phase's tools specifically.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/tools/style_tools.py services/api/app/agent/tools/project_tools.py services/api/app/agent/tools/catalog.py services/api/app/agent/tools/__init__.py services/api/app/agent/tests/test_mutation_tools.py services/api/app/agent/tests/test_tool_registry.py
python services/api/app/agent/tests/test_contracts.py      # Phase 1 — regression check
python services/api/app/agent/tests/test_router.py           # Phase 1 — regression check
python services/api/app/agent/tests/test_tool_registry.py    # Phase 2 — updated, see above
python services/api/app/agent/tests/test_context_tools.py    # Phase 3 — regression check
python services/api/app/agent/tests/test_mutation_tools.py   # Phase 4 — new
```

**Phases 1–3 regression check:** `test_contracts.py` (20/20),
`test_router.py` (6/6), `test_context_tools.py` (22/22) all re-run clean and
unchanged. `test_tool_registry.py` (19/19) — same 15 mechanism assertions
unchanged, 4 catalog-state assertions updated (as documented above).

**Phase 4 — `test_mutation_tools.py`** (47/47 checks passed), covering, per
tool: a valid mutation with patch-content correctness checks, an
invalid-input case with an explicit no-mutation-on-failure check, and (where
applicable) a construction-time rejection check for out-of-range Pydantic
fields — plus one cross-cutting defense-in-depth test
(`test_apply_patch_still_catches_a_smuggled_invalid_value`) and two registry-
integration tests (all five tools AVAILABLE and callable; `analyze_frame`
still the only PLANNED tool):
```
[PASS] update_caption_style returns an UPDATE_WORD patch
[PASS] patch targets the requested wordId
[PASS] patch carries the requested color
[PASS] patch carries the requested glow
[PASS] patch does not set unrelated style fields
[PASS] update_caption_style raises ToolExecutionError for an unknown wordId
[PASS] project is unchanged after the failure
[PASS] StylePatch(weight=50) is rejected at construction (schema requires 100-900)
[PASS] StylePatch(fontSize=-1) is rejected at construction (schema requires > 0)
[PASS] move_caption returns an UPDATE_WORD patch
[PASS] move_caption sets x
[PASS] move_caption sets y
[PASS] move_caption does not set fontSize/color
[PASS] move_caption raises ToolExecutionError for an unknown wordId
[PASS] project is unchanged after the failure
[PASS] MoveCaptionArgs rejects x > 100 at construction
[PASS] MoveCaptionArgs rejects negative y at construction
[PASS] scale_caption returns an UPDATE_WORD patch
[PASS] scale_caption sets fontSize
[PASS] scale_caption does not set x/y/color
[PASS] scale_caption raises ToolExecutionError for an unknown wordId
[PASS] project is unchanged after the failure
[PASS] ScaleCaptionArgs rejects fontSize=0 at construction
[PASS] apply_preset returns a SET_PRESET patch
[PASS] patch carries the requested presetId
[PASS] ApplyPresetArgs rejects an unknown presetId at construction
[PASS] project is unchanged (construction never even reached the handler)
[PASS] add_overlay returns an ADD_OVERLAY patch
[PASS] patch carries the requested text
[PASS] patch carries the requested time range
[PASS] patch overlay has a generated, non-empty id
[PASS] original project's overlay count is untouched by building the patch
[PASS] add_overlay raises ToolExecutionError when startMs >= endMs
[PASS] project is unchanged after the failure
[PASS] add_overlay raises ToolExecutionError when endMs exceeds durationMs
[PASS] project is unchanged after the failure
[PASS] apply_patch's final schema revalidation catches a smuggled invalid value
[PASS] project is unchanged after that failure too
[PASS] update_caption_style is registered as AVAILABLE
[PASS] update_caption_style's handler is retrievable without ToolNotImplementedError
[PASS] move_caption is registered as AVAILABLE
[PASS] move_caption's handler is retrievable without ToolNotImplementedError
[PASS] scale_caption is registered as AVAILABLE
[PASS] scale_caption's handler is retrievable without ToolNotImplementedError
[PASS] apply_preset is registered as AVAILABLE
[PASS] apply_preset's handler is retrievable without ToolNotImplementedError
[PASS] add_overlay is registered as AVAILABLE
[PASS] add_overlay's handler is retrievable without ToolNotImplementedError
[PASS] analyze_frame is the only remaining PLANNED tool

All checks passed.
```

**On the "schema validation failures" test category specifically:** given
the current schema's field-level constraints already reject out-of-range
values at `Args` construction time (before a handler ever runs), a
"referentially valid but schema-invalid" case isn't naturally reachable
through normal tool usage — this is a property of how strict `StylePatch`/
`Overlay`/`PresetId` already are, not a gap in this phase's tests. The
`model_construct()`-based smuggling test exercises the real fallback path
(full-document revalidation inside `apply_patch`) that would catch such a
case if one ever did occur (e.g. from a future code path that builds a patch
without going through normal Pydantic construction).

## Verification Result
**PASSED.** 47/47 new checks, plus 20/20 + 6/6 + 19/19 + 22/22 from Phases
1–3 re-confirmed (114/114 total across all five test files).

## Deviations From Plan

- **`catalog.py`, `tools/__init__.py`, and `test_tool_registry.py` were
  modified again**, for the same reason as Phase 3 (registration forbids
  duplicate names). Not a new deviation — the same, now-established pattern.
- **`add_overlay`'s `reads` flag was corrected** from Phase 2's provisional
  `False` to `True` once its real implementation showed it does read
  `project.durationMs`. A metadata correction, not a behavior change to
  anything previously relied upon (nothing consumed that flag's value yet).
- No scope deviations: no planner, no Bedrock/LLM calls, no voice, no
  vision, no new schema fields, nothing outside
  `services/api/app/agent/`.

## Dependencies / Blockers

- **Phase 5 (`analyze_frame`)** is the last catalog entry and will repeat
  the same removal pattern once implemented — no new blocker.
- **`analyze_frame` remains blocked on P1's video storage**, unchanged since
  Phase 1.
- **No executor/planner exists yet** to actually call these tools end-to-end
  from a real command — that's Phase 6. Every test in this phase calls a
  handler directly with hand-constructed `Args`, which is the correct scope
  for this phase but means "does the planner pick the right tool for a
  command" is entirely untested until Phase 6.

## Next Phase

**Phase 5 — Visual analysis contract** (`analyze_frame`): implement the
contract/shape-level handler per the approved plan (ffmpeg frame grab →
Rekognition DetectLabels), acknowledging it stays practically unusable until
P1's video storage exists. Will NOT be started until explicit approval
("Proceed to Phase 5").
