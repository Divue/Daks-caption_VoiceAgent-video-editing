# Phase 2 — Tool Registry Skeleton

## Status
COMPLETE

## Objective
Build the registry structure and registration mechanism for the agent's
planned tools (per the approved plan's §6/§16), clearly distinguishing
tools that are documented-but-unimplemented from tools with a real,
callable handler — without implementing any tool's actual logic, the
planner, Bedrock calls, voice, or vision. See
[phase-01-agent-contracts.md](phase-01-agent-contracts.md) for the request/
response/patch contracts this phase builds on and does not change.

## Implementation

- **`tools/registry.py`** — the registry engine:
  - `ToolStatus` (`AVAILABLE` | `PLANNED`).
  - `ToolSpec` (frozen dataclass): `name`, `description`, `input_model`,
    `output_model` (both must be `BaseModel` subclasses, enforced in
    `__post_init__`), `reads`, `writes`, `status`, `notes`.
  - `ToolHandler` type alias: `Callable[[BaseModel, Project], BaseModel]` —
    args instance + current `Project` in, result instance out.
  - `ToolRegistry`: `register(spec, handler=None)`, `get_spec(name)`,
    `get_handler(name)`, `list_specs(status=None)`, `__contains__`, `__len__`.
  - Three exceptions: `ToolAlreadyRegisteredError`, `ToolNotFoundError`,
    `ToolNotImplementedError` — kept distinct so a caller (and, later, the
    planner) can tell "no such tool" apart from "known tool, not built yet."
  - `default_registry` — the shared instance the catalog populates and
    Phases 3–5 will register real handlers into.
- **`tools/schemas.py`** — argument/result **shapes only** (no behavior) for
  all 9 catalogued tools, built from `app/schema.py` types
  (`StylePatch`, `PresetId`, `Settings`) and Phase 1's `contracts.py` action
  types (`UpdateWordAction`, `SetPresetAction`, `AddOverlayAction`) so every
  mutation tool's declared result is literally "the patch it will produce,"
  not a separate parallel shape.
- **`tools/catalog.py`** — registers the approved plan's 9 MVP +
  `analyze_frame` tools into `default_registry`, all `ToolStatus.PLANNED`,
  all `handler=None`. Documents, in its module docstring, exactly which
  whiteboard-candidate tools were deliberately **not** catalogued
  (`trim_video`, `split_video`, `add_zoom`, `spotlight_caption`,
  `set_caption_effect`, `set_caption_gradient`) and why, referencing the
  approved plan rather than re-litigating it.
- **`tools/__init__.py`** — public surface; importing it triggers catalog
  registration as an import-time side effect (metadata only — no tool is
  executed by importing this package).
- **`tests/test_tool_registry.py`** — see "Testing."

## Files Created
- `services/api/app/agent/tools/registry.py`
- `services/api/app/agent/tools/schemas.py`
- `services/api/app/agent/tools/catalog.py`
- `services/api/app/agent/tools/__init__.py`
- `services/api/app/agent/tests/test_tool_registry.py`
- `.claude/audits/ai-agent/phase-02-tool-registry.md` (this file)

## Files Modified
None. Phase 1's `contracts.py`, `validation.py`, `router.py`, and its two
test files are byte-for-byte unchanged (imported from, not edited).

## Files NOT Modified
Same boundary as Phase 1, unchanged:
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — no
  schema changes. `tools/schemas.py` reuses `StylePatch`/`PresetId`/
  `Settings` from `app/schema.py` as-is.
- `services/api/app/pipeline/` — untouched.
- `services/api/app/main.py` — still not wired to the agent router (Phase 1
  deferred this; Phase 2 has no new reason to revisit it).
- `apps/web/`, `remotion/` — untouched; out of scope for this phase.

## Architecture Decisions

1. **`ToolSpec` is a plain frozen dataclass, not a Pydantic model.** It
   carries `type[BaseModel]` class references and (once available) a
   function reference — neither is JSON-serializable, and this registry is
   never sent over HTTP, unlike Phase 1's `contracts.py` models. Keeping it
   a dataclass makes clear it's an internal descriptor, not another wire
   contract.
2. **Registration enforces AVAILABLE⇔handler and PLANNED⇔no-handler as a
   hard invariant, not a convention.** `ToolRegistry.register` raises
   `ValueError` if a spec's status and handler-presence disagree. This is
   the concrete mechanism behind "do not fake tool implementations" — it is
   structurally impossible to register a `PLANNED` tool that also has a
   callable attached, so nothing can quietly pretend to work in this phase.
3. **No duplicate registration, ever — not even to "update" a tool.**
   `register()` raises `ToolAlreadyRegisteredError` on any existing name.
   This means Phase 3 (context tools) etc. cannot simply call
   `default_registry.register(...)` again for `get_project_context` — the
   catalog's `PLANNED` entry needs to be removed/replaced when a real
   handler is attached. Flagged explicitly in "Dependencies / Blockers" so
   Phase 3 isn't surprised by it.
4. **Tool results are expressed as "the patch they would produce" for every
   mutation tool** (`UpdateCaptionStyleResult.patch: UpdateWordAction`,
   etc.), reusing Phase 1's action types rather than inventing a second
   mutation representation. A future executor can validate a tool's output
   through the exact same `app.agent.validation.apply_patch` Phase 1
   already built, with no translation layer.
5. **The catalog explicitly excludes tools the approved plan already
   rejected or deferred** (§6/§6b), rather than registering them as
   `PLANNED` alongside the real MVP set. Registering a tool implies "we are
   building this"; `trim_video`/`add_zoom`/etc. aren't, per an existing team
   decision — cataloguing them as merely "not implemented yet" would
   misrepresent that as a scheduling gap rather than a scope decision.
6. **`ToolHandler`'s signature is committed to now**
   (`Callable[[BaseModel, Project], BaseModel]`) even though no handler
   exists yet, because every catalogued tool needs at least read access to
   the current `Project`, and guessing this now avoids Phase 3 needing a
   registry-engine change just to add its first real tool. Documented as
   revisitable if a later tool genuinely doesn't fit.

## Interfaces / Contracts

```python
# Registering a tool once it has a real implementation (Phase 3+):
from app.agent.tools import ToolSpec, ToolStatus, default_registry

def find_words_handler(args: FindWordsArgs, project: Project) -> FindWordsResult:
    ...

default_registry.register(
    ToolSpec(
        name="find_words", description="...",
        input_model=FindWordsArgs, output_model=FindWordsResult,
        reads=True, writes=False, status=ToolStatus.AVAILABLE,
    ),
    find_words_handler,
)

# Looking a tool up:
spec = default_registry.get_spec("find_words")          # ToolNotFoundError if unknown
handler = default_registry.get_handler("find_words")     # + ToolNotImplementedError if PLANNED
result = handler(FindWordsArgs(query="insane"), project)
```

Current catalog (all `ToolStatus.PLANNED`, no handlers):
`get_project_context`, `get_timeline`, `find_words`, `update_caption_style`,
`move_caption`, `scale_caption`, `apply_preset`, `add_overlay`,
`analyze_frame`.

## Validation

- `ToolSpec.__post_init__` validates `name` is non-empty and that
  `input_model`/`output_model` are actual `BaseModel` subclasses at
  construction time — a malformed spec cannot enter the registry at all.
- `ToolRegistry.register`'s AVAILABLE⇔handler invariant (see "Architecture
  Decisions" #2) is checked before anything is stored.
- No tool *arguments* are validated by this phase in the sense of "checking
  a real request" — that only matters once a handler exists to receive
  them (Phase 3+). What Phase 2 validates is the registry's own integrity:
  you cannot register garbage, duplicates, or a fabricated implementation.

## Security Considerations

Unchanged from Phase 1's posture: nothing in this phase touches an LLM,
executes a tool, or reads transcript/command text. The one new property:
**`ToolNotImplementedError` exists specifically so a future planner has a
distinguishable signal to log "unsupported" rather than silently doing
nothing or inventing a result** — the approved plan's rule 15 ("Unsupported
operations must be rejected/logged rather than hallucinated") is only
enforceable if "not implemented" is a distinct, catchable condition, which
it now is.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/tools/registry.py services/api/app/agent/tools/schemas.py services/api/app/agent/tools/catalog.py services/api/app/agent/tools/__init__.py services/api/app/agent/tests/test_tool_registry.py
python services/api/app/agent/tests/test_contracts.py    # Phase 1 — re-run to confirm no regression
python services/api/app/agent/tests/test_router.py         # Phase 1 — re-run to confirm no regression
python services/api/app/agent/tests/test_tool_registry.py  # Phase 2
```

**Phase 1 regression check:** both Phase 1 test scripts re-run clean —
20/20 and 6/6 checks passed, unchanged from the Phase 1 audit. Phase 2 did
not alter Phase 1's contracts or validation behavior.

**Phase 2 — `test_tool_registry.py`** (18/18 checks passed):
```
[PASS] registering an AVAILABLE tool with a handler succeeds
[PASS] get_spec returns the registered spec
[PASS] get_handler returns the registered handler
[PASS] registering a PLANNED tool with no handler succeeds
[PASS] get_handler on a PLANNED tool raises ToolNotImplementedError, not a fabricated result
[PASS] registering the same tool name twice raises ToolAlreadyRegisteredError
[PASS] the original registration was not overwritten/duplicated
[PASS] get_spec on an unregistered name raises ToolNotFoundError
[PASS] get_handler on an unregistered name raises ToolNotFoundError
[PASS] registering AVAILABLE with no handler is rejected (would be a fabricated tool)
[PASS] registering PLANNED with a handler is rejected (would fake an unimplemented tool)
[PASS] ToolSpec rejects a non-BaseModel input_model
[PASS] ToolSpec rejects an empty name
[PASS] default_registry contains exactly the approved MVP + analyze_frame tool set
[PASS] every catalogued tool is PLANNED (none fake-implemented in Phase 2)
[PASS] no tool is AVAILABLE yet — Phase 2 implements no tool logic
[PASS] every catalogued tool's get_handler() raises ToolNotImplementedError (no fabricated results)
[PASS] out-of-scope/deferred tools (trim_video, add_zoom, etc.) are not catalogued

All checks passed.
```
This covers every category asked for: registration (available-with-handler
and planned-without-handler), lookup, duplicate handling, and unsupported/
missing tools — plus catalog-level checks that the real tool set matches
the approved plan and that nothing is fake-implemented.

One cosmetic note: the Windows console rendered one em-dash in test output
as `�` (a terminal code-page display issue, not a string/logic bug — the
check still reported PASS correctly). Not something in the source needs
fixing.

## Verification Result
**PASSED.** 18/18 new checks, plus 26/26 Phase 1 checks re-confirmed with no
regression (44/44 total across all three test files).

## Deviations From Plan

- Same host-Python-instead-of-Docker note as Phase 1 (Docker daemon not
  running in this environment) — applies identically here; no new AWS/
  Bedrock dependency was introduced, so it's still a pure-Python
  verification.
- No deviations in scope: no tool logic, no planner, no Bedrock, no voice,
  no vision, no changes outside `services/api/app/agent/`.

## Dependencies / Blockers

- **Attaching a real handler in Phase 3/4/5 requires removing the matching
  `PLANNED` entry from `catalog.py` first**, since `register()` rejects
  duplicate names by design (see "Architecture Decisions" #3). This is a
  known, intentional friction point for the next phase, not a bug to fix
  now.
- **`analyze_frame`'s catalog entry is contract-only and will stay that way
  after Phase 5** implements its handler shape, because no `Project` in
  this repo has a backend-readable `videoUrl` yet (same P1 storage
  dependency identified in the approved plan, unchanged since Phase 1).
- Everything else in the catalog (`get_project_context`, `get_timeline`,
  `find_words`, `update_caption_style`, `move_caption`, `scale_caption`,
  `apply_preset`, `add_overlay`) has no external dependency — each is
  buildable entirely against a `Project` already in hand, same conclusion
  as the approved plan's §14/§19.

## Next Phase

**Phase 3 — Read-only context tools** (`get_project_context`, `get_timeline`,
`find_words`): real handlers, registered as `ToolStatus.AVAILABLE`. Will NOT
be started until explicit approval ("Proceed to Phase 3").
