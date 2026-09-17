# Phase 1 — Agent Contracts

## Status
COMPLETE

## Objective
Establish the foundational request/response contracts, patch representation,
and validation boundary for the AI agent, compatible with the current
`packages/shared/src/project.ts` / `services/api/app/schema.py` / the
frontend reducer's action shapes — without implementing the planner, tools,
voice, or vision (those are Phases 4–7).

## Implementation

- **`contracts.py`**: Pydantic models for the agent's HTTP boundary.
  - `WordPatch` — a partial `Word` (every field optional), the same
    relationship `StylePatch` already has to `Style` in `app/schema.py`.
    Mirrors the frontend's `UPDATE_WORD` action, whose `patch` argument is
    `Partial<Word>` (`apps/web/src/state/project-reducer.ts`).
  - `UpdateWordAction`, `SetPresetAction`, `AddOverlayAction` — one Pydantic
    model per agent-emittable patch, each mirroring one existing frontend
    reducer action field-for-field.
  - `AgentPatch` — the union of exactly those three (see "Architecture
    Decisions" for why `SET_PROJECT`/`UNDO`/`REDO` are excluded).
  - `AgentLogEntry` — matches `apps/web`'s existing `AgentLogEntry`
    (`useAgentActivity.ts`) field-for-field: `id`, `message`, `timestamp`.
  - `SelectionContext` — optional `selectedWordId`/`playheadMs`, forward-
    compatible with a frontend change that hasn't happened yet (see
    "Dependencies / Blockers").
  - `AgentCommandRequest` / `AgentCommandResponse` — the full request/response
    envelope for `POST /agent/command`.
- **`validation.py`**: the validation boundary.
  - `apply_patch(project, patch)` — returns a **new**, schema-revalidated
    `Project` with the patch applied, or raises `PatchError`. Implemented by
    dumping `project` to a plain dict, applying the patch to the dict copy,
    and re-validating the *whole* result through `Project.model_validate` —
    not by mutating the Pydantic object in place, and not by trusting
    field-level validators alone to catch cross-field inconsistencies.
  - `apply_patches(project, patches)` — replays a list of patches in order;
    all-or-nothing — any failure returns the **original** `project`
    unchanged plus an error string, never a partially-applied result.
- **`router.py`**: a real `APIRouter` with `POST /agent/command`, importable
  and independently testable, but returning a fixed
  `status="not_implemented"` response — it does not parse or act on
  `request.command` in any way. Explicitly not wired into `app/main.py`
  (see "Files NOT Modified").
- **`tests/test_contracts.py`**, **`tests/test_router.py`**: hand-rolled
  verification scripts (no pytest — see "Deviations From Plan").

## Files Created
- `services/api/app/agent/contracts.py`
- `services/api/app/agent/validation.py`
- `services/api/app/agent/router.py`
- `services/api/app/agent/tests/__init__.py`
- `services/api/app/agent/tests/test_contracts.py`
- `services/api/app/agent/tests/test_router.py`
- `.claude/audits/ai-agent/phase-01-agent-contracts.md` (this file)

## Files Modified
None.

## Files NOT Modified
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — the
  shared schema. `WordPatch` (a *partial* Word) was added in
  `app/agent/contracts.py` instead of `app/schema.py`, precisely to avoid
  touching the lead-owned file — it imports and reuses `StylePatch`,
  `Signals`, `Overlay`, `PresetId`, `Project` from `app/schema.py` as-is.
- `services/api/app/pipeline/` — untouched; Phase 1 has no dependency on the
  STT/prosody/tag/build pipeline.
- `services/api/app/main.py` — **the router is not included here.** Wiring
  `app.include_router(router)` is a one-line change to a file outside
  `services/api/app/agent/`. Per the approved plan (§15) and this phase's
  explicit instruction ("do not wire the real HTTP route into main.py unless
  ... the ownership issue has been explicitly identified"), this is flagged,
  not done. See "Dependencies / Blockers."
- `apps/web/` — untouched. No frontend functionality was implemented, per
  this phase's instructions.
- `remotion/` — untouched, and not relevant to this phase.

## Architecture Decisions

1. **`AgentPatch` is a 3-way union (`UPDATE_WORD` / `SET_PRESET` /
   `ADD_OVERLAY`), not all 6 reducer actions.** `SET_PROJECT` is a full
   document replace, not a patch, and isn't something a targeted editing
   command should ever produce; `UNDO`/`REDO` are user history controls, not
   an agent output. Restricting the union keeps the agent's blast radius to
   exactly what a "make this word yellow"-class command should be able to
   do.
2. **`WordPatch` lives in `app/agent/`, not `app/schema.py`.** It's a
   contract of *this* module's patches, not part of the shared Project
   document — defining it here avoids needing lead sign-off for something
   that isn't a shared-schema change, while still being built entirely out
   of `app/schema.py` types (`StylePatch`, `Signals`) so it can never drift
   from what `Word.style`/`Word.signals` actually accept.
3. **Validation goes through a full dict round-trip and `Project.model_validate`,
   not `model.model_copy(update=...)`.** Pydantic v2's `model_copy` does not
   re-validate by design. Re-validating the whole resulting document (not
   just the changed field) is required by the approved plan's rule 5
   ("Every mutation must be validated against the backend Pydantic schema")
   and catches cross-field issues a single field's own validator wouldn't
   (e.g. a `WordPatch` combination that's individually in-range per field
   but not jointly sensible for `Word`).
4. **`WordPatch` merges via `exclude_none=True`.** A patch field left as
   `None` means "don't touch this field" — there is currently no way to
   explicitly clear an already-set field (e.g. remove a word's `style`
   override entirely) through this contract. This is a known, documented
   limitation, not an oversight — see "Deviations From Plan."
5. **The router returns `status="not_implemented"`, never a fabricated
   `"ok"`.** Per the architectural rule against fake agent activity — a
   request that hits this endpoint today gets an honest answer, not a
   simulated success.
6. **No pytest.** The repo has no test framework anywhere (verified: not in
   `services/api/requirements.txt`, no `pytest.ini`/`conftest.py` in the
   repo). Adding one is a dependency decision bigger than a contracts-only
   phase warrants — plain, dependency-free assertion scripts instead,
   matching the existing style of `services/api/scripts/stt_bakeoff/bakeoff.py`.

## Interfaces / Contracts

**Request** (`AgentCommandRequest`):
```json
{
  "command": "Make the word insane yellow",
  "project": { /* full Project, validated against app.schema.Project */ },
  "selection": { "selectedWordId": "w3", "playheadMs": 1200 }   // optional
}
```

**Response** (`AgentCommandResponse`):
```json
{
  "status": "ok | unsupported | error | not_implemented",
  "patches": [
    { "type": "UPDATE_WORD", "wordId": "w3", "patch": { "style": { "color": "#FFE600" } } },
    { "type": "SET_PRESET", "presetId": "minimal" },
    { "type": "ADD_OVERLAY", "overlay": { "id": "...", "text": "...", "startMs": 0, "endMs": 1000, "x": 50, "y": 50, "style": { ... } } }
  ],
  "log": [ { "id": "...", "message": "...", "timestamp": 1737000000000 } ]
}
```
Each `patches[]` entry is designed to be dispatched, unmodified, as the
corresponding `apps/web` reducer action — no frontend reducer change is
required to consume this shape (that wiring itself is Phase 8, not done
here).

**`POST /agent/command`** (route object only — not exposed by the running
API yet): validates `AgentCommandRequest`, returns
`AgentCommandResponse(status="not_implemented", patches=[], log=[...])`
unconditionally.

## Validation

- `apply_patch`/`apply_patches` (see "Implementation") — the only place a
  patch is turned into a `Project`. Every result is passed through
  `Project.model_validate` before being returned.
- Pydantic field-level validation happens automatically at model
  construction (e.g. `WordPatch(stretch=0.5)` raises `ValidationError`
  immediately, since `Word.stretch` requires `>= 1`; `SetPresetAction(presetId="fake")`
  raises immediately, since `PresetId` is a closed `Literal`).
- `apply_patch` additionally checks referential integrity that Pydantic's
  per-field validation can't (does `wordId` actually exist in
  `project.words`?) — raising `PatchError`, not silently no-op-ing.

## Security Considerations

Phase 1 has no LLM, no tool execution, and no user-facing text generation —
there is nothing here that reads untrusted transcript/command content as
instructions. The one relevant property established now: **the request
schema (`AgentCommandRequest`) has no field through which a caller could
supply an arbitrary patch or arbitrary Project data outside `app.schema.Project`'s
own validation** — `project` is always fully re-validated as a `Project` on
the way in, and any patch is always fully re-validated as a `Project` on the
way out. This is the enforcement point later phases' prompt-injection
defenses (§9 of the approved plan) will rely on: no matter what the LLM is
tricked into wanting, only a well-typed `AgentPatch` can ever reach
`apply_patch`, and only a schema-valid result can ever leave it.

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/contracts.py services/api/app/agent/validation.py services/api/app/agent/router.py services/api/app/agent/tests/test_contracts.py services/api/app/agent/tests/test_router.py
python services/api/app/agent/tests/test_contracts.py
python services/api/app/agent/tests/test_router.py
```

**Actual output — `test_contracts.py`** (20/20 checks passed):
```
[PASS] demo-project.json validates against app.schema.Project
[PASS] demo-project.json has at least one word
[PASS] AgentCommandRequest round-trips through JSON
[PASS] AgentCommandResponse round-trips through JSON
[PASS] apply_patch returns a Project
[PASS] UPDATE_WORD patch applied the new color
[PASS] UPDATE_WORD patch applied the new fontSize
[PASS] UPDATE_WORD patch left other words untouched
[PASS] original project object was not mutated
[PASS] SET_PRESET patch applied
[PASS] SET_PRESET did not mutate the original project
[PASS] ADD_OVERLAY patch appended one overlay
[PASS] ADD_OVERLAY did not mutate the original project's overlay count
[PASS] PatchError raised for unknown wordId
[PASS] project unchanged after unknown-wordId failure
[PASS] WordPatch rejects stretch < 1 at construction time
[PASS] SetPresetAction rejects an unknown presetId at construction time
[PASS] Project.model_validate rejects a malformed/incomplete document
[PASS] apply_patches reports an error when any patch in the list fails
[PASS] apply_patches returns the ORIGINAL project when a later patch fails
[PASS] apply_patches succeeds and returns a changed project when all patches are valid
All checks passed.
```

**Actual output — `test_router.py`** (6/6 checks passed; one unrelated
deprecation warning from the host's `starlette`/`httpx` version pairing,
noted below):
```
[PASS] POST /agent/command returns 200
[PASS] response status is 'not_implemented'
[PASS] response has no patches (nothing pretends to have acted)
[PASS] response includes a log entry explaining why
[PASS] empty command is rejected with 422 (min_length=1)
[PASS] missing project is rejected with 422
All checks passed.
```

This satisfies every item in the Phase 1 verification checklist: syntax/import
checks, request/response round trips, valid `Project` data against the
current schema (the real `demo-project.json` fixture), valid and invalid
`ProjectAction`-shaped patches, invalid word IDs, malformed project data, and
confirmation that no mutation happens when validation fails. No AWS
credentials were used or required; no Bedrock, vision, or tool logic was
invoked or faked.

## Verification Result
**PASSED.** 26/26 checks across both test scripts succeeded.

## Deviations From Plan

1. **Tests run on host Python (3.10.0), not inside Docker.** Root `CLAUDE.md`
   says Python work should stay inside the Docker image. Docker CLI is
   present in this environment but the Docker daemon is not running
   (`docker images` failed: `dockerDesktopLinuxEngine` pipe not found), and
   no `.env` file exists to satisfy `docker-compose.yml`'s `env_file: .env`.
   Starting Docker Desktop and fabricating a `.env` file were both out of
   scope for a "no AWS credentials required" contracts test, so host Python
   was used instead — `pydantic`, `fastapi`, and `httpx` happened to already
   be present on this host (not installed by this session). **This should
   not be read as an endorsement of running the real API on host Python** —
   it's a one-time verification workaround, explicitly flagged rather than
   done silently. Team approval isn't needed to *know* this happened, but
   worth confirming this is acceptable for future phases too, or whether
   Docker should be made to work first.
2. **`router.py` is not wired into `app/main.py`.** Per this phase's own
   instructions, this was flagged rather than done. See "Dependencies /
   Blockers."
3. **Two test files instead of pytest.** No test framework exists in the
   repo; adding one wasn't requested and is arguably a team-wide decision,
   not a Phase-1-scoped one.

None of these require unpicking Phase 1's actual contracts — they're
process/environment notes, not scope changes.

## Dependencies / Blockers

- **`app/main.py` router wiring** — needs `app.include_router(router)` added
  by whoever owns `services/api` root today (P1, per `CLAUDE.md`'s ownership
  table). Not done in this phase. Until it happens, `/agent/command` does
  not exist on the real running API — only as an importable, independently
  testable object.
- **`SelectionContext` is unused by any real caller** — `apps/web`'s
  `useSelection` state never leaves the browser today. No frontend work was
  done (out of scope for this phase); this field exists so Phase 8 doesn't
  need a breaking contract change later.
- **Docker/`.env` not set up in this environment** — doesn't block Phase 1
  (verified without it), but will matter once a phase needs real AWS/Bedrock
  calls (Phase 6 onward).

## Next Phase

**Phase 2 — Tool registry skeleton.** Will NOT be started until explicit
approval ("Proceed to Phase 2").
