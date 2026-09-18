"""DynamoDB access: one low-level client, shared by every thread, plus attribute helpers.

Low-level *clients* are thread-safe; boto3 *resources* are not (plan §13.4). The pipeline writes
cost rows from inside run.py's ThreadPoolExecutor, so everything here goes through the client.
We only store strings, bools and ints (the Project itself is a JSON string), so there is no
float/Decimal conversion anywhere.

One table (approved deviation D5 from the plan's two). Items:
  pk={prefix}#PROJ#{id}  sk=PROJECT         the project (doc = Project JSON string)
  pk={prefix}#PROJ#{id}  sk=JOB             pipeline job state
  pk={prefix}#PROJ#{id}  sk=COST#{ts}#{rnd} one external model call; has `day`, so it is the
                                            only item type in the sparse byDay GSI
"""
from __future__ import annotations

import threading
from typing import Any

import boto3

from ..config import get_settings

GSI_BY_DAY = "byDay"

TABLE_SPEC: dict[str, Any] = {
    "AttributeDefinitions": [
        {"AttributeName": "pk", "AttributeType": "S"},
        {"AttributeName": "sk", "AttributeType": "S"},
        {"AttributeName": "day", "AttributeType": "S"},
    ],
    "KeySchema": [
        {"AttributeName": "pk", "KeyType": "HASH"},
        {"AttributeName": "sk", "KeyType": "RANGE"},
    ],
    "GlobalSecondaryIndexes": [{
        "IndexName": GSI_BY_DAY,
        "KeySchema": [
            {"AttributeName": "day", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    }],
    "BillingMode": "PAY_PER_REQUEST",
}

_lock = threading.Lock()
_client = None


def client():
    """The shared DynamoDB client. Created once; boto3's default-session creation is not thread-safe."""
    global _client
    with _lock:
        if _client is None:
            _client = boto3.session.Session().client("dynamodb", region_name=get_settings().aws_region)
        return _client


def reset_client() -> None:
    """Tests only: drop the cached client so a new moto mock is picked up."""
    global _client
    with _lock:
        _client = None


def table() -> str:
    return get_settings().dynamo_table


def project_pk(project_id: str) -> str:
    return f"{get_settings().dev_prefix}#PROJ#{project_id}"


# --- attribute value helpers (low-level client wire format) --------------------------------

def S(value: str) -> dict:
    return {"S": value}


def N(value: int | float) -> dict:
    return {"N": repr(value) if isinstance(value, float) else str(value)}


def B(value: bool) -> dict:
    return {"BOOL": bool(value)}


def plain(item: dict) -> dict:
    """Wire-format item -> plain dict. Numbers come back as int when integral, else float."""
    out = {}
    for key, value in item.items():
        (kind, raw), = value.items()
        if kind == "N":
            out[key] = int(raw) if raw.lstrip("-").isdigit() else float(raw)
        elif kind == "NULL":
            out[key] = None
        else:
            out[key] = raw
    return out


def is_conditional_failure(exc: Exception) -> bool:
    return getattr(exc, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException"
