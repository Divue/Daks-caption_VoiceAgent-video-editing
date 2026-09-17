# Phase 7 — Voice Input Integration

## Status
COMPLETE

## Objective
Turn voice input into a plain text command that flows through the exact
same Phase 6 planner (`run_agent_command`), with no second agent, no
duplicated validation, and an honest, configurable STT provider boundary —
without deciding which foundation model or which STT provider the project
uses. See [phase-06-planner.md](phase-06-planner.md) for the planner this
phase reuses unmodified.

## Implementation

- **`voice.py`** (new, the only production file this phase adds):
  - `VoiceTranscriber` — a one-method `Protocol` (`transcribe(audio_bytes:
    bytes) -> str`). The entire real STT provider boundary.
  - `TranscriptionError` / `TranscriberNotConfiguredError` /
    `EmptyTranscriptionError` — an honest-failure exception hierarchy
    mirroring `bedrock_client.ModelConfigurationError`'s pattern exactly.
  - `get_voice_transcriber()` — reads `VOICE_TRANSCRIBER` from the
    environment. **There is currently no recognized value that succeeds**
    — any value (including unset) raises `TranscriberNotConfiguredError`.
    This is not a stub left unfinished; it is the honest reflection of
    reality (see "STT Architecture").
  - `run_agent_voice_command(*, project, audio_bytes=None, transcript=None,
    selection=None, transcriber=None, client=None)` — the one new public
    entry point. Accepts **exactly one** of:
    - `transcript`: text already recognized elsewhere (e.g. a browser's own
      speech recognition) — no transcriber is invoked at all.
    - `audio_bytes`: raw audio, transcribed via `transcriber` (defaults to
      `get_voice_transcriber()`).
    Either way, once real, non-blank text exists, it is passed
    **completely unmodified** into a real `AgentCommandRequest` and handed
    to the real, untouched `planner.run_agent_command` — this is the
    entire mechanism satisfying "voice and typed commands use the SAME
    planner." Voice-specific log entries (e.g. "transcribing audio") are
    prepended to the planner's own log, so the combined log reads in
    order; nothing about the planner's own behavior is altered or
    special-cased for voice.
- **`tests/test_voice.py`** (new) — see "Testing."

**No changes to any file from Phases 1–6.** Verified directly: `git diff
--stat` against `planner.py`, `bedrock_client.py`, `tools/`, `contracts.py`,
`validation.py`, and every prior test file shows zero lines changed.

## STT Architecture

```
                 transcript (already recognized text, e.g. browser STT)
                        │
                        ▼
audio_bytes ──▶ VoiceTranscriber.transcribe() ──▶ text ──▶ [same as typed text from here]
   (raw audio)   (get_voice_transcriber(): NO           │
                  working provider configured yet)       ▼
                                                    AgentCommandRequest(command=text, ...)
                                                          │
                                                          ▼
                                              planner.run_agent_command()   <- Phase 6, unmodified
                                                          │
                                                          ▼
                                                  AgentCommandResponse
```

**Why no concrete STT provider was implemented, stated plainly (not a gap
being papered over):**
- The only STT integration that exists anywhere in this repository
  (`app/pipeline/stt.py`) is AWS Transcribe **batch** — a submit-a-job-and-
  poll flow with seconds-to-minutes latency, built for pre-uploaded video
  captioning. It is architecturally unsuitable for a live voice command,
  which needs a near-instant round trip; using it here would silently
  produce a broken user experience, not a working feature.
- Real backend streaming transcription (AWS Transcribe *streaming*) needs
  the separate `amazon-transcribe` async SDK package, which is not in
  `services/api/requirements.txt` and was not decided or evaluated by the
  team for this use case (only the batch API was bake-off-tested, and only
  for video captioning). Adding a new production dependency and a
  genuinely different (async, bidirectional) I/O pattern is a real
  architectural decision this phase's instructions do not authorize me to
  make unilaterally.
- A local model (`faster-whisper`) already exists as a *known, evaluated*
  option — but only inside `services/api/scripts/stt_bakeoff/`'s own
  isolated dev dependencies, explicitly commented out there
  ("~3GB model download"), and root `CLAUDE.md`'s own dev-isolation rule
  is explicit: *"never add a dev-script dependency to
  services/api/requirements.txt (that image ships to production)."* Adding
  it to the production agent would violate a rule the team already wrote
  down, not just skip a nice-to-have.
- The originally approved architecture plan's own open-decisions list
  (§19, produced before Phase 1) already named this as unresolved:
  *"Voice-to-text approach: browser SpeechRecognition vs. AWS Transcribe
  streaming."* Nothing has resolved it since.

Given all of that, implementing a concrete provider now would mean
guessing at a decision that is explicitly the team's to make — the
opposite of "do not fabricate transcription results." The clean interface
(`VoiceTranscriber`) plus an honest "not configured" boundary
(`get_voice_transcriber()`) is the correct scope for this phase, mirroring
exactly how Phase 6 handled the Bedrock model choice.

**Forward compatibility, explicitly designed for:** wiring in a real
provider later (whichever the team picks) requires touching only
`get_voice_transcriber()` — add one branch checking
`VOICE_TRANSCRIBER == "<chosen-provider>"` and return a class implementing
`VoiceTranscriber`. Nothing about `run_agent_voice_command`, the planner,
or any tool changes.

## Interfaces

```python
class VoiceTranscriber(Protocol):
    def transcribe(self, audio_bytes: bytes) -> str: ...

def run_agent_voice_command(
    *, project: Project,
    audio_bytes: bytes | None = None, transcript: str | None = None,
    selection: SelectionContext | None = None,
    transcriber: VoiceTranscriber | None = None,
    client: BedrockConverseClient | None = None,
) -> AgentCommandResponse
```
No changes to `AgentCommandRequest`, `AgentCommandResponse`, `AgentPatch`,
`SelectionContext` (Phase 1), or to any tool contract (Phases 2–5) — voice
input produces exactly the same response shape a typed command does, which
is what makes "same planner" a literal, checkable fact rather than a design
aspiration: `test_voice_transcript_reaches_the_same_planner_response_as_typed_text`
runs the identical command through both `run_agent_voice_command` and
`run_agent_command` directly (with separately-scripted but identical fake
clients) and asserts the resulting patches are equal and the wrapped
message sent to "Bedrock" is byte-identical in both paths.

## Security

Every security property Phase 6 already established applies to voice
commands automatically, because voice text enters the identical code path
— not re-implemented, not re-verified at a different layer, and therefore
not a place a second, weaker implementation could quietly diverge:

- **Untrusted-data wrapping**: a transcribed command is wrapped in
  `<user_command>...</user_command>` and kept out of the system prompt
  channel, exactly like typed text. Verified directly:
  `test_prompt_injection_style_transcription_is_isolated_as_data` sends an
  injection-style transcript and inspects the actual message/system
  content the fake Bedrock client received.
- **No validation bypass**: `test_voice_input_cannot_bypass_tool_validation`
  and `test_voice_input_real_tool_execution_error_is_not_bypassed` script
  the same invalid-argument and unknown-wordId scenarios `test_planner.py`
  already covers for typed text, run through the voice entry point instead,
  and confirm identical rejection behavior (no patch, honest log entry).
- **Transcription errors never reach the planner as if they were valid
  commands.** A `TranscriptionError` (including "no provider configured")
  or a blank transcription short-circuits `run_agent_voice_command` before
  `AgentCommandRequest` is ever constructed — `client.calls == []` is
  asserted in every such test, proving Bedrock is never invoked on bad
  input, matching Phase 6's own "misconfiguration short-circuits before
  any Bedrock call" pattern.
- **No second implementation to audit separately.**
  `test_run_agent_voice_command_calls_the_real_planner_function_not_a_copy`
  monkeypatches the actual `run_agent_command` reference inside `voice.py`
  with a spy and confirms it is called exactly once, with a real
  `AgentCommandRequest` carrying the transcribed text — direct proof there
  is no parallel tool-use loop, no parallel validation, and no parallel
  prompt-injection handling living in this module.

## Error Handling

| Failure | Where caught | Result |
|---|---|---|
| Neither/both of `audio_bytes`/`transcript` given | `run_agent_voice_command`, immediately | `ValueError` (a caller contract violation, not a runtime data problem — not part of `AgentCommandResponse`) |
| No STT provider configured (`audio_bytes` path) | `get_voice_transcriber()` → `TranscriberNotConfiguredError` | `status="error"`, Bedrock never called |
| Transcriber raises any `TranscriptionError` | `run_agent_voice_command` | `status="error"`, Bedrock never called, real error message logged |
| Transcription (or given transcript) is blank/whitespace-only | `run_agent_voice_command`'s explicit check | `status="error"`, Bedrock never called |
| Everything downstream (invalid tool args, unknown tool, `ToolExecutionError`, iteration cap, final validation failure) | Phase 6's `planner.py`, unmodified | Identical to the typed-text path — see [phase-06-planner.md](phase-06-planner.md) |

## Testing

Run from the repo root:
```
python -m py_compile services/api/app/agent/voice.py services/api/app/agent/tests/test_voice.py
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

**Phases 1–6 regression check:** all nine prior test files pass unchanged
— this phase modified none of their production or test files.

**Per-file results, this run:**

| File | Checks |
|---|---|
| `test_contracts.py` (Phase 1) | 21/21 |
| `test_router.py` (Phase 1) | 6/6 |
| `test_tool_registry.py` (Phase 2) | 19/19 |
| `test_context_tools.py` (Phase 3) | 22/22 |
| `test_mutation_tools.py` (Phase 4) | 49/49 |
| `test_vision_tools.py` (Phase 5) | 22/22 |
| `test_bedrock_client.py` (Phase 6) | 4/4 |
| `test_tool_config.py` (Phase 6) | 8/8 |
| `test_planner.py` (Phase 6) | 35/35 |
| `test_voice.py` (Phase 7, new) | 27/27 |
| **Total** | **213/213** |

`test_voice.py` covers every category this phase's instructions specified:
voice-derived text reaching the same planner interface as typed text
(including a byte-identical-request comparison and a spy proving the real
planner function is called); empty/invalid transcription; transcription
errors; prompt-injection-style transcription; and that voice input cannot
bypass tool validation (both an invalid-argument case and a real
`ToolExecutionError` case, mirrored from `test_planner.py`'s typed-text
equivalents).

**What is real vs. mocked, precisely:** only the Bedrock client
(`FakeBedrockClient`, identical in style to Phase 6's) and, for the
audio-bytes path, a hand-written `FakeTranscriber` are ever test doubles.
Every tool call that "succeeds" in these tests runs the real
`ToolRegistry`, real Pydantic validation, and real tool handlers against
the real `demo-project.json` fixture. No AWS credentials were used or
required anywhere in this phase's tests.

## Verification Result
**PASSED.** 27/27 new checks, plus 21/21 + 6/6 + 19/19 + 22/22 + 49/49 +
22/22 + 4/4 + 8/8 + 35/35 from Phases 1–6 re-confirmed with zero changes to
any prior file (213/213 total across all ten test files).

## Deviations From Plan

None beyond the standing host-Python-instead-of-Docker note (unchanged
since Phase 1; no AWS credentials used, as required). No scope deviations:
no frontend changes, no `packages/shared`/`app/schema.py`/`app/pipeline`/
`remotion` changes, no `app/main.py` wiring, no planner/tool-registry
changes, no foundation model or STT provider chosen.

## Unresolved STT Provider Decision

**Which speech-to-text approach to use for live voice commands remains
undecided** — the same open question the original architecture plan named
in its §19 before any implementation phase began:
- **Browser `SpeechRecognition` (Web Speech API)** — zero backend
  round-trip cost, works today in Chrome, and maps directly onto this
  phase's `transcript=` path (no server-side transcriber needed at all).
  This was the architecture plan's original recommendation for exactly
  this reason.
- **AWS Transcribe streaming** — consistent with an AWS-only stack, but
  requires a new dependency (`amazon-transcribe`), genuine async
  bidirectional I/O work, and has not been evaluated by the team the way
  the batch API was.
- **A local model (e.g. `faster-whisper`)** — already known to the team
  (bake-off dev dependency) but explicitly excluded from the production
  image by root `CLAUDE.md`'s own dev-isolation rule; using it in
  production would need that rule to be revisited first.

This phase does not choose between them — it makes the choice **cheap and
isolated** to make later: whichever is picked, only `get_voice_transcriber()`
needs a new branch (or, if the browser path is chosen, no backend change is
needed at all beyond what this phase already built, since `transcript=` is
already a first-class path).

## Dependencies / Blockers

- **The STT provider decision itself** (above) — blocks real (non-test)
  use of the `audio_bytes` path; the `transcript` path is fully usable
  today by whatever eventually calls this function with pre-recognized
  text.
- **`VOICE_TRANSCRIBER` is not yet documented in root `.env.example`.**
  Deliberately not added by this phase — `.env.example` is a root-level
  shared file outside `services/api/app/agent/`'s ownership, and adding an
  env var that has no working value yet seemed more likely to confuse than
  help. Whoever makes the STT provider decision should add both the env
  var and its real value to `.env.example` at that time. Flagged
  explicitly here rather than silently edited or silently left
  undocumented.
- **No real frontend integration exists to call this function** — `apps/web`'s
  `MicButton`/`AgentCommandBar` remain UI-only (unchanged since the
  original architecture audit); wiring them up is explicitly out of scope
  for this phase and belongs to a later frontend-integration phase.
- **`app/main.py` still does not expose any agent route** — unchanged
  since Phase 1; still requires sign-off from whoever owns `services/api`
  root. This phase does not change that situation (voice input reaches the
  planner via a direct Python function call in tests, exactly as text
  commands do — see Phase 6's own note that `router.py` isn't wired to the
  planner yet either).
- **Every other Phase 1–6 dependency/blocker is unchanged** (model
  selection, `analyze_frame`'s P1 storage dependency, etc.) — see the
  respective phase audits.

## Next Steps

Per the phase order, **Phase 8 — Frontend Agent Log + patch integration**
is next, but per the standing workflow rule it will **not** be started
without explicit approval ("Proceed to Phase 8").
