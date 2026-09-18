from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import pytest

from app import costs, jobctx, pricing


def test_pricing_bedrock_tokens():
    usd, verified = pricing.usd("bedrock", "global.anthropic.claude-sonnet-4-6", input_tokens=3928, output_tokens=725)
    assert usd == pytest.approx(0.022659) and verified   # audit 11's Angry harness call -> $0.0227


def test_pricing_transcribe_minimum_and_unknown_model():
    assert pricing.usd("transcribe", "batch-hi-IN", audio_seconds=10)[0] == pytest.approx(15 / 60 * 0.024)
    assert pricing.usd("transcribe", "batch-hi-IN", audio_seconds=30)[0] == pytest.approx(0.012)
    assert pricing.usd("bedrock", "some-new-model", input_tokens=10**6) == (0.0, False)


def test_event_written_with_context_project(aws):
    with jobctx.use(jobctx.JobContext("p9")):
        with costs.cost_event(stage="tag", service="bedrock", model_id="global.anthropic.claude-sonnet-4-6") as ev:
            ev.usage_from({"usage": {"inputTokens": 1000, "outputTokens": 100}})
    (event,) = costs.project_events("p9")
    assert event["usd"] == pytest.approx(0.0045) and event["ok"] and event["stage"] == "tag"


def test_failed_call_still_logged_and_reraised(aws):
    with pytest.raises(TimeoutError):
        with costs.cost_event(stage="tag", service="bedrock", model_id="x", project_id="p9") as ev:
            ev.tokens(500, 0)
            raise TimeoutError("bedrock slow")
    (event,) = costs.project_events("p9")
    assert event["ok"] is False and "TimeoutError" in event["error"]


def test_no_project_means_stdout_only(aws, capsys):
    with costs.cost_event(stage="tag", service="bedrock", model_id="x"):
        pass
    assert "cost_event" in capsys.readouterr().out


def test_logging_failure_never_breaks_the_call(aws, monkeypatch):
    monkeypatch.setattr(costs, "_record", lambda *a, **k: 1 / 0)
    with costs.cost_event(stage="tag", service="bedrock", model_id="x", project_id="p9"):
        result = "call succeeded"
    assert result == "call succeeded"


def test_context_reaches_thread_pool_only_via_jobctx_submit(aws):
    """The plan's weak point: contextvars do not cross into ThreadPoolExecutor by themselves."""
    def call(stage):
        with costs.cost_event(stage=stage, service="sarvam", model_id="saaras:v3") as ev:
            ev.audio(15.4)
    with jobctx.use(jobctx.JobContext("p9")):
        with ThreadPoolExecutor(2) as pool:
            jobctx.submit(pool, call, "via-submit").result()
            pool.submit(call, "plain-submit").result()
    assert [e["stage"] for e in costs.project_events("p9")] == ["via-submit"]


def test_rollups(aws):
    for pid, n in (("a", 1000), ("b", 3000)):
        with costs.cost_event(stage="tag", service="bedrock", model_id="global.anthropic.claude-sonnet-4-6", project_id=pid) as ev:
            ev.tokens(n, 0)
    with costs.cost_event(stage="sarvam", service="sarvam", model_id="saaras:v3", project_id="a") as ev:
        ev.audio(15)
    summary = costs.project_summary("a", 15000)
    assert summary["totalUsd"] == pytest.approx(0.003) and summary["unverifiedRates"] == ["sarvam"]
    assert summary["usdPerMinute"] == pytest.approx(0.012) and len(summary["events"]) == 2
    today = datetime.now(timezone.utc).date()
    agg = costs.range_summary(today, today)
    assert agg["projectCount"] == 2 and agg["totalUsd"] == pytest.approx(0.012)
    assert agg["meanUsdPerProject"] == pytest.approx(0.006)
    with pytest.raises(ValueError):
        costs.range_summary(date(2026, 1, 1), date(2026, 12, 1))
