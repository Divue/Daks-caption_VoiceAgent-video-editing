"""Pipeline job state: one item per project (sk=JOB), polled by the editor every ~2 s.

Concurrency rules (deviation D2):
- Only the runner writes a job, and it writes the WHOLE item from one lock-guarded in-memory
  state. Transcribe and Sarvam report from two threads; a read-modify-write of a `stages` string
  per thread would lose one of their updates.
- Every run has a `runId`; every runner write is conditional on it. A run that was declared lost
  and replaced cannot overwrite its successor when it wakes up.
- A `running` job whose heartbeat is older than `stale_job_seconds` is reported `failed`
  ("worker lost") on read, and may be restarted. That is what a container restart looks like.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Optional

from ..config import get_settings
from . import dynamo
from .dynamo import N, S

SK = "JOB"
STAGES = ("audio", "transcribe", "sarvam", "align", "prosody", "tag", "build")


class AlreadyRunning(Exception):
    def __init__(self, job: dict):
        super().__init__("a pipeline job is already running")
        self.job = job


class Superseded(Exception):
    """This run is no longer the project's current run."""


def _key(project_id: str) -> dict:
    return {"pk": S(dynamo.project_pk(project_id)), "sk": S(SK)}


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def empty_stages() -> dict:
    return {name: {"state": "pending", "ms": None} for name in STAGES}


def _item(project_id: str, run_id: str, *, state: str, stages: dict, started: float,
          error: Optional[str], finished: Optional[float], detail: Optional[str]) -> dict:
    now = time.time()
    item = {
        **_key(project_id),
        "runId": S(run_id), "state": S(state), "stages": S(json.dumps(stages)),
        "startedEpoch": N(round(started, 3)), "heartbeatEpoch": N(round(now, 3)),
    }
    if error:
        item["error"] = S(error[:1000])
    if detail:
        item["detail"] = S(detail[:500])
    if finished:
        item["finishedEpoch"] = N(round(finished, 3))
    return item


def start(project_id: str, run_id: str) -> dict:
    """Claim the project for a new run. Raises AlreadyRunning if a live run holds it."""
    now = time.time()
    item = _item(project_id, run_id, state="running", stages=empty_stages(), started=now,
                 error=None, finished=None, detail=None)
    try:
        dynamo.client().put_item(
            TableName=dynamo.table(), Item=item,
            ConditionExpression="attribute_not_exists(pk) OR #s <> :running OR heartbeatEpoch < :cutoff",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":running": S("running"),
                                       ":cutoff": N(round(now - get_settings().stale_job_seconds, 3))},
        )
    except dynamo.client().exceptions.ConditionalCheckFailedException:
        raise AlreadyRunning(get(project_id) or {}) from None
    return get(project_id)


def write(project_id: str, run_id: str, *, state: str, stages: dict, started: float,
          error: Optional[str] = None, finished: Optional[float] = None,
          detail: Optional[str] = None) -> None:
    try:
        dynamo.client().put_item(
            TableName=dynamo.table(),
            Item=_item(project_id, run_id, state=state, stages=stages, started=started,
                       error=error, finished=finished, detail=detail),
            ConditionExpression="runId = :r",
            ExpressionAttributeValues={":r": S(run_id)},
        )
    except dynamo.client().exceptions.ConditionalCheckFailedException:
        raise Superseded(run_id) from None


def is_current(project_id: str, run_id: str) -> bool:
    raw = dynamo.client().get_item(TableName=dynamo.table(), Key=_key(project_id),
                                   ConsistentRead=True).get("Item")
    return bool(raw) and raw["runId"]["S"] == run_id


def get(project_id: str) -> Optional[dict]:
    """The status body, with stale-heartbeat detection applied."""
    raw = dynamo.client().get_item(TableName=dynamo.table(), Key=_key(project_id),
                                   ConsistentRead=True).get("Item")
    if not raw:
        return None
    item = dynamo.plain(raw)
    stages = json.loads(item["stages"])
    state, error = item["state"], item.get("error")
    now = time.time()
    silent_for = now - item["heartbeatEpoch"]
    if state == "running" and silent_for > get_settings().stale_job_seconds:
        state = "failed"
        error = f"worker lost: no heartbeat for {int(silent_for)}s (container restarted or crashed)"
        for stage in stages.values():
            if stage["state"] == "running":
                stage["state"] = "failed"
    end = item.get("finishedEpoch") or now
    return {
        "projectId": item["pk"].split("#PROJ#", 1)[1],
        "runId": item["runId"],
        "state": state,
        "stages": stages,
        "error": error,
        "detail": item.get("detail"),
        "startedAt": _iso(item["startedEpoch"]),
        "heartbeatAt": _iso(item["heartbeatEpoch"]),
        "finishedAt": _iso(item["finishedEpoch"]) if item.get("finishedEpoch") else None,
        "elapsedMs": int((end - item["startedEpoch"]) * 1000),
    }
