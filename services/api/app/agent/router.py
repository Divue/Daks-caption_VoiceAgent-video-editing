"""Phase 8 Step 1: wires the real Phase 6 planner and Phase 7 voice
functions into HTTP routes — replacing the Phase 1 "not_implemented" stub.

NOT wired into app/main.py. That one-line `app.include_router(...)` touches
a file outside services/api/app/agent/ (P1-owned) — see the Phase 8 audit
for why this is flagged rather than done silently. This module is only
reachable directly (imported) or via its own throwaway TestClient app in
tests, exactly as it was in Phases 1–7.

Both routes return `AgentCommandResponse` with `response_model_exclude_none=True`:
Pydantic serializes every untouched optional field (e.g. most of a
`WordPatch`/`StylePatch`) as JSON `null` by default, and the frontend
reducer's `UPDATE_WORD` case does a plain `{ ...word, ...action.patch }`
spread — an explicit `null` there would overwrite a real field instead of
leaving it alone. `response_model_exclude_none=True` strips every `None`
recursively before the response is ever serialized, so only the fields a
tool actually set appear at all.
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Depends

from .bedrock_client import BedrockConverseClient
from .contracts import (
    AgentCommandRequest,
    AgentCommandResponse,
    AgentLogEntry,
    AgentVoiceCommandRequest,
)
from .livekit_token import livekit_router
from .planner import run_agent_command
from .voice import run_agent_voice_command

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])

# LiveKit voice-transport plumbing (see livekit_token.py's module docstring):
# mounted on the same router/prefix as /command and /voice-command so it's
# reachable at POST /agent/livekit-token once this router itself is mounted
# on the real app (still app/main.py's job, unchanged by this addition).
router.include_router(livekit_router)


def _default_bedrock_client() -> BedrockConverseClient | None:
    """FastAPI dependency seam for the Bedrock client.

    Returning `None` here means "use the real client" — `run_agent_command`/
    `run_agent_voice_command` already fall back to `get_bedrock_client()`
    when `client` is `None`, exactly as they do when called directly in
    Phase 6/7's own tests. Tests for THIS router override this dependency
    (`app.dependency_overrides[_default_bedrock_client] = lambda: fake`) to
    inject a fake client over HTTP — the same external-I/O-boundary
    dependency injection already established, wired through FastAPI's own
    mechanism instead of a bare function parameter, since an HTTP request
    has no way to pass a Python object directly.
    """
    return None


def _error_log(message: str) -> AgentLogEntry:
    return AgentLogEntry(id=uuid.uuid4().hex, message=message, timestamp=int(time.time() * 1000))


def _describe_failure(exc: Exception) -> str:
    """What the user is told when the planner itself blew up.

    A rate limit is the one failure that is both common and fixable by the user — Bedrock throttles
    bursts of calls, and a demo is exactly a burst of calls. Measured: the 15th command in about a
    minute came back `ThrottlingException` after botocore's 4 retries. "Failed unexpectedly" told the
    user nothing and invited them to keep hammering it; this says to wait. Anything else stays
    generic: its details are in the server log and are no use to a creator.
    """
    code = getattr(exc, "response", {}).get("Error", {}).get("Code", "") if hasattr(exc, "response") else ""
    if code in {"ThrottlingException", "TooManyRequestsException", "ServiceQuotaExceededException"}:
        return "The AI service is busy right now (rate limited). Wait a few seconds and say it again — nothing was changed."
    return "The agent failed unexpectedly. Nothing was changed."


@router.post("/command", response_model=AgentCommandResponse, response_model_exclude_none=True)
def run_command(
    request: AgentCommandRequest,
    client: BedrockConverseClient | None = Depends(_default_bedrock_client),
) -> AgentCommandResponse:
    """Run a typed natural-language command through the real Phase 6
    planner. Every internal failure mode (misconfigured model, invalid
    tool call, tool execution error, the iteration cap, failed final
    validation) is already turned into a well-formed `AgentCommandResponse`
    by `run_agent_command` itself — this handler adds only a last-resort
    safety net for a truly unexpected exception (e.g. a Bedrock API/network
    failure that isn't one of Phase 6's already-handled cases), so a bug
    here degrades to an honest `status="error"` response instead of a raw
    HTTP 500."""
    try:
        return run_agent_command(request, client=client)
    except Exception as exc:
        logger.exception("unexpected error running agent command")
        return AgentCommandResponse(status="error", patches=[], log=[_error_log(_describe_failure(exc))])


@router.post("/voice-command", response_model=AgentCommandResponse, response_model_exclude_none=True)
def run_voice_command(
    request: AgentVoiceCommandRequest,
    client: BedrockConverseClient | None = Depends(_default_bedrock_client),
) -> AgentCommandResponse:
    """Run an already-transcribed voice command through the SAME planner,
    via Phase 7's `run_agent_voice_command` — no second implementation, no
    parallel validation. Uses the `transcript=` path only (see
    `AgentVoiceCommandRequest`'s docstring for why raw audio isn't accepted
    here yet)."""
    try:
        return run_agent_voice_command(
            project=request.project,
            transcript=request.transcript,
            selection=request.selection,
            history=request.history,
            client=client,
        )
    except Exception as exc:
        logger.exception("unexpected error running agent voice command")
        return AgentCommandResponse(status="error", patches=[], log=[_error_log(_describe_failure(exc))])
