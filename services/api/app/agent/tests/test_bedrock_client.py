#!/usr/bin/env python3
"""Phase 6 verification: the model/client configuration boundary.

Run:
    cd services/api && python -m app.agent.tests.test_bedrock_client

No AWS credentials, no network calls — get_model_id() only reads an
environment variable, and get_bedrock_client() is not called here (that
would require real credentials; it's exercised only by inspection in
test_planner.py via dependency injection, never for a real call in tests).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from app.agent.bedrock_client import ModelConfigurationError, get_model_id  # noqa: E402

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


def test_missing_model_id_raises_configuration_error() -> None:
    original = os.environ.pop("BEDROCK_MODEL_ID", None)
    try:
        check(
            "get_model_id() raises ModelConfigurationError when BEDROCK_MODEL_ID is unset",
            raises(ModelConfigurationError, get_model_id),
        )
    finally:
        if original is not None:
            os.environ["BEDROCK_MODEL_ID"] = original


def test_empty_model_id_also_raises() -> None:
    original = os.environ.get("BEDROCK_MODEL_ID")
    os.environ["BEDROCK_MODEL_ID"] = ""
    try:
        check(
            "get_model_id() raises ModelConfigurationError for an empty string, not just unset",
            raises(ModelConfigurationError, get_model_id),
        )
    finally:
        if original is None:
            os.environ.pop("BEDROCK_MODEL_ID", None)
        else:
            os.environ["BEDROCK_MODEL_ID"] = original


def test_configured_model_id_is_returned_verbatim_and_not_hard_coded() -> None:
    original = os.environ.get("BEDROCK_MODEL_ID")
    # Deliberately not a real/plausible Bedrock model id — proves get_model_id()
    # returns whatever the environment says, rather than validating or
    # substituting a hard-coded value of its own.
    os.environ["BEDROCK_MODEL_ID"] = "whatever-the-team-decides-later"
    try:
        check("get_model_id() returns exactly what's configured", get_model_id() == "whatever-the-team-decides-later")
    finally:
        if original is None:
            os.environ.pop("BEDROCK_MODEL_ID", None)
        else:
            os.environ["BEDROCK_MODEL_ID"] = original


def test_module_does_not_reference_a_specific_model_id() -> None:
    """A crude but effective guard: the source of bedrock_client.py itself
    must not contain a Bedrock-style model id literal — confirms no model
    was hard-coded/invented anywhere in this module, not just that the
    function's return value happens to come from the environment."""
    source = (Path(__file__).resolve().parents[1] / "bedrock_client.py").read_text(encoding="utf-8")
    suspicious_prefixes = ("anthropic.", "meta.llama", "mistral.", "amazon.titan", "cohere.", "us.anthropic", "us.meta")
    check(
        "bedrock_client.py's source contains no recognizable Bedrock model-id literal",
        not any(prefix in source for prefix in suspicious_prefixes),
    )


def main() -> int:
    test_missing_model_id_raises_configuration_error()
    test_empty_model_id_also_raises()
    test_configured_model_id_is_returned_verbatim_and_not_hard_coded()
    test_module_does_not_reference_a_specific_model_id()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
