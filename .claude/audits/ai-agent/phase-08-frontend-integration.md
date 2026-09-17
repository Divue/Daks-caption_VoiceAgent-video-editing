# Phase 8 — Frontend Agent Log + Patch Integration

## Status
PARTIAL — **Step 1 (P4-owned backend wiring) COMPLETE.** Steps 2–4
(P1's `main.py` router inclusion, P3's `apps/web` wiring) are **not
implemented**, per explicit instruction, and require separate sign-off from
their owners. See "Cross-Team Changes Still Required."

## Objective (Step 1 only)
Replace `router.py`'s Phase 1 `status="not_implemented"` stub with the real
Phase 6 planner and Phase 7 voice functions, fix the `WordPatch`/`AgentPatch`
null-serialization risk identified during Phase 8 planning, and add an
`/agent/voice-command` route proving voice reaches the identical planner —
entirely inside `services/api/app/agent/`, with no cross-team file touched.
See [phase-08-integration-plan] (the inspection report given before this
step, in-conversation — not a separate file) for the ownership boundaries
and full list of remaining cross-team changes.

## Implementation

- **`router.py`** (rewritten):
  - `run_command` (`POST /agent/command`) now calls the real
    `planner.run_agent_command(request, client=client)` instead of
    returning a fixed stub.
  - `run_voice_command` (`POST /agent/voice-command`, **new route**) calls
    `voice.run_agent_voice_command(project=..., transcript=..., selection=...,
    client=client)` — the same Phase 7 function, `transcript=` path only
    (see `AgentVoiceCommandRequest`'s docstring for why raw audio isn't
    accepted over HTTP yet).
  - Both routes declare `response_model_exclude_none=True` — see
    "The `exclude_none` Fix" below.
  - Both routes accept `client: BedrockConverseClient | None =
    Depends(_default_bedrock_client)` — a FastAPI dependency seam.
    `_default_bedrock_client()` returns `None` in production (meaning "use
    the real client," exactly as `run_agent_command`'s own default
    already does); tests override this dependency to inject a fake client
    over HTTP, without needing a real network call or real credentials.
  - Both routes wrap their planner/voice call in a `try/except Exception`
    — a last-resort safety net (see "Error Handling").
- **`contracts.py`** (additive only): one new class,
  `AgentVoiceCommandRequest` (`transcript`, `project`, `selection`), added
  alongside — not modifying — `AgentCommandRequest`/`AgentCommandResponse`,
  which are byte-for-byte unchanged. `AgentCommandResponse` is reused as
  the voice route's response too, so both routes share one output shape.
- **`tests/test_router.py`** (rewritten): see "Testing." The Phase 1
  version's assertions all described the old `status="not_implemented"`
  stub and are necessarily replaced — flagged here explicitly, not left
  silently changed.

**Nothing else changed.** Verified directly: `git diff --stat` shows zero
lines changed in `planner.py`, `voice.py`, `bedrock_client.py`,
`tool_config.py`, `validation.py`, and every file under `tools/` — Phases
1–7's actual logic is completely untouched; only the HTTP wiring around it
changed.

## The `exclude_none` Fix

**The problem, confirmed concretely during Phase 8 planning:** Pydantic
serializes every untouched optional field (e.g. most of a `StylePatch`) as
JSON `null` by default. The frontend reducer's `UPDATE_WORD` case
(`apps/web/src/state/project-reducer.ts`) does a plain `{ ...word,
...action.patch }` spread — an explicit `null` for, say, `text` would
overwrite the word's real text with `null` instead of leaving it alone.

**The fix:** `response_model_exclude_none=True` on both route decorators.
Pydantic/FastAPI strips every `None` recursively before serialization, so
only fields a tool actually set appear in the JSON at all.

**Verified over real HTTP, not just asserted:** `test_optional_patch_fields_are_omitted_not_serialized_as_null`
sends a `move_caption` request through the real router and inspects the
**raw response JSON dict** (not a re-parsed Pydantic model, which would
hide the difference by re-inserting defaults) — confirming the resulting
`style` object contains exactly `{"x": ..., "y": ...}` with no
`"fontSize": null`/`"color": null`/etc., and the top-level `patch` object
contains no null `text`/`emphasis`/etc. keys either. Manually reproduced
outside the test suite too (see the Phase 8 conversation's smoke test):
the un-fixed version would have emitted the full null-padded `StylePatch`;
the fixed version emits only `{"x": 10.0, "y": 90.0}`.

## Interfaces / Contracts

```
POST /agent/command
  { "command": "...", "project": {...}, "selection": {...}? }
  -> AgentCommandResponse (unchanged shape from Phase 1, now null-free)

POST /agent/voice-command   (NEW)
  { "transcript": "...", "project": {...}, "selection": {...}? }
  -> AgentCommandResponse (identical shape to /agent/command)
```
No change to `AgentCommandRequest`, `AgentCommandResponse`, `AgentPatch`,
or `SelectionContext`. The one new contract (`AgentVoiceCommandRequest`) is
purely additive.

## Error Handling

| Failure | Where caught | HTTP result |
|---|---|---|
| Malformed request body (empty command/transcript, missing project) | FastAPI/Pydantic request validation | `422`, before the handler ever runs |
| Model misconfigured, invalid tool call, tool execution error, iteration cap, final validation failure | `planner.py`/`voice.py` (Phase 6/7, unmodified) | `200` with `status="error"`/`"unsupported"` — the router just returns what these functions already produce |
| A truly unexpected exception (e.g. simulated Bedrock API/network failure) | **New**: router's own `try/except Exception` | `200` with `status="error"` and a generic "failed unexpectedly" log entry, instead of a raw `500` |

The new safety net is deliberately generic (no internal exception detail in
the HTTP response) — the real exception is still captured via
`logger.exception(...)` for developers, matching the established
internal-debug-log vs. user-facing-log separation from Phase 6.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/contracts.py services/api/app/agent/router.py services/api/app/agent/tests/test_router.py
python services/api/app/agent/tests/test_contracts.py
python services/api/app/agent/tests/test_router.py
python services/api/app/agent/tests/test_tool_registry.py
python services/api/app/agent/tests/test_context_tools.py
python services/api/app/agent/tests/test_mutation_tools.py
python services/api/app/agent/tests/test_vision_tools.py
python services/api/app/agent/tests/test_bedrock_client.py
python services/api/app/agent/tests/test_tool_config.py
python services/api/app/agent/tests/test_planner.py
python services/api/app/agent/tests/test_voice.py
```

**Phases 1–7 regression check:** all nine other test files pass unchanged
— this step modified none of their production files.

**Per-file results, this run:**

| File | Checks |
|---|---|
| `test_contracts.py` (Phase 1) | 21/21 |
| `test_router.py` (Phase 1 → **rewritten this step**) | 30/30 |
| `test_tool_registry.py` (Phase 2) | 19/19 |
| `test_context_tools.py` (Phase 3) | 22/22 |
| `test_mutation_tools.py` (Phase 4) | 49/49 |
| `test_vision_tools.py` (Phase 5) | 22/22 |
| `test_bedrock_client.py` (Phase 6) | 4/4 |
| `test_tool_config.py` (Phase 6) | 8/8 |
| `test_planner.py` (Phase 6) | 35/35 |
| `test_voice.py` (Phase 7) | 27/27 |
| **Total** | **237/237** |

`test_router.py`'s 30 checks cover every category this step's instructions
specified: a valid text command reaching the real planner (with an
assertion that the fake client actually received two `converse()` calls,
proving the real loop ran, not a shortcut); correct serialization
(`exclude_none`, checked on raw JSON); planner/tool errors handled
honestly over HTTP (iteration cap, unknown tool, and a genuinely
unexpected exception via the new safety net — all returning `200` with an
honest `status`, never a `500` or a fabricated success); invalid requests
still rejected with `422` (both routes); and the voice path reaching the
identical planner (same response shape, same wrapped-command text sent to
"Bedrock", same rejection behavior for an out-of-range tool argument as
the text path).

**What is real vs. mocked, precisely:** identical discipline to every
prior phase — only the Bedrock client is ever a test double
(`FakeBedrockClient`/`RaisingClient`, injected via FastAPI's
`dependency_overrides`). Every tool call that succeeds in these tests runs
the real `ToolRegistry`, real Pydantic validation, and real tool handlers
against the real `demo-project.json` fixture, over a real (in-process) HTTP
request/response cycle. No AWS credentials were used or required.

## Verification Result
**PASSED** for Step 1's scope. 30/30 new/rewritten router checks, plus
21/21 + 19/19 + 22/22 + 49/49 + 22/22 + 4/4 + 8/8 + 35/35 + 27/27 from
Phases 1–7 re-confirmed with zero changes to any of their production files
(237/237 total across all ten test files).

## Deviations From Plan

- **`test_router.py` was substantially rewritten**, not just extended —
  every one of its Phase 1 assertions described the old stub's fixed
  `status="not_implemented"` response, which this step's whole purpose was
  to replace. This was anticipated (the router's own Phase 1 docstring
  said *"Replaced by the real planner in Phase 6"*) and is flagged
  explicitly here, not silently done.
- **A new route was added** (`/agent/voice-command`) beyond a literal
  reading of "wire router.py to the planner" — needed to satisfy this
  step's own explicit test requirement ("voice path reaches the same
  planner interface") over HTTP, not just via direct Python calls
  (already covered by Phase 7's `test_voice.py`). Scoped to the
  `transcript=` path only, per the standing instruction not to implement
  real microphone/STT in this step.
- **One new contract class** (`AgentVoiceCommandRequest`) was added to
  `contracts.py` to support the new route — additive, not a modification
  to either named-as-protected class (`AgentCommandRequest`/
  `AgentCommandResponse`), per instruction #4.
- **A router-level exception safety net was added** (not present in
  Phase 1's stub, and not something Phase 6/7 needed, since their own
  tests call the functions directly in Python where an uncaught exception
  is just a test failure, not a production `500`). This is new code, not
  a "preserve unless strictly necessary" exception to Phase 6/7's
  contracts — it wraps them, it doesn't change them.
- Same host-Python-instead-of-Docker note as every prior phase. No AWS
  credentials were used (as required).
- No scope deviations from what was explicitly authorized: `main.py`,
  `apps/web/`, `packages/shared/`, `app/schema.py`, `app/pipeline/`, and
  `remotion/` are all confirmed untouched (`git diff --stat` against each,
  zero output). No Bedrock model ID was chosen. No real microphone/STT was
  implemented.

## Cross-Team Changes Still Required (Steps 2–4, NOT implemented)

Unchanged from the inspection report given before this step — repeated
here for this audit's own completeness, now that Step 1 is done:

| # | File | Owner | Change needed |
|---|---|---|---|
| 1 | `services/api/app/main.py` | **P1** | `app.include_router(agent_router)` — without this, `/agent/command` and `/agent/voice-command` exist only in tests and direct imports, not on the running API |
| 2 | `apps/web/src/App.tsx` | **P3** | Replace `handleSubmitCommand`'s placeholder with a real `fetch` to `POST /agent/command` (now real), dispatching returned `patches` via the existing reducer and appending `log` entries |
| 3 | `apps/web/src/hooks/useAgentActivity.ts` | **P3** | Add a way to append a backend-provided `AgentLogEntry[]` batch preserving its own `id`/`timestamp` |
| 4 | `apps/web/src/components/agent/MicButton.tsx` (or a new hook) | **P3** | Wire real audio capture / browser `SpeechRecognition`, calling the same `onSubmitCommand` path — still blocked on the unresolved STT provider decision (Phase 7 audit) |

None of these were touched. `/agent/voice-command` now exists and is fully
tested, ready for whichever P3 wiring eventually calls it — but nothing
calls it yet.

## Dependencies / Blockers

- Steps 2–4 above (P1/P3 sign-off).
- The STT provider decision (Phase 7 audit, unchanged) — blocks step 4's
  `audio_bytes` path specifically; `transcript=` (browser-side recognition)
  is fully wired and tested end-to-end today.
- The Bedrock model-selection decision (Phase 6 audit, unchanged) — blocks
  real (non-test) use of either route.
- `analyze_frame` remains blocked on P1's video storage (Phase 5,
  unchanged) — reachable through the router like any other tool, but will
  honestly fail for every real Project today.

## Next Steps

Steps 2–4 require action from P1 and P3 respectively — not something to
implement further on this branch without their involvement. Per the
standing workflow rule, no further phase work proceeds without explicit
approval.
