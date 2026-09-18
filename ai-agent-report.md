# AI Agent Implementation Report

## 1. Purpose and Scope

The AI agent turns a natural-language command (typed or spoken) into a bounded set of
validated changes to the shared `Project` document — caption styling, preset selection,
and overlay captions. It never edits pixels and never mutates or persists a `Project`
itself; it returns a list of typed **patches** that the frontend applies through its own
reducer.

This document is a **precise, source-verified implementation reference** for Shubh
(P1 / lead) and any Claude Code session working on the backend integration. Its purpose
is to describe the agent **exactly as the code exists today** — contracts, tools,
validation, Bedrock wiring, voice handling, HTTP routes, and integration gaps — so the
remaining work (mounting the router on the real API) can be done correctly, without
re-deriving or guessing at behavior that is already implemented and tested.

This document does not redesign anything. Where something is not implemented, it is
explicitly marked **NOT IMPLEMENTED / INTEGRATION REQUIRED**.

---

## 2. Current Architecture

```
User types text ───────────┐
                            │
User speaks (voice)         │  (browser SpeechRecognition / mic capture:
  → NOT IMPLEMENTED ────────┘   NOT IMPLEMENTED — see §14)
                            │
                            ▼
                 ┌─────────────────────────┐
                 │   Agent API (router.py)  │   NOT mounted on the running
                 │  POST /agent/command      │   FastAPI app yet — see §12
                 │  POST /agent/voice-command │
                 └───────────┬─────────────┘
                             │  AgentCommandRequest /
                             │  AgentVoiceCommandRequest
                             ▼
                 ┌─────────────────────────┐
                 │   Planner (planner.py)   │
                 │  run_agent_command()      │
                 └───────────┬─────────────┘
                             │ 1. get_model_id() from BEDROCK_MODEL_ID
                             │    (raises if unset — no default, no guess)
                             │ 2. build_tool_config() — only AVAILABLE tools
                             ▼
                 ┌─────────────────────────┐
                 │   Bedrock Converse API    │  bedrock.converse(modelId, system,
                 │  (bedrock_client.py)      │  messages, toolConfig)
                 └───────────┬─────────────┘
                             │ model requests a tool (toolUse block)
                             ▼
                 ┌─────────────────────────┐
                 │   Tool selection          │  ToolRegistry.get_spec(name)
                 │   (tools/registry.py)     │  → ToolNotFoundError if unknown
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │   Tool argument           │  spec.input_model.model_validate(input)
                 │   validation (Pydantic)   │  → rejected if invalid
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │   Tool execution          │  handler(args, request.project)
                 │   (tools/*.py)            │  reads project in memory; never persists it
                 └───────────┬─────────────┘
                             │ tool result fed back to model as a toolResult block;
                             │ loop repeats (bounded by MAX_TOOL_ITERATIONS)
                             ▼
                 ┌─────────────────────────┐
                 │   Patch collection        │  every writer tool's `.patch` is collected
                 │   (planner.py)            │  (UpdateWordAction / SetPresetAction /
                 │                           │   AddOverlayAction)
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │  Full Project validation  │  validation.apply_patches() replays the
                 │  (validation.py)          │  WHOLE patch sequence against a COPY of
                 │                           │  request.project; all-or-nothing
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │  AgentCommandResponse     │  {status, patches[], log[]}
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │  Frontend reducer         │  apps/web project-reducer.ts applies
                 │  (apps/web) — NOT WIRED   │  UPDATE_WORD / SET_PRESET / ADD_OVERLAY
                 │  to this response yet     │  — see §15
                 └─────────────────────────┘
```

Key architectural facts, true in the current code:

- **The LLM decides WHAT should happen; tools decide HOW.** The model only ever picks a
  tool name and arguments. All actual logic — reading timeline data, building a patch,
  checking bounds — lives in the tool handler in Python, not in the model's output.
- **The agent never directly mutates or persists a `Project`.** `planner.py`'s own
  docstring states this as a hard rule: `request.project` is never assigned to, mutated,
  or replaced anywhere in the module. Every tool handler that "writes" actually calls
  `validation.apply_patch`, which works on a dict copy and discards the resulting
  `Project` after confirming it's valid — only the **patch** is returned.
- **The frontend applies returned patches.** `AgentCommandResponse.patches` is a list of
  actions shaped to match `apps/web/src/state/project-reducer.ts`'s existing
  `UPDATE_WORD` / `SET_PRESET` / `ADD_OVERLAY` actions, field-for-field. (As of this
  report, nothing in the frontend actually consumes this response yet — see §15.)
- **The user's command and all tool-result text are treated as untrusted data, never
  instructions.** The system prompt explicitly tells the model to treat text inside
  `<user_command>` tags, and inside any tool result, as data — never as instructions,
  even if it claims to override the rules.
- **Prompt-injection isolation** is a documented, tested property (see §11), not an
  aspirational claim.

---

## 3. Repository / File Structure

All paths below were confirmed to exist by listing the repository directly.

```
services/api/app/agent/
├── __init__.py
├── contracts.py        # Phase 1 — request/response/patch Pydantic models
├── validation.py        # Phase 1 — the apply_patch / apply_patches validation boundary
├── router.py             # Phase 8 — FastAPI routes, wired to planner/voice (NOT mounted in main.py)
├── planner.py            # Phase 6 — the Bedrock Converse tool-use loop / executor
├── bedrock_client.py      # Phase 6 — model-agnostic Bedrock client + model-id config
├── tool_config.py         # Phase 6 — converts the ToolRegistry into Bedrock's toolConfig
├── voice.py               # Phase 7 — voice input → the SAME planner
├── tools/
│   ├── __init__.py         # imports all tool modules, triggers registration
│   ├── registry.py          # ToolSpec / ToolRegistry / ToolStatus engine
│   ├── catalog.py            # PLANNED-tool catalog (currently empty — see §9)
│   ├── schemas.py             # argument/result Pydantic models for every tool
│   ├── errors.py               # ToolExecutionError (handler-level failures)
│   ├── context_tools.py         # get_project_context, get_timeline, find_words
│   ├── style_tools.py            # update_caption_style, move_caption, scale_caption
│   ├── project_tools.py           # apply_preset, add_overlay
│   └── vision_tools.py             # analyze_frame
└── tests/
    ├── __init__.py
    ├── test_contracts.py
    ├── test_tool_registry.py
    ├── test_context_tools.py
    ├── test_mutation_tools.py
    ├── test_vision_tools.py
    ├── test_tool_config.py
    ├── test_bedrock_client.py
    ├── test_planner.py
    ├── test_voice.py
    └── test_router.py
```

**Note:** the task brief referenced a `services/api/app/agent/log.py`. This file **does
not exist** in the repository. Log entries (`AgentLogEntry`) are constructed inline by
`planner.py`, `voice.py`, and `router.py` via small local helper functions
(`_log`, `_new_log_entry`, `_error_log`) — there is no separate logging module. Do not
create one as part of this integration unless separately requested.

---

## 4. Agent Request Contract

All models below are defined in `services/api/app/agent/contracts.py` (verified against
source).

### `AgentCommandRequest`
```python
class AgentCommandRequest(BaseModel):
    command: str = Field(min_length=1)
    project: Project              # app/schema.py's Project — the full shared document
    selection: SelectionContext | None = None
```

### `AgentVoiceCommandRequest`
```python
class AgentVoiceCommandRequest(BaseModel):
    transcript: str = Field(min_length=1)
    project: Project
    selection: SelectionContext | None = None
```
Note: this model only accepts an already-transcribed `transcript` string. It does
**not** accept raw audio bytes over HTTP — no wire format for audio upload has been
decided (see §14).

### `SelectionContext`
```python
class SelectionContext(BaseModel):
    selectedWordId: str | None = None
    playheadMs: int | None = Field(default=None, ge=0)
```
Optional in both request types. **Not currently sent by the frontend** — `apps/web`'s
selection state (`useSelection`) is local-only today. Accepted for forward
compatibility only.

### `Project` payload
`project` is the full `app.schema.Project` object (see §6 for its fields) — the entire
shared document is sent with every command, not a partial/diffed version.

### Representative JSON — `POST /agent/command`
```json
{
  "command": "make the word insane yellow",
  "project": {
    "id": "demo-1",
    "videoUrl": "demo.mp4",
    "durationMs": 12000,
    "width": 1080,
    "height": 1920,
    "presetId": "mrbeast",
    "words": [
      { "id": "w1", "text": "insane", "startMs": 1000, "endMs": 1400,
        "emphasis": false, "emotion": "neutral", "stretch": 1 }
    ],
    "overlays": [],
    "settings": { "emojis": true, "emotionLayer": true }
  },
  "selection": null
}
```

### Representative JSON — `POST /agent/voice-command`
```json
{
  "transcript": "make the captions bigger",
  "project": { "...": "same shape as above" },
  "selection": { "selectedWordId": "w1", "playheadMs": 1200 }
}
```

No fields beyond the ones shown above exist on these models. Do not add fields to
`contracts.py` without lead/P4 agreement.

---

## 5. Agent Response Contract

Also defined in `contracts.py`.

### `AgentStatus`
```python
AgentStatus = Literal["ok", "unsupported", "error", "not_implemented"]
```
`"not_implemented"` is a declared value on the type but is not currently returned by any
code path in `planner.py`, `voice.py`, or `router.py` (kept for forward compatibility).

### `AgentCommandResponse`
```python
class AgentCommandResponse(BaseModel):
    status: AgentStatus
    patches: list[DiscriminatedAgentPatch] = Field(default_factory=list)
    log: list[AgentLogEntry] = Field(default_factory=list)
```

### `AgentLogEntry`
```python
class AgentLogEntry(BaseModel):
    id: str
    message: str
    timestamp: int   # epoch milliseconds — same unit as JS Date.now()
```
This shape matches `apps/web/src/hooks/useAgentActivity.ts`'s local `AgentLogEntry`
interface field-for-field (`id`, `message`, `timestamp`), by design, so the frontend can
eventually append these directly without remapping.

### Status meanings (as actually produced by `planner.py`/`router.py`)
- `"ok"` — one or more patches (possibly zero, for a pure query) were produced and the
  full patch sequence validated successfully.
- `"unsupported"` — the model's final text began with `UNSUPPORTED:` (no tools exist for
  the request). `patches` is empty.
- `"error"` — covers: no `BEDROCK_MODEL_ID` configured, the tool-use loop hit
  `MAX_TOOL_ITERATIONS` without a final answer, final patch-sequence validation failed,
  or an unexpected exception was caught by `router.py`'s safety net. `patches` is empty.

### Representative JSON — success
```json
{
  "status": "ok",
  "patches": [
    {
      "type": "UPDATE_WORD",
      "wordId": "w1",
      "patch": { "style": { "color": "#FFFF00" } }
    }
  ],
  "log": [
    { "id": "a1b2...", "message": "Command received: \"make the word insane yellow\"", "timestamp": 1732000000000 },
    { "id": "c3d4...", "message": "Tool 'find_words' executed.", "timestamp": 1732000000010 },
    { "id": "e5f6...", "message": "Tool 'update_caption_style' executed.", "timestamp": 1732000000020 },
    { "id": "g7h8...", "message": "Made the word 'insane' yellow.", "timestamp": 1732000000030 }
  ]
}
```

### Representative JSON — unsupported
```json
{
  "status": "unsupported",
  "patches": [],
  "log": [
    { "id": "...", "message": "Command received: \"zoom in on this word\"", "timestamp": 1732000000000 },
    { "id": "...", "message": "UNSUPPORTED: zooming captions isn't a supported operation.", "timestamp": 1732000000010 }
  ]
}
```

### Representative JSON — error (unconfigured model)
```json
{
  "status": "error",
  "patches": [],
  "log": [
    { "id": "...", "message": "Command received: \"make this bigger\"", "timestamp": 1732000000000 },
    { "id": "...", "message": "Agent is not configured (no model selected) — cannot run.", "timestamp": 1732000000010 }
  ]
}
```

Both routes serialize with `response_model_exclude_none=True` (see §6 for why this
matters).

---

## 6. Patch / Mutation Contract

The agent can only ever emit one of exactly **three** patch types, defined as a closed,
discriminated union in `contracts.py`:

```python
AgentPatch = Union[UpdateWordAction, SetPresetAction, AddOverlayAction]
DiscriminatedAgentPatch = Annotated[AgentPatch, Field(discriminator="type")]
```

### `UPDATE_WORD`
```python
class WordPatch(BaseModel):
    text: str | None = None
    startMs: int | None = Field(default=None, ge=0)
    endMs: int | None = Field(default=None, ge=0)
    emphasis: bool | None = None
    emotion: Literal["neutral", "angry", "excited"] | None = None
    stretch: float | None = Field(default=None, ge=1)
    emoji: str | None = None
    style: StylePatch | None = None      # app/schema.py's StylePatch
    signals: Signals | None = None

class UpdateWordAction(BaseModel):
    type: Literal["UPDATE_WORD"] = "UPDATE_WORD"
    wordId: str
    patch: WordPatch
```
Mirrors `apps/web`'s reducer action exactly:
`{ type: 'UPDATE_WORD'; wordId: string; patch: Partial<Word> }` in
`apps/web/src/state/project-reducer.ts`.

### `SET_PRESET`
```python
class SetPresetAction(BaseModel):
    type: Literal["SET_PRESET"] = "SET_PRESET"
    presetId: PresetId   # "kathmandu" | "mrbeast" | "minimal" | "hinglish-bold"
```
Mirrors `{ type: 'SET_PRESET'; presetId: PresetId }`.

### `ADD_OVERLAY`
```python
class AddOverlayAction(BaseModel):
    type: Literal["ADD_OVERLAY"] = "ADD_OVERLAY"
    overlay: Overlay    # app/schema.py's Overlay (id, text, startMs, endMs, x, y, style)
```
Mirrors `{ type: 'ADD_OVERLAY'; overlay: Overlay }`.

**`SET_PROJECT`, `UNDO`, `REDO` exist in the frontend reducer but are never produced by
the agent** — `SET_PROJECT` is a full replace (not a patch), and `UNDO`/`REDO` are user
history controls, not something a command should produce.

### Relationship to the shared schema
- `packages/shared/src/project.ts` (zod) and `services/api/app/schema.py` (Pydantic) are
  the two mirrored definitions of `Project`/`Word`/`Overlay`/`Style`/`Settings`. The
  agent's `contracts.py` **imports and reuses** `Project`, `Overlay`, `PresetId`,
  `Signals`, and `StylePatch` from `app/schema.py` — it never redefines or duplicates
  the shared shapes.
- `WordPatch` and the three action classes are agent-owned contracts (not part of the
  shared schema itself), matching the frontend reducer's existing action shapes so no
  reducer change is required to apply them.

### `exclude_none` behavior — why it matters
Both routes are declared with `response_model_exclude_none=True`:
```python
@router.post("/command", response_model=AgentCommandResponse, response_model_exclude_none=True)
@router.post("/voice-command", response_model=AgentCommandResponse, response_model_exclude_none=True)
```
Without this, Pydantic would serialize every untouched optional field of a `WordPatch`/
`StylePatch` as JSON `null`. The frontend reducer's `UPDATE_WORD` case does a plain
spread merge: `{ ...word, ...action.patch }`. An explicit `null` in that spread would
**overwrite** a real existing field (e.g. wipe out `word.style.fontSize`) instead of
leaving it untouched. `exclude_none=True` strips every `None` recursively before
serialization, so only the fields a tool actually set are present in the JSON at all —
this is required for the reducer's merge semantics to behave correctly, and P1 must
**not** remove this flag when wiring the router.

---

## 7. Validation Boundary

Implemented in `services/api/app/agent/validation.py`. This is the mechanism that makes
patch application safe.

### `apply_patch(project: Project, patch: AgentPatch) -> Project`
1. Calls `project.model_dump(mode="json")` — this produces a **plain dict copy**;
   `project` itself is never touched.
2. Applies the patch to the dict copy:
   - `UPDATE_WORD`: finds the word by `wordId` in the copy; raises `PatchError` if no
     word with that id exists; merges the patch's non-None fields into that word's dict.
   - `SET_PRESET`: sets `data["presetId"]`.
   - `ADD_OVERLAY`: appends the overlay's dict to `data["overlays"]`.
3. Re-validates the **entire resulting document** via `Project.model_validate(data)` —
   not just the changed field. If validation fails (out-of-range value, wrong type, or
   any cross-field issue), raises `PatchError` and returns nothing.
4. On success, returns a **new** `Project` instance. The original `project` object
   passed in is never mutated, whether `apply_patch` succeeds or raises.

### `apply_patches(project: Project, patches: list[AgentPatch]) -> tuple[Project, str | None]`
- Replays the patches **in order** against `project`, threading the result of each
  successful `apply_patch` into the next.
- **All-or-nothing:** if any patch in the list fails, the function immediately returns
  the **original, unmodified `project`** together with the error string that stopped it
  — none of the preceding patches in that same call are considered "partially applied."
- If every patch succeeds, returns `(final_project, None)`.

### How the planner uses this
`planner.run_agent_command` calls `apply_patches(request.project, collected_patches)`
**once, at the very end**, after the whole tool-use loop finishes — this is the "final
whole-patch-sequence validation" gate. The resulting `Project` from this call is
**discarded** (`del validated_project`) — its only purpose is to confirm the whole
sequence is valid; the agent still returns only `patches`, never a `Project`, per the
stateless-agent architecture. If this final validation fails, the response is
`status="error"` with an empty `patches` list — the caller never sees a patch sequence
that would have produced an invalid project.

This is the guarantee Shubh can rely on: **a `status="ok"` response's `patches`, applied
in order through the existing reducer, are guaranteed to produce a schema-valid
`Project`** — because that exact application was already performed and checked
server-side before the response was ever built.

---

## 8. Tool Registry

Implemented in `services/api/app/agent/tools/registry.py`.

### `ToolStatus`
```python
class ToolStatus(str, Enum):
    AVAILABLE = "available"   # has a real handler, callable
    PLANNED = "planned"        # documented for a future tool, no handler, cannot be called
```

### `ToolSpec`
A frozen dataclass describing one tool:
```python
@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    reads: bool
    writes: bool
    status: ToolStatus
    notes: str = ""
```
`__post_init__` enforces `name` is non-empty and both `input_model`/`output_model` are
real `BaseModel` subclasses.

### `ToolRegistry`
- `register(spec, handler=None)` — raises `ToolAlreadyRegisteredError` on a duplicate
  name. **Enforces at registration time** that an `AVAILABLE` spec must have a handler,
  and a `PLANNED` spec must **not** have one — this makes it structurally impossible to
  register a fake/fabricated implementation for a tool that isn't really built.
- `get_spec(name)` — raises `ToolNotFoundError` if unregistered.
- `get_handler(name)` — raises `ToolNotFoundError` if unregistered, or
  `ToolNotImplementedError` if registered but still `PLANNED` (no handler). These are
  distinct exception types so the planner can tell "doesn't exist" apart from "known but
  not built yet."
- `list_specs(status=None)` — returns specs, optionally filtered by status, sorted by
  name.

### How Bedrock only receives `AVAILABLE` tools
`tool_config.py`'s `build_tool_config()` calls
`registry.list_specs(status=ToolStatus.AVAILABLE)` and builds Bedrock's `toolConfig` only
from that filtered list. There is no other code path that adds a tool name to what's
sent to the model — a `PLANNED` tool is structurally invisible to Bedrock; the model can
never request it because it's never told it exists.

### `default_registry`
The single shared `ToolRegistry` instance every real tool module registers into on
import (via `tools/__init__.py`). As of this report, `tools/catalog.py`'s `PLANNED`
list is **empty** — every tool that was ever scoped for the MVP has a real handler.

---

## 9. All 9 Implemented Tools

All nine are registered as `ToolStatus.AVAILABLE` in `default_registry`. Details below
verified directly against `tools/context_tools.py`, `tools/style_tools.py`,
`tools/project_tools.py`, `tools/vision_tools.py`, and `tools/schemas.py`.

### 1. `get_project_context`
- **Purpose:** Summarize the current project.
- **Input schema:** `GetProjectContextArgs` — no fields (no arguments).
- **Output:** `GetProjectContextResult { durationMs, width, height, presetId, settings, wordCount }`
- **Mutates Project:** No (`reads=True, writes=False`).
- **What it does:** Reads `project.durationMs`, `.width`, `.height`, `.presetId`,
  `.settings`, and `len(project.words)` directly; returns them.
- **Validation/error behavior:** No failure modes — always succeeds.
- **Source:** `tools/context_tools.py`

### 2. `get_timeline`
- **Purpose:** List words in timeline order, optionally windowed by time range.
- **Input schema:** `GetTimelineArgs { fromMs: int | None (>=0), toMs: int | None (>=0) }`
- **Output:** `GetTimelineResult { words: list[TimelineWord] }` where
  `TimelineWord { wordId, text, startMs, endMs }`.
- **Mutates Project:** No.
- **What it does:** Filters `project.words` to those whose span overlaps
  `[fromMs, toMs]` (`endMs > fromMs` and `startMs < toMs` — a word already being spoken
  at `fromMs` is included even if it started earlier).
- **Validation/error behavior:** Raises `ToolExecutionError` if both bounds are given
  and `fromMs > toMs`.
- **Source:** `tools/context_tools.py`

### 3. `find_words`
- **Purpose:** Locate word(s) by text.
- **Input schema:** `FindWordsArgs { query: str (min_length=1), matchType: "exact" | "contains" = "contains" }`
- **Output:** `FindWordsResult { matches: list[TimelineWord] }`
- **Mutates Project:** No.
- **What it does:** Case-insensitive exact or substring match against `word.text`.
  **Zero matches is a normal result, not an error.**
- **Validation/error behavior:** Raises `ToolExecutionError` if the query is blank after
  `.strip()` (Pydantic's `min_length=1` only rejects an empty string, not whitespace).
- **Source:** `tools/context_tools.py`

### 4. `update_caption_style`
- **Purpose:** Apply an arbitrary style patch to one word (color, font, weight,
  uppercase, glow, shake, gradient, x, y, fontSize — any subset of `StylePatch`'s
  fields).
- **Input schema:** `UpdateCaptionStyleArgs { wordId: str, patch: StylePatch }`
- **Output:** `UpdateCaptionStyleResult { patch: UpdateWordAction }`
- **Mutates Project:** **Yes** — produces an `UpdateWordAction` patch (`reads=True, writes=True`).
- **What it does:** Builds `UpdateWordAction(wordId, patch=WordPatch(style=patch))`,
  confirms it validates via `apply_patch` (result discarded), returns the patch.
- **Validation/error behavior:** Raises `ToolExecutionError` (wrapping `PatchError`) if
  `wordId` doesn't exist in `project.words`, or if the resulting document would somehow
  fail schema validation.
- **Source:** `tools/style_tools.py`

### 5. `move_caption`
- **Purpose:** Set a word's x/y position only. A narrow wrapper over
  `update_caption_style` for clearer LLM tool-selection.
- **Input schema:** `MoveCaptionArgs { wordId: str, x: float (0-100), y: float (0-100) }`
- **Output:** `MoveCaptionResult { patch: UpdateWordAction }`
- **Mutates Project:** **Yes.**
- **What it does:** Builds the same style-patch validation path as
  `update_caption_style`, scoped to `StylePatch(x=..., y=...)`.
- **Validation/error behavior:** Same unknown-`wordId` / schema-validation failure modes
  as `update_caption_style`.
- **Source:** `tools/style_tools.py`

### 6. `scale_caption`
- **Purpose:** Set a word's font size only. A narrow wrapper over
  `update_caption_style`.
- **Input schema:** `ScaleCaptionArgs { wordId: str, fontSize: float (>0) }`
- **Output:** `ScaleCaptionResult { patch: UpdateWordAction }`
- **Mutates Project:** **Yes.**
- **What it does:** Same mechanism, scoped to `StylePatch(fontSize=...)`.
- **Validation/error behavior:** Same as `update_caption_style`.
- **Source:** `tools/style_tools.py`

### 7. `apply_preset`
- **Purpose:** Set the project's active preset.
- **Input schema:** `ApplyPresetArgs { presetId: PresetId }` (closed enum:
  `kathmandu | mrbeast | minimal | hinglish-bold` — an unknown value is rejected at
  Pydantic construction, before the handler ever runs).
- **Output:** `ApplyPresetResult { patch: SetPresetAction }`
- **Mutates Project:** **Yes** (`reads=False, writes=True`).
- **What it does:** Builds `SetPresetAction(presetId=...)`, validates via `apply_patch`,
  returns the patch.
- **Validation/error behavior:** Raises `ToolExecutionError` only if the resulting
  document somehow fails validation (the presetId itself is already constrained by the
  enum).
- **Source:** `tools/project_tools.py`

### 8. `add_overlay`
- **Purpose:** Add a free-floating overlay caption/text box.
- **Input schema:** `AddOverlayArgs { text: str, startMs: int (>=0), endMs: int (>=0), x: float (0-100), y: float (0-100), style: StylePatch }`
- **Output:** `AddOverlayResult { patch: AddOverlayAction }`
- **Mutates Project:** **Yes** (`reads=True, writes=True` — reads `project.durationMs`
  for a bounds check).
- **What it does:** Builds a new `Overlay` (id generated as
  `f"overlay-{uuid.uuid4().hex[:8]}"`), wraps it in `AddOverlayAction`, validates via
  `apply_patch`, returns the patch.
- **Validation/error behavior:** Raises `ToolExecutionError` if `startMs >= endMs`, or
  if `endMs > project.durationMs`.
- **Source:** `tools/project_tools.py`

### 9. `analyze_frame`
- **Purpose:** Grab a video frame at a timestamp and return normalized bounding boxes
  for a target ("person" or "face").
- **Input schema:** `AnalyzeFrameArgs { atMs: int (>=0), target: "person" | "face" = "person" }`
- **Output:** `AnalyzeFrameResult { found: bool, boxes: list[BoundingBox] }` where
  `BoundingBox { label, x, y, width, height }` (all 0-100, normalized).
- **Mutates Project:** No (`reads=True, writes=False`).
- **What it does:** Resolves `project.videoUrl` to an `s3://` URI, downloads the video
  from S3, runs `ffmpeg -ss <t> -i <video> -frames:v 1 <frame.jpg>` to extract a single
  JPEG frame, calls Amazon Rekognition `DetectLabels` on the frame, filters results to
  the `"Person"` label (per its own module docstring, `target="face"` is deliberately
  treated identically to `"person"` — a true face-detection API was never chosen for
  this stack), and converts each instance's `BoundingBox` to 0-100 normalized units.
- **Validation/error behavior:** Raises `ToolExecutionError` if `atMs` exceeds
  `project.durationMs`; if `project.videoUrl` doesn't start with `s3://`; or if ffmpeg
  extraction fails. **`grab_frame`/`detect_labels` are dependency-injected** (default to
  the real ffmpeg/boto3 implementations) purely so tests can substitute doubles.
- **Practical status:** Fully implemented, but currently unusable against real data —
  see §16.
- **Source:** `tools/vision_tools.py`

---

## 10. Bedrock / Planner Architecture

Implemented in `services/api/app/agent/planner.py` and
`services/api/app/agent/bedrock_client.py`.

### Model configuration
- `get_model_id()` (`bedrock_client.py`) reads `os.environ.get("BEDROCK_MODEL_ID")`.
  **No default, no fallback, no hard-coded model ID anywhere in the codebase.** If unset
  or empty, raises `ModelConfigurationError` with an explicit message pointing at
  `.env.example`.
- The planner calls `get_model_id()` **before** doing anything else. If it raises, the
  response is immediately `status="error"` and Bedrock is never called.

### `BedrockConverseClient`
A narrow `Protocol`:
```python
class BedrockConverseClient(Protocol):
    def converse(self, **kwargs: Any) -> dict: ...
```
`get_bedrock_client()` constructs the real client:
```python
boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
```
Tests inject a fake object implementing just `.converse(...)` — no other boto3 surface
is depended on anywhere in agent code.

### `toolConfig`
`tool_config.py`'s `build_tool_config()` builds
`{"tools": [{"toolSpec": {"name", "description", "inputSchema": {"json": <model_json_schema()>}}}, ...]}`
from every `AVAILABLE` tool's own Pydantic `input_model` — the exact same model the
planner re-validates arguments against, so the schema shown to Bedrock can never drift
from what's actually accepted.

### The tool-use loop (`run_agent_command`)
1. Build the initial message: `<user_command>\n{command}\n</user_command>` (see §11).
2. Loop up to `MAX_TOOL_ITERATIONS = 6` times:
   a. Call `bedrock.converse(modelId, system=[{"text": SYSTEM_PROMPT}], messages, toolConfig)`.
   b. Append the model's output message to the conversation.
   c. Collect any `toolUse` blocks and any `text` blocks from the response.
   d. If `stopReason != "tool_use"` or there are no tool calls, **break** (the model gave
      a final answer).
   e. For each requested tool call, run `_run_tool(name, input, project)`:
      - **Tool name validation:** `default_registry.get_spec(name)` — unknown name →
        a `toolResult` with `status="error"`, never a crash.
      - **Not-implemented check:** `default_registry.get_handler(name)` — a `PLANNED`
        tool → `status="error"` toolResult, "isn't implemented yet — rejected."
      - **Argument validation:** `spec.input_model.model_validate(tool_input)` — invalid
        arguments → `status="error"` toolResult, "called with invalid arguments —
        rejected."
      - **Tool execution:** `handler(args, request.project)` — a `ToolExecutionError` or
        any unexpected exception is caught and turned into an honest `status="error"`
        toolResult; the loop never crashes on one bad tool call.
      - On success, the tool's writer output's `.patch` (if any) is appended to
        `collected_patches`.
   f. Feed all `toolResult` blocks back to the model as the next user message; loop
      again.
3. If the loop exhausts `MAX_TOOL_ITERATIONS` without a final answer, return
   `status="error"` ("Stopped after too many tool calls without a final answer.").
4. If the final text starts with `UNSUPPORTED:`, return `status="unsupported"`.
5. Otherwise, call `apply_patches(request.project, collected_patches)` — the final
   whole-sequence validation gate (§7). On failure, `status="error"`. On success,
   `status="ok"` with `patches=collected_patches`.

### What must be configured before a real Bedrock call can work
- `BEDROCK_MODEL_ID` must be set to a model ID actually available (model access granted)
  in the target AWS region.
- `AWS_REGION` should be set if the desired region isn't `ap-south-1` (the default).
- Valid AWS credentials must be present in the environment the API process runs in.
- **No Bedrock model has been chosen by the team as of this report.** This is
  confirmed by direct inspection of `bedrock_client.py` and by an explicit existing test
  (`test_bedrock_client.py`) asserting the module's source contains no recognizable
  Bedrock model-id literal.

---

## 11. Prompt Injection / Security

This is the actual, currently-implemented and tested design — not an aspirational
description.

- **System prompt vs. user data:** The system prompt (a fixed string in `planner.py`)
  tells the model what it may do (call one of its given tools) and explicitly states it
  cannot invent, rename, or use a tool it wasn't given, and cannot do anything for which
  there is no tool (its own example list: no zoom, no spotlight/dim, no video
  trim/split).
- **`<user_command>` treatment:** The user's command is wrapped as
  `<user_command>\n{command}\n</user_command>` in the first message. The system prompt
  explicitly instructs the model to ignore any instructions that appear inside those
  tags, or inside a tool result, even if they claim to override the rules, ask it to
  call a different tool, or ask it to ignore previous instructions.
- **Transcript/tool-result isolation:** Tool result text (e.g. transcript content
  surfaced by `get_timeline`/`find_words`) is likewise treated as data per the same
  system-prompt instruction — this extends the same convention already used elsewhere
  in the codebase (root `CLAUDE.md`: "The video transcript is passed to the LLM as data
  ..., never as instructions"; `app/pipeline/tag.py`'s equivalent rule for its own
  angry-word detection).
- **Tool allowlist:** The model can only ever be told about, and therefore can only ever
  request, tools that are `ToolStatus.AVAILABLE` in `default_registry` at the moment
  `build_tool_config()` runs (§8). There is no other code path that could let the model
  reach a tool outside this set.
- **Pydantic argument validation:** Every tool call's arguments are validated against
  that tool's own `input_model` before the handler ever runs (§10 step 2.e).
- **No arbitrary tool execution:** unknown tool names and `PLANNED` (not-yet-implemented)
  tools are rejected with an honest `toolResult(status="error")`, not executed and not
  silently skipped.
- **No direct Project mutation by the LLM:** the model only ever produces tool-call
  requests; the actual patch construction and validation happens entirely in Python
  tool handlers and `validation.py`, never based on model-authored JSON being trusted
  directly as a Project mutation.
- **Unsupported commands:** if no tool combination can satisfy the request, the model is
  instructed to end its final message with `UNSUPPORTED:` followed by a plain sentence;
  the planner turns this into `status="unsupported"` with no patches.
- **Chain-of-thought is never surfaced:** any content block type other than `text` or
  `toolUse` (e.g. a `reasoningContent` block some models may emit) is silently ignored
  by the planner — never placed into `log` or the final response text.

**What is verified by existing tests (`test_planner.py`, `test_voice.py`):** that a
crafted injection string embedded in a command/transcript reaches Bedrock unmodified
inside the `<user_command>` wrapper (i.e. the wrapper is applied, not stripped) and that
an unconfigured model or an out-of-registry tool call is rejected rather than executed.
**What is not claimed or tested:** that any given Bedrock model will actually obey these
instructions — that depends on the model's own behavior, not on code in this repository.

---

## 12. HTTP API Routes

Defined in `services/api/app/agent/router.py`:
```python
router = APIRouter(prefix="/agent", tags=["agent"])
```

### `POST /agent/command`
- **Request model:** `AgentCommandRequest`
- **Response model:** `AgentCommandResponse` (`response_model_exclude_none=True`)
- **Internal function called:** `planner.run_agent_command(request, client=client)`
- **Error behavior:** `run_agent_command` itself already turns every internal failure
  mode into a well-formed `AgentCommandResponse` with `status="error"`. The route adds
  one more `try/except Exception` as a last-resort safety net for something truly
  unexpected (e.g. a raw Bedrock network failure) — a bug there degrades to an honest
  `status="error"` response instead of a raw HTTP 500.
- **Dependency injection / test seam:**
  ```python
  def _default_bedrock_client() -> BedrockConverseClient | None:
      return None
  @router.post("/command", ...)
  def run_command(request: AgentCommandRequest,
                  client: BedrockConverseClient | None = Depends(_default_bedrock_client)) -> AgentCommandResponse:
  ```
  `None` means "use the real client" (both `run_agent_command`/`run_agent_voice_command`
  fall back to `get_bedrock_client()` when `client is None`). Tests override
  `app.dependency_overrides[_default_bedrock_client]` to inject a fake client over HTTP.

### `POST /agent/voice-command`
- **Request model:** `AgentVoiceCommandRequest`
- **Response model:** `AgentCommandResponse` (`response_model_exclude_none=True`)
- **Internal function called:**
  `voice.run_agent_voice_command(project=request.project, transcript=request.transcript, selection=request.selection, client=client)`
  — uses the `transcript=` path only; there is no `audio_bytes` path reachable over
  HTTP today (see §14).
- **Error behavior:** identical last-resort `try/except Exception` pattern as
  `/agent/command`.
- **Dependency injection:** same `_default_bedrock_client` seam, shared with
  `/agent/command`.

### Critical current integration state — read this before touching `main.py`

**`router.py` is fully implemented and already wired to the real planner and voice
functions. It is exercised for real by `test_router.py` via its own throwaway
`TestClient` app defined inside that test file.**

**However, `services/api/app/main.py` does NOT import or include this router.**
Verified directly: `main.py` currently only defines `GET /health` and CORS middleware —
there is no `app.include_router(...)` call anywhere in it, and no import of
`app.agent.router`. Confirmed by reading `main.py` in full:

```python
"""API entrypoint (P1). Routers for the pipeline and agent get added here."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Expressive Captions API")
app.add_middleware(CORSMiddleware, ...)

@app.get("/health")
def health():
    return {"ok": True}
```

**Therefore `/agent/command` and `/agent/voice-command` are not exposed by the real,
running FastAPI application yet.** They exist only via direct Python import or a test's
own ad hoc app. This document does not modify `main.py` — that change belongs to P1
(§13).

---

## Integration Instructions for P1 / Shubh

The **only** structural change required to expose these routes on the real running API,
based on the actual current source of `router.py`:

1. **Import the agent router** in `services/api/app/main.py`:
   ```python
   from app.agent.router import router as agent_router
   ```
   (`router` is the exact object name defined in `services/api/app/agent/router.py`:
   `router = APIRouter(prefix="/agent", tags=["agent"])`.)

2. **Add** `app.include_router(agent_router)` after the `app = FastAPI(...)` /
   middleware setup. Because `router.py` already sets `prefix="/agent"`, this alone
   exposes both `POST /agent/command` and `POST /agent/voice-command` at those exact
   paths — no additional prefix or path argument is needed.

3. **Preserve existing `CORS` and `/health` behavior** — do not remove or reorder the
   existing `CORSMiddleware` registration or the `/health` route; only add the import
   and the one `include_router` call.

4. **Do not duplicate route definitions.** Do not re-declare `/agent/command` or
   `/agent/voice-command` directly in `main.py` — `router.py` already owns them.

5. **Do not recreate planner logic in `main.py`.** All tool-use-loop, validation, and
   Bedrock-calling logic already lives in `planner.py`/`voice.py`; `main.py` should only
   ever mount the router.

6. **Do not modify agent contracts** (`contracts.py`) as part of this integration —
   they are P4-owned per root `CLAUDE.md`'s ownership table
   (`services/api/app/agent` → P4).

7. **Do not bypass validation.** Do not add a code path that returns patches without
   going through `planner.run_agent_command` → `validation.apply_patches`.

8. **Do not expose tools directly as public endpoints.** Tools are only reachable
   through the planner's tool-use loop and the registry's name/argument validation —
   never add a route that calls a tool handler directly with client-supplied arguments.

9. **Do not add authentication** to these routes unless separately requested — root
   `CLAUDE.md` explicitly scopes this MVP as "no auth."

10. **`analyze_frame` / S3 dependency:** mounting the router does **not** make
    `analyze_frame` usable. It requires `project.videoUrl` to be a real, backend-
    readable `s3://` URI. Every `Project` fixture in this repository currently has a
    bare filename (e.g. `"demo.mp4"`) as `videoUrl`, so `analyze_frame` will honestly
    raise `ToolExecutionError` for any real request until P1's video/S3 storage
    integration exists. This is expected, documented behavior (§16), not something to
    "fix" by touching agent code.

Beyond the one-line `include_router` change (plus its import), and setting
`BEDROCK_MODEL_ID`/`AWS_REGION` in the environment (§19), **no other backend code
change is required** to make `/agent/command` reachable and able to run a real command
against a configured Bedrock model.

---

## 14. Voice Architecture

Implemented in `services/api/app/agent/voice.py`. Hard rule stated in its own module
docstring: **voice and typed commands use the same planner** — there is no second
tool-use loop or parallel validation path for voice.

### A. Transcript path — IMPLEMENTED
`run_agent_voice_command(project=..., transcript="...", ...)` passes the string straight
into a real `AgentCommandRequest` and calls `planner.run_agent_command` — the identical
code path a typed command uses. This is fully implemented and tested, including through
the `/agent/voice-command` HTTP route (once mounted per §13).

### B. Raw audio path — INFRASTRUCTURE ONLY / PROVIDER MISSING
`run_agent_voice_command(project=..., audio_bytes=b"...", ...)` calls a
`VoiceTranscriber`:
```python
class VoiceTranscriber(Protocol):
    def transcribe(self, audio_bytes: bytes) -> str: ...

def get_voice_transcriber() -> VoiceTranscriber:
    name = (os.environ.get("VOICE_TRANSCRIBER") or "").strip().lower()
    if not name:
        raise TranscriberNotConfiguredError(...)
    raise TranscriberNotConfiguredError(f"VOICE_TRANSCRIBER={name!r} is not a recognized ...")
```
**Every possible value of `VOICE_TRANSCRIBER` — set or unset — currently raises
`TranscriberNotConfiguredError`.** No STT provider is implemented. This is intentional,
documented behavior (mirrors `get_model_id()`'s "never guess" pattern), not a bug to
silently patch. **This path is also not reachable over HTTP today** —
`AgentVoiceCommandRequest` only carries `transcript`, not `audio_bytes` (§4).

### C. Browser microphone capture — NOT IMPLEMENTED
`apps/web/src/components/agent/MicButton.tsx` only toggles a local React state value
(`idle` ↔ `listening`) with a pulse animation. There is no `getUserMedia` call, no audio
stream, anywhere in the frontend.

### D. Browser `SpeechRecognition` — NOT IMPLEMENTED
No use of the Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`) exists
anywhere in `apps/web/src`.

### E. AWS Transcribe Streaming — NOT IMPLEMENTED
Does not exist anywhere in this repository. Note: `services/api/app/pipeline/stt.py`
does use AWS Transcribe, but for a **separate, unrelated batch job** against
pre-uploaded video (`hi-IN`, seconds-to-minutes latency) — explicitly documented in
`voice.py`'s own module docstring as "unsuitable for a live command and a different
problem than this module solves." It is not reused for live voice commands.

**Summary:** voice input can only currently reach the planner via the `transcript=`
path — i.e. only if something upstream (browser or otherwise) already turned speech into
text and calls `/agent/voice-command` (once mounted) with that string. Nothing in this
repository currently produces that transcript from real speech.

---

## 15. Frontend Integration Status

**No frontend files were modified to produce this report, and none should be modified
as part of this backend integration.** Documented as observed only.

- **`AgentCommandBar.tsx`** (`apps/web/src/components/agent/AgentCommandBar.tsx`) — a
  real, working text-input UI with a mic button and suggestion chips. On submit, it
  calls a prop `onSubmitCommand(command)` — it has no knowledge of any API.
- **`MicButton.tsx`** — a real toggle UI component only; no audio capture (§14.C).
- **`AgentActivityPanel.tsx`** — a real display component; renders whatever entries
  `useAgentActivity` provides.
- **`useAgentActivity.ts`** — its own docstring states this directly: *"Placeholder
  shape for local UI rendering only — not the real agent protocol... Logs real, honest
  local activity — never a fabricated agent/AI action."* It derives log entries only
  from real local state transitions (initial project load, preset changes, video
  uploads) plus manually-added entries for mic toggle / command submit. **It has no
  method today to append a backend-provided `AgentLogEntry[]` batch.**
- **`App.tsx`'s `handleSubmitCommand`:**
  ```ts
  function handleSubmitCommand(command: string) {
    addEntry(`Command submitted: "${command}" (agent not connected yet)`)
  }
  ```
  This is a hardcoded placeholder — it does not call `fetch`, does not know the API URL,
  and does not dispatch anything into the project reducer.
- **Project reducer** (`apps/web/src/state/project-reducer.ts`) — untouched by any agent
  work. Its `UPDATE_WORD`/`SET_PRESET`/`ADD_OVERLAY` actions already exist and match the
  agent's patch shapes exactly (by design — see §6), but nothing currently dispatches an
  agent-derived action into it.

**What P3 still needs to connect** (unchanged from the Phase 8 audit's own findings,
confirmed still true by direct inspection):
1. Replace `handleSubmitCommand`'s placeholder with a real `fetch POST /agent/command`
   (once P1 mounts it), dispatching the returned `patches` through the existing reducer
   and appending `log` entries.
2. Add a method to `useAgentActivity.ts` to append a backend-provided
   `AgentLogEntry[]` batch, preserving its own `id`/`timestamp` rather than regenerating
   them.
3. Wire real microphone capture / browser `SpeechRecognition` into `MicButton.tsx` (or a
   new hook), feeding into the same submit path — blocked on a team decision on STT
   provider (§14).

---

## 16. analyze_frame / S3 Dependency

`analyze_frame` (tools/vision_tools.py) is a real, complete implementation of the
approved vision pipeline (root `CLAUDE.md`: "ffmpeg frame grab → Rekognition
DetectLabels"), but it is **currently unusable against any Project in this
repository**, for a concrete, verifiable reason:

- `_resolve_media_location(project)` requires `project.videoUrl` to start with
  `"s3://"`. If it doesn't, it raises `ToolExecutionError` explaining that no
  video-upload/storage integration exists yet.
- **Every `Project` fixture currently in `packages/shared/fixtures/` has a bare
  filename as `videoUrl`** (e.g. `"demo.mp4"`), not an `s3://` URI.
- Therefore `analyze_frame` will **always** fail with this honest error against any
  Project derived from the repo's existing fixtures — this is intended behavior (per the
  module's own docstring: "fail honestly ... rather than inventing a result"), not a
  placeholder awaiting a quick fix inside agent code.

The pipeline itself, when a real `s3://` URI is eventually available, works as follows:
1. `_grab_frame_bytes(s3_uri, at_ms)` downloads the video from S3 via boto3, then runs
   `ffmpeg -ss <seconds> -i <video> -frames:v 1 <frame.jpg>` to extract a single JPEG
   frame at the requested timestamp.
2. `_detect_labels(frame_bytes)` calls Amazon Rekognition's `DetectLabels` API
   (`MaxLabels=25, MinConfidence=55`) on the frame bytes.
3. Only the `"Person"` label's `Instances[].BoundingBox` entries are kept; each box's
   `Left/Top/Width/Height` (0-1 fractions from Rekognition) is converted to 0-100
   normalized percentages — the same unit convention as `Style.x`/`Style.y` — so a box
   can feed directly into `move_caption` without unit conversion.
4. `target="face"` is treated identically to `target="person"` — there is no true
   face-detection call in this pipeline (Rekognition's separate `DetectFaces` API was
   never chosen; the approved architecture also excludes face recognition from MVP
   scope).

**No real (live AWS) Rekognition or S3 call has been tested against this code.** All
existing tests (`test_vision_tools.py`) inject fake `grab_frame`/`detect_labels`
callables at the function's own dependency-injection parameters — the real boto3/ffmpeg
code paths have not been exercised against live AWS in this repository.

---

## 17. Unsupported / Out-of-Scope Features

**SUPPORTED** (confirmed present as real fields in both `packages/shared/src/project.ts`
and `services/api/app/schema.py`, and settable today via `update_caption_style`):
- **shake** — `Style.shake: number` (amplitude in px, 0 = none)
- **glow** — `Style.glow: number`
- **gradient** — `Style.gradient: [string, string]` (a two-color tuple)
- Also supported via the schema (though not the specific list requested): `color`,
  `fontFamily`, `fontSize`, `weight`, `uppercase`, `x`, `y` — all part of `Style`/
  `StylePatch` and settable the same way.

**NOT SUPPORTED** — no representation anywhere in the shared schema, and explicitly
excluded from the tool catalog:
- **zoom** — no `zoom` field on `Style`, `Word`, or `Overlay`. `tools/catalog.py`
  explicitly documents `add_zoom` as deliberately not catalogued, "needs a lead-approved
  schema change first."
- **spotlight / dim other content** — same: no schema field; `spotlight_caption`
  explicitly documented as deliberately not catalogued for the same reason. The
  planner's own system prompt tells the model directly that it cannot do this.
- **trim / split / cut (general video editing)** — explicitly excluded from MVP scope by
  root `CLAUDE.md` ("no general video editing"), not merely unbuilt; `tools/catalog.py`
  explicitly excludes `trim_video`/`split_video` for this reason.
- **object/face tracking** — explicitly excluded from MVP scope by root `CLAUDE.md`
  ("no object tracking"); `analyze_frame`'s handling of `target="face"` degrading to
  `"person"` (§9, §16) reflects this — there is no real face-tracking capability.

**When a schema change would be required:** adding zoom or spotlight/dim support would
require adding new fields to `Style` (or a new concept entirely) in
`packages/shared/src/project.ts` **and** the mirrored `services/api/app/schema.py`,
together, in the same PR, by the lead — per root `CLAUDE.md`'s explicit rule ("changes
need team agreement" / "they change together, in the same PR, by the lead"). No such
change is included in, or should be inferred from, this report.

---

## 18. End-to-End Example

These examples trace an already-implemented flow; they assume the router is mounted
(§13) and a real `BEDROCK_MODEL_ID` is configured (§19) — neither is true yet in the
running application, but the underlying code path they describe is real and tested.

### Example 1 — "Make the word insane yellow"
```
command: "make the word insane yellow"
  → planner.run_agent_command()
    → Bedrock requests: find_words(query="insane", matchType="contains")
      → context_tools.find_words() → FindWordsResult(matches=[{wordId: "w1", text: "insane", ...}])
    → Bedrock requests: update_caption_style(wordId="w1", patch={color: "#FFFF00"})
      → style_tools.update_caption_style()
        → builds UpdateWordAction(wordId="w1", patch=WordPatch(style=StylePatch(color="#FFFF00")))
        → validation.apply_patch() confirms it validates (result discarded)
        → returns UpdateCaptionStyleResult(patch=<that UpdateWordAction>)
    → planner collects that .patch into collected_patches
    → Bedrock's final text: "Made the word 'insane' yellow."
  → validation.apply_patches(project, collected_patches) → succeeds
  → AgentCommandResponse{
      status: "ok",
      patches: [{ type: "UPDATE_WORD", wordId: "w1", patch: { style: { color: "#FFFF00" } } }],
      log: [...]
    }
  → frontend reducer (once wired): dispatch({ type: "UPDATE_WORD", wordId: "w1", patch: { style: { color: "#FFFF00" } } })
```

### Example 2 — "Make the captions bigger"
```
command: "make the captions bigger"
  → planner.run_agent_command()
    → Bedrock requests: get_timeline() or find_words() to identify target word(s)
      (exact targeting is the model's choice among available read tools — not fixed by this code)
    → Bedrock requests: scale_caption(wordId="w1", fontSize=64)
      → style_tools.scale_caption()
        → builds UpdateWordAction(wordId="w1", patch=WordPatch(style=StylePatch(fontSize=64)))
        → validates via apply_patch(); returns the patch
    → planner collects the patch
  → validation.apply_patches() succeeds
  → AgentCommandResponse{
      status: "ok",
      patches: [{ type: "UPDATE_WORD", wordId: "w1", patch: { style: { fontSize: 64 } } }],
      log: [...]
    }
```
Note: `scale_caption` operates per-word (it targets a `wordId`), matching the tool's
actual signature — it does not have a project-wide "all captions" mode.

### Example 3 — "Apply the MrBeast preset"
```
command: "apply the mrbeast preset" / "switch to mrbeast style"
  → planner.run_agent_command()
    → Bedrock requests: apply_preset(presetId="mrbeast")
      → project_tools.apply_preset()
        → builds SetPresetAction(presetId="mrbeast")
        → validates via apply_patch(); returns the patch
    → planner collects the patch
  → validation.apply_patches() succeeds
  → AgentCommandResponse{
      status: "ok",
      patches: [{ type: "SET_PRESET", presetId: "mrbeast" }],
      log: [...]
    }
  → frontend reducer: dispatch({ type: "SET_PRESET", presetId: "mrbeast" })
```

### Example 4 — "Move this caption to the top"
```
command: "move this caption to the top"
  → planner.run_agent_command()
    → Bedrock requests: find_words(...) or uses selection context to identify wordId
    → Bedrock requests: move_caption(wordId="w1", x=50, y=10)
      → style_tools.move_caption()
        → builds UpdateWordAction(wordId="w1", patch=WordPatch(style=StylePatch(x=50, y=10)))
        → validates via apply_patch(); returns the patch
    → planner collects the patch
  → validation.apply_patches() succeeds
  → AgentCommandResponse{
      status: "ok",
      patches: [{ type: "UPDATE_WORD", wordId: "w1", patch: { style: { x: 50, y: 10 } } }],
      log: [...]
    }
```

---

## 19. Current Environment Configuration

Only variables actually read by the current agent code are documented here (verified by
direct inspection of `bedrock_client.py` and `voice.py`). No credentials/secrets are
included.

| Variable | Read by | Required? | Behavior when missing |
|---|---|---|---|
| `BEDROCK_MODEL_ID` | `bedrock_client.get_model_id()` | Yes, for any real command | Raises `ModelConfigurationError`; the planner returns `status="error"` before ever calling Bedrock. No default value exists. Listed (blank) in `.env.example`. |
| `AWS_REGION` | `bedrock_client.get_bedrock_client()` (and `vision_tools.py`) | No | Defaults to `"ap-south-1"` if unset. |
| `VOICE_TRANSCRIBER` | `voice.get_voice_transcriber()` | N/A — no value currently succeeds | Any value (including unset) raises `TranscriberNotConfiguredError`; only relevant to the `audio_bytes` path, which is not reachable over HTTP anyway (§14). Not present in `.env.example` today. |

`.env.example` at the repo root also defines `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`S3_BUCKET`, `DYNAMO_TABLE`, `DEV_PREFIX`, `CORS_ORIGINS`, `VITE_API_URL`,
`VITE_USE_FIXTURE` — none of these are read directly by agent code (`CORS_ORIGINS` is
read by `main.py`, unrelated to the agent).

---

## 20. Testing / Verification

**Total: 99 test functions across 10 files**, all under
`services/api/app/agent/tests/`. Verified by direct inspection and execution.

**Important invocation note:** these are **not** pytest-collected tests in the
conventional sense — each file is a standalone script with its own `main()` and
`if __name__ == "__main__": raise SystemExit(main())`, using a hand-rolled
`check(name, condition)` / `FAILURES` assertion pattern. The correct way to run one is:
```
cd services/api && python -m app.agent.tests.test_contracts
```
(and so on for each of the other 9 modules). Running them under a bare `pytest`
invocation mis-collects several of them as if their helper parameters were pytest
fixtures — this is an invocation mismatch, not a defect in the code.

**Verified passing** (all 10 scripts, executed with `BEDROCK_MODEL_ID` set to a
placeholder value so model-configuration-dependent tests can proceed past that guard):
`test_contracts`, `test_tool_registry`, `test_context_tools`, `test_mutation_tools`,
`test_vision_tools`, `test_tool_config`, `test_bedrock_client`, `test_planner`,
`test_voice`, `test_router` — all passed in full.

**What is covered:**
- Contract round-trips and construction-time rejection of invalid patch values
  (`test_contracts.py`)
- Registry `AVAILABLE`/`PLANNED` semantics, no-fabricated-handler guarantees, exclusion
  of out-of-scope tools from the catalog (`test_tool_registry.py`)
- All 3 context tools including windowing edge cases, case-insensitivity, zero-match and
  blank-query handling (`test_context_tools.py`)
- All 5 mutation tools including unknown-`wordId` and out-of-range/inverted-time-range
  rejection (`test_mutation_tools.py`)
- `analyze_frame` with injected ffmpeg/boto3 fakes, honest-failure-on-missing-media
  behavior (`test_vision_tools.py`)
- `toolConfig` generation reflecting only `AVAILABLE` tools (`test_tool_config.py`)
- `get_model_id()`'s no-default/no-guess behavior, and the no-hardcoded-model-id
  assertion (`test_bedrock_client.py`)
- The tool-use loop, unconfigured-model short-circuit, prompt-injection wrapper
  presence, iteration cap (`test_planner.py`)
- Voice transcript/`audio_bytes` dispatch, mutual-exclusivity usage errors,
  transcription-error handling (`test_voice.py`)
- Both HTTP routes over a real `TestClient`, dependency-injected fake Bedrock client,
  `exclude_none` serialization correctness (`test_router.py`)

**Intentionally mocked/faked** (the only things ever replaced in a test, per this
codebase's own stated testing principle): the Bedrock `.converse()` call (fake
`BedrockConverseClient` doubles), and `analyze_frame`'s `grab_frame`/`detect_labels`
callables (fake ffmpeg/boto3 doubles). Everything else — tool lookup, argument
validation, tool execution, patch validation — runs as real, unmodified production code
in every test.

**What has NOT been tested:**
- Any real (live AWS) call — Bedrock, Rekognition, S3, or boto3 in general.
- The real, mounted FastAPI application with the agent router included (since it isn't
  mounted yet — `test_router.py` uses its own throwaway app, not `app.main.app`).
- Any frontend integration — no test in this repository exercises
  `AgentCommandBar`/`App.tsx`/the reducer against a real or fake backend response.

---

## 21. Current Git / Implementation Status

- **Branch:** `aman/ai-agent`
- **Latest commit (before this documentation commit):** `52a3f53` — "feat(agent): wire
  router to the real planner and voice functions"
- **Working tree state (before adding this file):** clean — `git status --short`
  produced no output.
- **This documentation file (`ai-agent-report.md`) is new** — it did not exist in the
  repository before this change; it introduces no code changes to any existing file.
- **Push status:** at the time of writing, `origin/aman/ai-agent` does not exist on the
  remote (only `origin/aman/editor-ui`, `origin/divue/editor-ui`, and `origin/master`
  are present) — this branch has not been pushed before. (See end-of-task report for the
  actual push/PR outcome of this specific change.)

---

## 22. Final Implementation Checklist

### Already Built
- [x] `contracts.py` — all request/response/patch Pydantic models
- [x] `validation.py` — `apply_patch`/`apply_patches`, copy-before-mutate, all-or-nothing
- [x] `tools/registry.py` — `ToolSpec`/`ToolRegistry`/`ToolStatus` engine
- [x] All 9 tools, real handlers, `AVAILABLE`: `get_project_context`, `get_timeline`,
      `find_words`, `update_caption_style`, `move_caption`, `scale_caption`,
      `apply_preset`, `add_overlay`, `analyze_frame`
- [x] `planner.py` — bounded Bedrock Converse tool-use loop, prompt-injection isolation,
      final patch-sequence validation
- [x] `bedrock_client.py` — model-agnostic client/config, no hardcoded model ID
- [x] `tool_config.py` — `AVAILABLE`-only tool exposure to Bedrock
- [x] `voice.py` — transcript path fully wired through the same planner
- [x] `router.py` — both HTTP routes, implemented and tested (not yet mounted)
- [x] 99 passing verification tests across 10 files

### Built but Not Connected
- [ ] `/agent/command` / `/agent/voice-command` — implemented, not mounted on
      `app/main.py`
- [ ] `analyze_frame` — implemented, unusable until real `s3://` video storage exists
- [ ] Frontend UI shells (`AgentCommandBar`, `MicButton`, `AgentActivityPanel`) — built,
      call nothing on the backend

### P1 / Shubh
- [ ] Import `router` from `app.agent.router` in `services/api/app/main.py`
- [ ] `app.include_router(agent_router)` — preserve existing CORS/`/health`
- [ ] Provide real S3/video storage so `Project.videoUrl` becomes a real `s3://` URI
      (unblocks `analyze_frame`)

### P3 / Frontend
- [ ] Replace `App.tsx`'s `handleSubmitCommand` placeholder with a real
      `fetch POST /agent/command`, dispatch `patches` through the existing reducer
- [ ] Add a way for `useAgentActivity.ts` to ingest a backend `AgentLogEntry[]` batch
- [ ] Wire real microphone capture / `SpeechRecognition` into `MicButton.tsx`

### P4 / AI Agent
- [ ] No blocking work for the currently-scoped tool set — core agent, all 9 tools,
      planner, validation, and voice text-path are complete and tested
- [ ] Implement a real `VoiceTranscriber` only if/when the team decides on a backend STT
      provider
- [ ] Add new tools only if `packages/shared`'s schema grows (e.g. future zoom/spotlight
      support), and only after that schema change is lead-approved

### Team Decisions
- [ ] Choose a Bedrock model and set `BEDROCK_MODEL_ID` (blocks any real LLM call)
- [ ] Decide the STT approach: in-browser `SpeechRecognition` vs. backend streaming STT
      (blocks the `audio_bytes` path and real mic wiring)
- [ ] Approve schema changes if zoom/spotlight/dim effects are ever wanted

### Future / Out of Scope
- zoom, spotlight/dim — no schema representation; requires lead-approved schema change
- general video editing (trim/split/cut) — explicitly excluded from MVP by root
  `CLAUDE.md`
- object/face tracking — explicitly excluded from MVP by root `CLAUDE.md`
- raw audio upload over HTTP for `/agent/voice-command` — no wire format decided

---

## 23. Claude Code Handoff Instructions

For any future Claude Code session working on this repository:

- Treat root `CLAUDE.md` as **binding project context** — its ownership table, scope
  exclusions (no auth, no Step Functions, no object tracking, no general video editing),
  and "agent never edits pixels" rule are not suggestions.
- Treat this document (`ai-agent-report.md`) as the **AI-agent implementation
  reference** — it describes the code as it exists, verified against source, not a
  design proposal.
- **Inspect the actual source file before changing anything** — this document is a
  snapshot; the code is the ground truth. If something here appears to conflict with
  what you read in the source, trust the source and update this document rather than
  the other way around.
- **Preserve ownership boundaries**: `packages/shared` (schema) needs lead agreement;
  `services/api/app/agent` is P4-owned; `apps/web` is P3-owned; `remotion/` is P2-owned.
  If a task needs a change outside its owning folder, stop and flag it — do not make the
  cross-boundary change unilaterally.
- **Do not duplicate existing agent logic.** The tool-use loop, validation boundary, and
  tool registry already exist and are tested — do not re-implement any part of them
  elsewhere (e.g. inside `main.py` or the frontend) to work around wiring.
- **Do not redesign contracts** (`contracts.py`'s request/response/patch shapes)
  without coordinating with P4/lead — the frontend reducer and this API are already
  matched field-for-field; an uncoordinated change breaks that match silently.
- **Do not modify the shared schema** (`packages/shared/src/project.ts` /
  `services/api/app/schema.py`) without lead approval — they must always change
  together, in the same PR.
- **Do not touch frontend files while doing P1/backend work**, and vice versa — keep
  changes scoped to the owning folder for the task at hand.
- **Do not expose unsupported tools** or bypass the `ToolRegistry`'s `AVAILABLE`/
  `PLANNED` gate — a tool must never be reachable by the model, or by any HTTP endpoint,
  until it has a real, registered handler.
- **Preserve the existing validation and security behavior**: the all-or-nothing patch
  validation (§7), the prompt-injection isolation via `<user_command>` wrapping (§11),
  and the `exclude_none` response serialization (§6) are load-bearing — do not remove or
  weaken any of them while integrating the router.
