"""Cost logging: one row per external model call, written even when the call fails.

    with cost_event(stage="tag", service="bedrock", model_id=MODEL) as ev:
        resp = client.converse(...)
        ev.tokens(resp["usage"]["inputTokens"], resp["usage"]["outputTokens"])

The project comes from the ambient job context (app/jobctx.py) unless passed explicitly, so the
pipeline modules need no new parameters. Rows go to stdout as one JSON line (CloudWatch on App
Runner) and to Dynamo when a project is known. Logging never breaks the call it wraps.
This is visibility, not throttling: nothing here gates or downgrades a model.
"""
from __future__ import annotations

import json
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Iterator, Optional

from . import jobctx, pricing
from .store import dynamo
from .store.dynamo import B, N, S

MAX_DAYS = 31


@dataclass
class CostEvent:
    stage: str
    service: str
    model_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    audio_seconds: float = 0.0
    extra: dict = field(default_factory=dict)

    def tokens(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += int(input_tokens or 0)
        self.output_tokens += int(output_tokens or 0)

    def audio(self, seconds: float) -> None:
        self.audio_seconds = float(seconds or 0.0)

    def usage_from(self, response: dict) -> None:
        """Bedrock Converse response -> tokens."""
        usage = (response or {}).get("usage") or {}
        self.tokens(usage.get("inputTokens", 0), usage.get("outputTokens", 0))


@contextmanager
def cost_event(*, stage: str, service: str, model_id: str,
               project_id: Optional[str] = None) -> Iterator[CostEvent]:
    ev = CostEvent(stage=stage, service=service, model_id=model_id)
    pid = project_id or jobctx.project_id()
    started = time.perf_counter()
    ok, error = True, None
    try:
        yield ev
    except BaseException as exc:
        ok, error = False, f"{type(exc).__name__}: {exc}"[:500]
        raise
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            _record(pid, ev, ok=ok, error=error, latency_ms=latency_ms)
        except Exception as exc:  # noqa: BLE001 — cost logging must never break a pipeline run
            print(f"costs: failed to record event: {exc!r}")


def _record(project_id: Optional[str], ev: CostEvent, *, ok: bool, error: Optional[str],
            latency_ms: int) -> dict:
    usd, verified = pricing.usd(ev.service, ev.model_id, input_tokens=ev.input_tokens,
                                output_tokens=ev.output_tokens, audio_seconds=ev.audio_seconds)
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    row = {
        "ts": ts, "projectId": project_id, "stage": ev.stage, "service": ev.service,
        "modelId": ev.model_id, "inputTokens": ev.input_tokens, "outputTokens": ev.output_tokens,
        "audioSeconds": round(ev.audio_seconds, 3), "usd": usd, "usdVerified": verified,
        "rateVersion": pricing.RATE_VERSION, "latencyMs": latency_ms, "ok": ok, "error": error,
    }
    print("cost_event " + json.dumps(row), flush=True)
    if project_id:
        from .config import get_settings
        item = {
            "pk": S(dynamo.project_pk(project_id)), "sk": S(f"COST#{ts}#{uuid.uuid4().hex[:8]}"),
            "day": S(f"{get_settings().dev_prefix}#{now.date().isoformat()}"),
            "ts": S(ts), "stage": S(ev.stage), "service": S(ev.service), "modelId": S(ev.model_id),
            "inputTokens": N(ev.input_tokens), "outputTokens": N(ev.output_tokens),
            "audioSeconds": N(round(ev.audio_seconds, 3)), "usd": N(usd), "usdVerified": B(verified),
            "rateVersion": S(pricing.RATE_VERSION), "latencyMs": N(latency_ms), "ok": B(ok),
        }
        if error:
            item["error"] = S(error)
        dynamo.client().put_item(TableName=dynamo.table(), Item=item)
    return row


# --- queries ------------------------------------------------------------------------------

def _query_all(**kwargs) -> list[dict]:
    items, start = [], None
    while True:
        if start:
            kwargs["ExclusiveStartKey"] = start
        page = dynamo.client().query(TableName=dynamo.table(), **kwargs)
        items += [dynamo.plain(i) for i in page.get("Items", [])]
        start = page.get("LastEvaluatedKey")
        if not start:
            return items


def project_events(project_id: str) -> list[dict]:
    return _query_all(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :c)",
        ExpressionAttributeValues={":pk": S(dynamo.project_pk(project_id)), ":c": S("COST#")},
    )


def events_between(start: date, end: date) -> list[dict]:
    """One Query per day on the sparse byDay GSI (plan §13.7: fine for days, not for years)."""
    if end < start:
        raise ValueError("to is before from")
    if (end - start).days >= MAX_DAYS:
        raise ValueError(f"at most {MAX_DAYS} days per request")
    from .config import get_settings
    prefix = get_settings().dev_prefix
    out, day = [], start
    while day <= end:
        out += _query_all(IndexName=dynamo.GSI_BY_DAY, KeyConditionExpression="#d = :d",
                          ExpressionAttributeNames={"#d": "day"},
                          ExpressionAttributeValues={":d": S(f"{prefix}#{day.isoformat()}")})
        day += timedelta(days=1)
    return out


def _project_of(event: dict) -> str:
    return event["pk"].split("#PROJ#", 1)[1]


def rollup(events: list[dict]) -> dict:
    by_service: dict[str, float] = {}
    by_stage: dict[str, float] = {}
    unverified: set[str] = set()
    for e in events:
        by_service[e["service"]] = by_service.get(e["service"], 0.0) + e["usd"]
        by_stage[e["stage"]] = by_stage.get(e["stage"], 0.0) + e["usd"]
        if not e.get("usdVerified"):
            unverified.add(e["service"])
    total = sum(by_service.values())
    return {
        "totalUsd": round(total, 6),
        "byService": {k: round(v, 6) for k, v in sorted(by_service.items())},
        "byStage": {k: round(v, 6) for k, v in sorted(by_stage.items())},
        "unverifiedRates": sorted(unverified),
        "eventCount": len(events),
        "failedCalls": sum(1 for e in events if not e.get("ok", True)),
    }


def public_event(e: dict) -> dict:
    keys = ("ts", "service", "modelId", "stage", "inputTokens", "outputTokens", "audioSeconds",
            "usd", "usdVerified", "latencyMs", "ok", "error", "rateVersion")
    return {k: e[k] for k in keys if k in e}


def project_summary(project_id: str, duration_ms: Optional[int]) -> dict:
    events = sorted(project_events(project_id), key=lambda e: e["ts"])
    out = {"projectId": project_id, **rollup(events), "durationMs": duration_ms}
    out["usdPerMinute"] = round(out["totalUsd"] / (duration_ms / 60000), 6) if duration_ms else None
    out["events"] = [public_event(e) for e in events]
    return out


def range_summary(start: date, end: date) -> dict:
    events = events_between(start, end)
    per_project: dict[str, float] = {}
    for e in events:
        per_project[_project_of(e)] = per_project.get(_project_of(e), 0.0) + e["usd"]
    out = {"from": start.isoformat(), "to": end.isoformat(), **rollup(events),
           "projectCount": len(per_project)}
    out["meanUsdPerProject"] = round(out["totalUsd"] / len(per_project), 6) if per_project else None
    out["byProject"] = {k: round(v, 6) for k, v in sorted(per_project.items(), key=lambda kv: -kv[1])}
    return out
