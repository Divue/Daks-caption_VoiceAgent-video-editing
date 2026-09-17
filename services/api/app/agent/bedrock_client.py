"""Phase 6: the model/client configuration boundary for the agent's
Bedrock Converse integration.

Deliberately model-agnostic: no Bedrock model ID is chosen, assumed, or
hard-coded anywhere in this module or in planner.py, which is the only
other module that imports from here. The model ID comes from the
BEDROCK_MODEL_ID environment variable at call time -- the exact same
variable name already reserved in .env.example and already read (via
os.environ["BEDROCK_MODEL_ID"], no default) by
services/api/app/pipeline/stt.py and tag.py, so this introduces no second,
competing configuration mechanism. Deciding the actual model is an open
project decision, not something this module or Phase 6 resolves — see the
Phase 6 audit's "Unresolved Model-Selection Decision".
"""
from __future__ import annotations

import os
from typing import Any, Protocol


class BedrockConverseClient(Protocol):
    """The one method planner.py needs from a Bedrock client. Narrow on
    purpose: a test double only has to implement `converse`, not the full
    boto3 client surface, and production code only ever depends on this
    protocol, never on boto3 directly outside `get_bedrock_client`."""

    def converse(self, **kwargs: Any) -> dict: ...


class ModelConfigurationError(Exception):
    """Raised when the agent isn't configured to call Bedrock yet — e.g.
    BEDROCK_MODEL_ID isn't set. Never silently falls back to a guessed or
    hard-coded model id; the caller gets an explicit, actionable error
    instead of a bare KeyError or a wrong model being used."""


def get_model_id() -> str:
    """Read BEDROCK_MODEL_ID from the environment.

    No default, no fallback, no guess — per this phase's explicit
    instruction not to choose, assume, or invent a model ID. Raises
    ModelConfigurationError if unset, rather than letting a bare KeyError
    (or worse, a silently wrong default) propagate.
    """
    model_id = os.environ.get("BEDROCK_MODEL_ID")
    if not model_id:
        raise ModelConfigurationError(
            "BEDROCK_MODEL_ID is not set. The agent does not choose a foundation model on "
            "its own — set BEDROCK_MODEL_ID in the environment (see .env.example) once the "
            "team has decided which model to use."
        )
    return model_id


def get_bedrock_client() -> BedrockConverseClient:
    """Construct the real boto3 bedrock-runtime client.

    Region comes from AWS_REGION — the same env var and the same
    "ap-south-1" default already used by app/pipeline/stt.py and tag.py,
    kept consistent rather than introducing a different default here.
    """
    import boto3

    region = os.environ.get("AWS_REGION", "ap-south-1")
    return boto3.client("bedrock-runtime", region_name=region)
