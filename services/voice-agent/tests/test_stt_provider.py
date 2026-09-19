#!/usr/bin/env python3
"""Verification: the STT configuration boundary (stt_provider.py).

Run:
    cd services/voice-agent && python -m tests.test_stt_provider

No LiveKit credentials, no AWS credentials, no network calls, and no
dependency on `livekit-agents` being installed — get_stt_plugin() imports
`livekit.plugins.aws` lazily inside the function body specifically so these
tests can exercise get_stt_language()/get_stt_region() without that package
present. Matches the plain-assertion, no-pytest style already used by
services/api/app/agent/tests/*.py.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # services/voice-agent, for `stt_provider`

from stt_provider import (  # noqa: E402
    STTConfigurationError,
    get_sarvam_api_key,
    get_stt_language,
    get_stt_provider,
    get_stt_region,
)

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def raises(exc_type: type[Exception], fn) -> bool:
    try:
        fn()
    except exc_type:
        return True
    except Exception:
        return False
    return False


def test_get_stt_language_requires_explicit_config() -> None:
    original = os.environ.pop("VOICE_STT_LANGUAGE", None)
    try:
        check(
            "get_stt_language() raises STTConfigurationError when unset (no default language)",
            raises(STTConfigurationError, get_stt_language),
        )
        os.environ["VOICE_STT_LANGUAGE"] = ""
        check(
            "get_stt_language() raises STTConfigurationError for an empty string, not just unset",
            raises(STTConfigurationError, get_stt_language),
        )
        os.environ["VOICE_STT_LANGUAGE"] = "hi-IN"
        check("get_stt_language() returns exactly what's configured", get_stt_language() == "hi-IN")
    finally:
        if original is None:
            os.environ.pop("VOICE_STT_LANGUAGE", None)
        else:
            os.environ["VOICE_STT_LANGUAGE"] = original


def test_get_stt_region_defaults_like_the_rest_of_the_agent() -> None:
    original = os.environ.pop("AWS_REGION", None)
    try:
        check(
            "get_stt_region() defaults to ap-south-1, matching bedrock_client.py/vision_tools.py",
            get_stt_region() == "ap-south-1",
        )
        os.environ["AWS_REGION"] = "us-east-1"
        check("get_stt_region() returns exactly what's configured when set", get_stt_region() == "us-east-1")
    finally:
        if original is None:
            os.environ.pop("AWS_REGION", None)
        else:
            os.environ["AWS_REGION"] = original


def _with_env(name: str, value: str | None, fn) -> None:
    """Run fn() with `name` set (or unset when value is None), restoring it afterwards."""
    original = os.environ.get(name)
    try:
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value
        fn()
    finally:
        if original is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = original


def test_get_stt_provider_defaults_to_aws_and_rejects_unknown_values() -> None:
    _with_env(
        "VOICE_STT_PROVIDER",
        None,
        lambda: check("unset provider defaults to aws, so behaviour is unchanged", get_stt_provider() == "aws"),
    )
    _with_env(
        "VOICE_STT_PROVIDER",
        "",
        lambda: check("an empty provider also defaults to aws", get_stt_provider() == "aws"),
    )
    _with_env(
        "VOICE_STT_PROVIDER",
        " Sarvam ",
        lambda: check("provider is trimmed and case-insensitive", get_stt_provider() == "sarvam"),
    )
    _with_env(
        "VOICE_STT_PROVIDER",
        "whisper",
        lambda: check(
            "an unknown provider raises instead of silently picking one",
            raises(STTConfigurationError, get_stt_provider),
        ),
    )


def test_sarvam_requires_its_own_key() -> None:
    _with_env(
        "SARVAM_API_KEY",
        None,
        lambda: check(
            "sarvam without SARVAM_API_KEY raises a configuration error",
            raises(STTConfigurationError, get_sarvam_api_key),
        ),
    )
    _with_env(
        "SARVAM_API_KEY",
        "   ",
        lambda: check(
            "a blank SARVAM_API_KEY counts as missing",
            raises(STTConfigurationError, get_sarvam_api_key),
        ),
    )
    _with_env(
        "SARVAM_API_KEY",
        "test-key",
        lambda: check("a set SARVAM_API_KEY is returned as-is", get_sarvam_api_key() == "test-key"),
    )


def main() -> int:
    test_get_stt_language_requires_explicit_config()
    test_get_stt_region_defaults_like_the_rest_of_the_agent()
    test_get_stt_provider_defaults_to_aws_and_rejects_unknown_values()
    test_sarvam_requires_its_own_key()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
