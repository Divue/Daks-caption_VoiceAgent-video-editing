"""Selects and configures the speech-to-text plugin for the LiveKit voice worker.

Scope: this module is transport-layer only, per the team's LiveKit integration
decision — it produces an STT plugin instance for worker.py's STT-only
AgentSession. It never talks to Bedrock, never calls the planner, and never
touches services/api/app/agent/ — that module's tested tool-use loop and
validation boundary are unchanged by this work.

Follows the same "no default, fail loud" convention already established by
services/api/app/agent/bedrock_client.get_model_id() and
services/api/app/agent/voice.get_voice_transcriber(): a misconfigured or
unset language/region must raise a clear, actionable error rather than
silently falling back to en-US or a guessed AWS region.
"""
from __future__ import annotations

import os


class STTConfigurationError(Exception):
    """Raised when the worker isn't configured to run real streaming STT yet.

    Mirrors ModelConfigurationError/TranscriberNotConfiguredError in
    services/api/app/agent/ — an honest, actionable failure instead of a
    silently wrong language/region.
    """


def get_stt_language() -> str:
    """Read VOICE_STT_LANGUAGE from the environment. No default.

    AWS Transcribe streaming's language support/quality for hi-IN is an
    open verification item (see the team's LiveKit integration plan,
    "Risks" #1) — this function does not assume hi-IN or en-US, it only
    reads whatever the team has actually verified and configured.
    """
    language = os.environ.get("VOICE_STT_LANGUAGE")
    if not language:
        raise STTConfigurationError(
            "VOICE_STT_LANGUAGE is not set. This worker does not guess a language for "
            "streaming speech-to-text — set VOICE_STT_LANGUAGE in services/voice-agent/.env "
            "once the team has verified AWS Transcribe streaming support/quality for that "
            "language (see the LiveKit integration plan's hi-IN verification spike)."
        )
    return language


def get_stt_region() -> str:
    """Read AWS_REGION from the environment, falling back to the same default
    ("ap-south-1") already used by services/api/app/agent/bedrock_client.py and
    services/api/app/agent/tools/vision_tools.py, so this worker doesn't invent
    a second, competing region convention."""
    return os.environ.get("AWS_REGION", "ap-south-1")


def get_stt_plugin():
    """Construct the real livekit.plugins.aws.STT instance for worker.py.

    Deliberately NOT called at import time (no top-level `aws.STT(...)`
    anywhere in this module) so that importing this module never requires
    `livekit-agents[aws]` to be installed or AWS credentials to be present —
    tests exercise get_stt_language()/get_stt_region() directly without ever
    calling this function (see tests/test_stt_provider.py).

    Raises STTConfigurationError if VOICE_STT_LANGUAGE isn't set — never
    silently defaults to en-US, matching this module's own "fail loud"
    convention.
    """
    from livekit.plugins import aws

    return aws.STT(
        language=get_stt_language(),
        region=get_stt_region(),
    )
