"""LiveKit join-token minting — the one new backend piece for LiveKit voice
transport (see the team's LiveKit integration plan / root ai-agent-report.md).

Scope: this module does exactly one thing — mint a short-lived, signed JWT so
the frontend can join a LiveKit room to publish microphone audio. It has no
knowledge of the agent's tools, planner, or Project schema, and it never
calls Bedrock. It is transport-layer plumbing, not agent logic: the
tool-use loop, validation boundary, and all 9 tools in this package are
completely unmodified by this file.

`LIVEKIT_API_SECRET` must never reach the browser — that is the entire
reason this mint step happens server-side rather than the frontend
constructing its own token.

Cross-boundary note: this file lives inside services/api/app/agent/ (P4's
folder, additive) and is registered on the SAME router object as the
existing /agent/command and /agent/voice-command routes. The one dependency
change this needs — adding `livekit-api` to services/api/requirements.txt —
touches a P1-owned, deploy-critical file; see that file's own comment.
"""
from __future__ import annotations

import os
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class LiveKitConfigurationError(Exception):
    """Raised when LIVEKIT_API_KEY/LIVEKIT_API_SECRET/LIVEKIT_URL aren't set.

    Mirrors bedrock_client.ModelConfigurationError / voice.TranscriberNotConfiguredError:
    no default, no guessed credential, an honest and actionable error instead.
    """


class LiveKitTokenRequest(BaseModel):
    room: str = Field(min_length=1)
    identity: str = Field(min_length=1)


class LiveKitTokenResponse(BaseModel):
    token: str
    url: str


# A join token only needs to last long enough for the user's voice-command
# session; short-lived on purpose since this endpoint has no auth today (see
# the team's LiveKit integration plan, "Risks" #5) and a long-lived token
# would extend that exposure window.
_TOKEN_TTL = timedelta(minutes=30)

livekit_router = APIRouter()


def mint_join_token(room: str, identity: str) -> LiveKitTokenResponse:
    """Build a signed LiveKit room-join JWT for `identity` to join `room`.

    Raises LiveKitConfigurationError if LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
    or LIVEKIT_URL isn't set — never falls back to a guessed/blank
    credential. `livekit.api` (the `livekit-api` package) is imported lazily
    inside this function, not at module import time, so importing this
    module (e.g. from router.py) never requires that package to be
    installed unless a token is actually being minted — the same pattern
    already used for boto3 in bedrock_client.get_bedrock_client() and for
    ffmpeg/boto3 in tools/vision_tools.py.
    """
    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    livekit_url = os.environ.get("LIVEKIT_URL")
    if not api_key or not api_secret or not livekit_url:
        raise LiveKitConfigurationError(
            "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set to mint a "
            "LiveKit join token. Create a LiveKit Cloud project and set these in the "
            "environment (see .env.example) — this endpoint never guesses or fabricates "
            "credentials."
        )

    from livekit.api import AccessToken, VideoGrants

    grants = VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True)
    jwt = (
        AccessToken(api_key=api_key, api_secret=api_secret)
        .with_identity(identity)
        .with_grants(grants)
        .with_ttl(_TOKEN_TTL)
        .to_jwt()
    )
    return LiveKitTokenResponse(token=jwt, url=livekit_url)


@livekit_router.post("/livekit-token", response_model=LiveKitTokenResponse)
def issue_livekit_token(request: LiveKitTokenRequest) -> LiveKitTokenResponse:
    """POST /agent/livekit-token — mint a room-join token for the frontend's
    LiveKit client (apps/web/src/hooks/useVoiceInput.ts).

    "LiveKit isn't configured" is a deployment fact, not a crash, so it
    answers 503 in main.py's flat `{"error": ...}` shape rather than an
    opaque 500. The editor treats that specific answer as "use the browser's
    own speech recognition instead" — a deliberate fallback path, so it must
    be distinguishable from a real failure.

    Deliberately NOT an AgentCommandResponse: this endpoint issues a
    transport credential, it does not run the agent, and dressing it in the
    agent's envelope would imply a turn happened.
    """
    try:
        return mint_join_token(request.room, request.identity)
    except LiveKitConfigurationError as exc:
        raise HTTPException(
            503,
            {
                "error": "livekit_not_configured",
                "detail": str(exc),
                "fallback": "browser_speech_recognition",
            },
        ) from exc
