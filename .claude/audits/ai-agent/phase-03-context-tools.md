# Phase 3 — Read-Only Context Tools

## Status
COMPLETE

## Objective
Implement real, callable handlers for the three read-only context tools
(`get_project_context`, `get_timeline`, `find_words`), registering each as
`ToolStatus.AVAILABLE` in the Phase 2 registry — with no planner, no
Bedrock/LLM calls, no voice, no vision, and no mutation tools. See
[phase-01-agent-contracts.md](phase-01-agent-contracts.md) and
[phase-02-tool-registry.md](phase-02-tool-registry.md) for the contracts and
registry mechanism this phase builds on.

## Implementation

- **`tools/context_tools.py`** (new) — three real handlers:
  - `get_project_context(args, project)` — reads `project.durationMs`,
    `width`, `height`, `presetId`, `settings`, and `len(project.words)`
    directly off the already-validated `Project`. No arguments needed.
  - `get_timeline(args, project)` — returns words in timeline order,
    optionally windowed to `[fromMs, toMs]`. A word is included if its span
    *overlaps* the window (`endMs > fromMs` and `startMs < toMs`), not only
    if it starts inside it. Raises `ToolExecutionError` if both bounds are
    given and `fromMs > toMs`.
  - `find_words(args, project)` — case-insensitive `exact` or `contains`
    match against word text, matching `apps/web`'s own
    `TranscriptPanel.tsx` search convention (`.toLowerCase()` substring
    match) rather than inventing a new rule. Raises `ToolExecutionError` for
    a query that's blank after trimming (Pydantic's `min_length=1` only
    rejects an empty string, not all-whitespace). Zero matches is a normal
    **result** (`matches: []`), not an error — per the approved plan's
    prompt-analysis rules (§5), deciding what to do about "nothing found" is
    the future planner's job, not this tool's.
  - All three are registered as `ToolStatus.AVAILABLE` with their real
    handler at the bottom of the same module.
- **`tools/errors.py`** (new) — `ToolExecutionError`, for a handler to raise
  when arguments are individually valid (Pydantic already checked that) but
  don't make sense together (e.g. `get_timeline`'s time range) or against
  the current project. Kept distinct from `registry.py`'s
  `ToolNotFoundError`/`ToolNotImplementedError`, which are about registry
  lookup, not execution.
- **`tools/catalog.py`** (modified) — removed the three
  `get_project_context`/`get_timeline`/`find_words` `ToolSpec` entries
  (they now register themselves as `AVAILABLE` in `context_tools.py`
  instead); updated the module docstring to describe the mechanism actually
  used (see "Deviations From Plan").
- **`tools/__init__.py`** (modified) — now also imports `context_tools`, so
  importing `app.agent.tools` registers both the remaining planned tools
  and the three real ones.
- **`tests/test_context_tools.py`** (new) — see "Testing."
- **`tests/test_tool_registry.py`** (modified) — three assertions that
  described a Phase-2-specific snapshot ("nothing is AVAILABLE yet") were
  updated to reflect that 3 of 9 tools are now legitimately AVAILABLE; see
  "Deviations From Plan" for why this is a documented, expected update, not
  a silent change to Phase 2's actual contracts.

## Files Created
- `services/api/app/agent/tools/context_tools.py`
- `services/api/app/agent/tools/errors.py`
- `services/api/app/agent/tests/test_context_tools.py`
- `.claude/audits/ai-agent/phase-03-context-tools.md` (this file)

## Files Modified
- `services/api/app/agent/tools/catalog.py` — removed 3 of 9 `ToolSpec`
  entries (the ones now implemented elsewhere); docstring updated.
- `services/api/app/agent/tools/__init__.py` — added
  `from . import context_tools`.
- `services/api/app/agent/tests/test_tool_registry.py` — updated 3
  snapshot-style assertions (see above); the other 15 assertions,
  covering the actual registration/lookup/duplicate/missing-tool
  mechanism, are untouched and still pass.

`contracts.py`, `validation.py`, `router.py`, `tools/registry.py`,
`tools/schemas.py`, `tests/test_contracts.py`, and `tests/test_router.py`
are byte-for-byte unchanged from Phase 1/2.

## Files NOT Modified
Same boundary as Phases 1–2:
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — no
  schema changes; handlers only read existing `Project`/`Word` fields.
- `services/api/app/pipeline/`, `services/api/app/main.py` — untouched.
- `apps/web/`, `remotion/` — untouched; out of scope for this phase.

## Architecture Decisions

1. **`get_project_context`/`get_timeline`/`find_words` moved OUT of
   `catalog.py` into `context_tools.py`, rather than "flipping" their
   catalog entries from PLANNED to AVAILABLE in place.** Phase 2's own audit
   predicted this exact friction: `ToolRegistry.register()` rejects
   duplicate names by design (Phase 2, "Architecture Decisions" #3), so a
   tool's real implementation can't overwrite its old PLANNED placeholder —
   it has to be registered fresh, which means the old entry has to be gone
   first. Removing it from the catalog and registering the real version
   where the real code lives is simpler and more honest than adding
   special-case "replace" logic to the registry just to support this one
   transition. Phase 4 and Phase 5 will do the same thing for their tools.
2. **`get_timeline`'s overlap semantics (`endMs > fromMs and startMs <
   toMs`)** rather than "starts within the window": a caption that's
   already on screen when the window starts is still relevant to "what's
   visible in this range," which matters for a future `analyze_frame`-driven
   command like "what's on screen when insane is shown."
3. **`find_words`/`get_timeline`'s cross-field validation
   (`fromMs`/`toMs` order, blank query) lives in the handler, not in a new
   Pydantic validator added to Phase 2's `schemas.py`.** This keeps Phase
   2's already-committed contracts completely untouched (no field additions,
   no new `model_validator`), per this phase's instruction to preserve them,
   while still rejecting nonsensical input before it does anything with the
   project data.
4. **Zero matches from `find_words` is a result, not an exception.** This
   was an explicit design point in the approved architecture plan (§5) and
   is preserved deliberately — treating "not found" as an error would force
   every future caller (the planner) to use exception handling for an
   entirely ordinary outcome.
5. **Case-insensitive matching in `find_words` copies `apps/web`'s existing
   convention** (verified in `TranscriptPanel.tsx`) rather than picking a
   new rule independently — reduces the chance of the agent and the manual
   editor UI disagreeing about whether a word "matches" a query.

## Interfaces / Contracts

No changes to the request/response envelope from Phase 1, and no changes to
`ToolSpec`/`ToolRegistry` from Phase 2. What's new: three real, callable
handlers reachable via the Phase 2 mechanism:
```python
from app.agent.tools import default_registry

handler = default_registry.get_handler("find_words")   # no longer raises ToolNotImplementedError
result = handler(FindWordsArgs(query="insane"), project)   # FindWordsResult(matches=[...])
```
`GetProjectContextResult`, `GetTimelineResult`, `FindWordsResult` are exactly
the shapes Phase 2 already declared in `schemas.py` — unchanged.

## Validation

- Every handler receives its `args` already validated by Pydantic (field
  types/ranges enforced by Phase 2's `schemas.py`) before it's ever called.
- Each handler additionally validates what Pydantic can't: referential/
  semantic sense-checking specific to that tool (`get_timeline`'s range
  order, `find_words`'s non-blank-after-trim query), raising
  `ToolExecutionError` rather than proceeding on a nonsensical request.
- No handler mutates its `project` argument — all three are read-only by
  construction (they only read attributes and build new result objects),
  matching their `reads=True, writes=False` `ToolSpec` declaration.

## Security Considerations

Unchanged posture from Phases 1–2: no LLM involvement yet, so no
prompt-injection surface exists in this phase. One relevant property:
`find_words`'s query is only ever used for a literal, case-folded string
comparison (`in` / `==`) against word text — it is never interpreted,
evaluated, or used to construct a query/expression of any kind, so even
transcript text containing adversarial-looking strings can't do anything
beyond a plain substring/equality check.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/tools/context_tools.py services/api/app/agent/tools/errors.py services/api/app/agent/tools/catalog.py services/api/app/agent/tools/__init__.py services/api/app/agent/tests/test_context_tools.py services/api/app/agent/tests/test_tool_registry.py
python services/api/app/agent/tests/test_contracts.py      # Phase 1 — regression check
python services/api/app/agent/tests/test_router.py           # Phase 1 — regression check
python services/api/app/agent/tests/test_tool_registry.py    # Phase 2 — updated, see above
python services/api/app/agent/tests/test_context_tools.py    # Phase 3 — new
```

**Phase 1 regression check:** both scripts re-run clean, 20/20 and 6/6,
unchanged from prior phases.

**Phase 2 regression check (post-update):** 19/19 checks pass. 15 of these
are byte-for-byte the same assertions as the original Phase 2 audit and
still pass unmodified; 4 reflect the updated catalog-state assertions
described above (3 updated existing checks plus 1 new one confirming
AVAILABLE handlers are truly callable).

**Phase 3 — `test_context_tools.py`** (22/22 checks passed):
```
[PASS] get_project_context returns real durationMs
[PASS] get_project_context returns real width/height
[PASS] get_project_context returns real presetId
[PASS] get_project_context returns real settings
[PASS] get_project_context wordCount matches actual word count
[PASS] get_timeline with no window returns every word
[PASS] get_timeline preserves word order/ids
[PASS] windowed get_timeline includes the word whose span matches the window
[PASS] a window entirely after the project's end returns no words (not an error)
[PASS] get_timeline raises ToolExecutionError when fromMs > toMs
[PASS] get_timeline on a project with zero words returns an empty list, not an error
[PASS] find_words (contains) finds a word by a lowercase substring of itself
[PASS] find_words (exact) matches regardless of case
[PASS] find_words (exact) does not match on a partial substring
[PASS] find_words with no matches returns an empty list, not an exception
[PASS] find_words raises ToolExecutionError for a whitespace-only query
[PASS] get_project_context is registered as AVAILABLE
[PASS] get_project_context's handler is retrievable without ToolNotImplementedError
[PASS] get_timeline is registered as AVAILABLE
[PASS] get_timeline's handler is retrievable without ToolNotImplementedError
[PASS] find_words is registered as AVAILABLE
[PASS] find_words's handler is retrievable without ToolNotImplementedError

All checks passed.
```
Covers normal cases (all three tools against the real fixture), invalid
inputs (blank query, inverted time range), missing/zero-match results
(empty-word project, no-match query — both confirmed as normal, non-error
outcomes), and edge cases (window entirely outside the project's duration,
case-insensitivity, exact-vs-partial matching). All against
`packages/shared/fixtures/demo-project.json`, no synthetic/fabricated data.

## Verification Result
**PASSED.** 22/22 new checks, plus 20/20 + 6/6 + 19/19 from Phases 1–2
re-confirmed (67/67 total across all four test files).

## Deviations From Plan

- **`catalog.py` and `tools/__init__.py` were modified**, and 3 assertions
  in `tests/test_tool_registry.py` were updated. This was flagged in advance
  by Phase 2's own audit ("Dependencies / Blockers") as the expected
  consequence of `register()`'s no-duplicates rule — not a deviation from
  the registry's actual contract (mechanism, exceptions, and the other 15
  Phase 2 assertions are all unchanged and still pass), but a real edit to
  files Phase 2 created. Calling this out explicitly rather than presenting
  it as "no Phase 1/2 files touched."
- Same host-Python-instead-of-Docker note as Phases 1–2 applies; no new AWS
  dependency was introduced.
- No scope deviations: no planner, no Bedrock/LLM calls, no voice, no
  vision, no mutation tools, nothing outside `services/api/app/agent/`.

## Dependencies / Blockers

- Phase 4 (mutation tools: `update_caption_style`, `move_caption`,
  `scale_caption`, `apply_preset`, `add_overlay`) will need to repeat the
  same "remove from `catalog.py`, register AVAILABLE in the tool's own
  module" pattern established here — no new blocker, just the same
  mechanical step this phase already worked through.
- `analyze_frame` remains blocked on P1's video storage, unchanged since
  Phase 1/2.
- No other new dependencies were introduced.

## Next Phase

**Phase 4 — Caption mutation tools** (`update_caption_style`,
`move_caption`, `scale_caption`, `apply_preset`, `add_overlay`): real
handlers producing `AgentPatch`-shaped results, validated through Phase 1's
`app.agent.validation.apply_patch`. Will NOT be started until explicit
approval ("Proceed to Phase 4").
