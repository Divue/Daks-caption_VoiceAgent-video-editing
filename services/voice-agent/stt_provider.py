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


_PROVIDERS = ("aws", "sarvam")

# Sarvam's defaults for this worker. Saaras v3 is the STT model the batch pipeline already
# uses (services/api/app/pipeline/run.py); "codemix" keeps Hinglish as spoken (Hindi and
# English words in one utterance) instead of forcing one script or translating.
_SARVAM_DEFAULT_MODEL = "saaras:v3"
_SARVAM_DEFAULT_MODE = "codemix"


def get_stt_provider() -> str:
    """Read VOICE_STT_PROVIDER: "aws" (the default) or "sarvam".

    Why it exists: AWS Transcribe STREAMING needs the IAM action
    `transcribe:StartStreamTranscription`, which the shared dev identity is denied (worker
    log: 403 AccessDeniedException). Sarvam needs only SARVAM_API_KEY, which the batch
    pipeline already uses. The default stays "aws" so an unset variable behaves exactly as
    before; an unrecognised value raises instead of silently picking one.
    """
    provider = (os.environ.get("VOICE_STT_PROVIDER") or "aws").strip().lower()
    if provider not in _PROVIDERS:
        raise STTConfigurationError(
            f"VOICE_STT_PROVIDER must be one of {', '.join(_PROVIDERS)} (got {provider!r})."
        )
    return provider


def get_sarvam_api_key() -> str:
    key = (os.environ.get("SARVAM_API_KEY") or "").strip()
    if not key:
        raise STTConfigurationError(
            "VOICE_STT_PROVIDER=sarvam but SARVAM_API_KEY is not set."
        )
    return key


def get_stt_plugin():
    """Construct the streaming STT plugin selected by VOICE_STT_PROVIDER.

    Deliberately NOT called at import time (no top-level plugin construction anywhere in
    this module) so that importing this module never requires the LiveKit plugins to be
    installed or any credentials to be present — tests exercise the get_* helpers directly
    without ever calling this function (see tests/test_stt_provider.py).

    Raises STTConfigurationError if VOICE_STT_LANGUAGE isn't set, or the selected provider
    is missing its key — never silently defaults to en-US, matching this module's own
    "fail loud" convention.
    """
    provider = get_stt_provider()
    language = get_stt_language()

    if provider == "sarvam":
        from livekit.plugins import sarvam

        return sarvam.STT(
            language=language,
            model=os.environ.get("VOICE_STT_MODEL") or _SARVAM_DEFAULT_MODEL,
            mode=os.environ.get("VOICE_STT_MODE") or _SARVAM_DEFAULT_MODE,
            api_key=get_sarvam_api_key(),
        )

    from livekit.plugins import aws

    return aws.STT(
        language=language,
        region=get_stt_region(),
    )
