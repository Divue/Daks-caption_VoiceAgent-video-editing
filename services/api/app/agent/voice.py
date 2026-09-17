"""Phase 7: voice input integration.

Hard architectural rule (per this phase's instructions): voice and typed
commands use the SAME planner. This module does not implement a second
agent, a second tool-use loop, or any parallel validation path — it only
ever turns voice input into a plain text command and then calls
`planner.run_agent_command` (Phase 6, completely unmodified) exactly as a
typed command would. Every guarantee Phase 6 already has (tool/argument
validation, the iteration bound, prompt-injection isolation, no fabricated
tool success, no chain-of-thought exposure) applies to voice-derived
commands automatically, because it is the literal same code path — not a
property re-implemented or re-tested at a different layer.

Two ways "voice input" can arrive at this boundary, both handled here:

  1. `transcript` — text a caller already has (e.g. a browser's own speech
     recognition already turned speech into text before this backend was
     ever involved). No STT provider is needed or called for this path.
  2. `audio_bytes` — raw audio that still needs to be turned into text by a
     real STT provider on the backend, via `VoiceTranscriber`.

STT provider decision: NOT made by this phase, on purpose (see the Phase 7
audit's "Unresolved STT Provider Decision"). `get_voice_transcriber()`
mirrors `bedrock_client.get_model_id()`'s pattern exactly — it reads a
configuration value and raises a clear, specific error rather than
guessing, fabricating, or silently defaulting to some provider. Nothing in
this repository today implements real backend audio transcription for live
voice commands (the AWS Transcribe integration in
`app/pipeline/stt.py` is a batch job against pre-uploaded video, seconds-
to-minutes latency — unsuitable for a live command and a different problem
than this module solves).
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Protocol

from app.schema import Project

from .bedrock_client import BedrockConverseClient
from .contracts import AgentCommandRequest, AgentCommandResponse, AgentLogEntry, SelectionContext
from .planner import run_agent_command


class TranscriptionError(Exception):
    """Base class for anything that stops voice input from becoming a
    usable text command. Callers must treat this exactly like
    `ModelConfigurationError` in the text-command path: an honest failure,
    never a fabricated or empty-but-successful transcription."""


class TranscriberNotConfiguredError(TranscriptionError):
    """No real STT provider is configured/decided for live voice commands.
    Raised rather than silently returning empty text or guessing a
    provider — see the module docstring and the Phase 7 audit."""


class EmptyTranscriptionError(TranscriptionError):
    """The transcriber ran without error but produced blank text. Treated
    as a failure, not a valid (if unusual) command — an empty `command`
    would fail Phase 1's `AgentCommandRequest` validation anyway
    (`Field(min_length=1)`), but this gives a clearer, voice-specific error
    before ever reaching that generic construction-time check."""


class VoiceTranscriber(Protocol):
    """The one method a real STT provider needs to implement. Narrow on
    purpose — a provider only needs to turn bytes into text; it has no
    other say in how the resulting command is handled."""

    def transcribe(self, audio_bytes: bytes) -> str: ...


def get_voice_transcriber() -> VoiceTranscriber:
    """Select a `VoiceTranscriber` from the `VOICE_TRANSCRIBER` environment
    variable. No default provider — an unset or unrecognized value raises
    `TranscriberNotConfiguredError`, mirroring
    `bedrock_client.get_model_id()`'s "no guess" behavior exactly.

    There is currently no recognized value that succeeds: no STT provider
    for live voice commands has been decided yet (see the module
    docstring). This function exists so that decision can be wired in
    later by adding one branch here, without changing anything about how
    voice commands reach the planner.
    """
    name = (os.environ.get("VOICE_TRANSCRIBER") or "").strip().lower()
    if not name:
        raise TranscriberNotConfiguredError(
            "VOICE_TRANSCRIBER is not set. No speech-to-text provider has been decided for "
            "live voice commands yet — set VOICE_TRANSCRIBER once the team chooses one, or "
            "pass an already-transcribed `transcript` instead of `audio_bytes` if speech "
            "recognition happens elsewhere (e.g. in the browser)."
        )
    raise TranscriberNotConfiguredError(
        f"VOICE_TRANSCRIBER={name!r} is not a recognized speech-to-text provider. "
        "No provider is implemented yet — this is not a bug, see the Phase 7 audit."
    )


def _new_log_entry(message: str) -> AgentLogEntry:
    return AgentLogEntry(id=uuid.uuid4().hex, message=message, timestamp=int(time.time() * 1000))


def run_agent_voice_command(
    *,
    project: Project,
    audio_bytes: bytes | None = None,
    transcript: str | None = None,
    selection: SelectionContext | None = None,
    transcriber: VoiceTranscriber | None = None,
    client: BedrockConverseClient | None = None,
) -> AgentCommandResponse:
    """Turn voice input into a validated `AgentCommandResponse` via the
    SAME planner used for typed commands.

    Exactly one of `audio_bytes` or `transcript` must be given:
    - `transcript`: already-recognized text (e.g. from browser speech
      recognition) — no transcriber is called.
    - `audio_bytes`: raw audio; transcribed via `transcriber` (defaults to
      `get_voice_transcriber()`, which raises `TranscriberNotConfiguredError`
      today — see the module docstring).

    Transcription errors (including "no provider configured" and "blank
    transcription") short-circuit before the planner is ever called —
    exactly like `run_agent_command`'s own handling of an unconfigured
    Bedrock model — and are reported as an honest `status="error"`
    response, never a fabricated or best-guess command.

    The resulting text is validated and executed with EXACTLY the same
    rigor as a typed command: it is passed, completely unmodified, into a
    real `AgentCommandRequest` and handed to the real
    `planner.run_agent_command` — there is no separate voice-specific
    validation, wrapping, or tool-execution path here.
    """
    if (audio_bytes is None) == (transcript is None):
        raise ValueError("run_agent_voice_command requires exactly one of audio_bytes or transcript")

    log: list[AgentLogEntry] = []

    if transcript is not None:
        text = transcript
        log.append(_new_log_entry("Voice command received (already transcribed)."))
    else:
        log.append(_new_log_entry("Voice command received — transcribing audio."))
        try:
            active_transcriber = transcriber if transcriber is not None else get_voice_transcriber()
            text = active_transcriber.transcribe(audio_bytes)  # type: ignore[arg-type]
        except TranscriptionError as exc:
            log.append(_new_log_entry(f"Could not transcribe voice input: {exc}"))
            return AgentCommandResponse(status="error", patches=[], log=log)

    if not text or not text.strip():
        error = EmptyTranscriptionError("transcription produced no usable text")
        log.append(_new_log_entry(f"Could not transcribe voice input: {error}"))
        return AgentCommandResponse(status="error", patches=[], log=log)

    # From here on, `text` is treated exactly like a typed command: the same
    # untrusted-data wrapping, the same tool-use loop, the same validation
    # boundary — all inside run_agent_command, none of it duplicated here.
    request = AgentCommandRequest(command=text, project=project, selection=selection)
    response = run_agent_command(request, client=client)

    # Prepend this module's own voice-specific log entries (e.g.
    # "transcribing audio") ahead of the planner's own log, so the full
    # story reads in order without the planner needing to know its caller
    # was voice rather than text.
    return response.model_copy(update={"log": [*log, *response.log]})
