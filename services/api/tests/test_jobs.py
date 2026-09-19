import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import jobctx
from app.jobs import runner
from app.schema import Project
from app.store import jobs, projects


def client():
    from app.main import app
    return TestClient(app)


def test_second_start_is_already_running(aws):
    jobs.start("p", "run1")
    with pytest.raises(jobs.AlreadyRunning):
        jobs.start("p", "run2")


def test_stale_heartbeat_reads_as_failed_and_can_restart(aws, monkeypatch):
    jobs.start("p", "run1")
    tracker = runner.JobTracker("p", "run1")
    tracker.on_stage("transcribe", "running")
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 121)   # container died 121 s ago
    status = jobs.get("p")
    assert status["state"] == "failed" and "worker lost" in status["error"]
    assert status["stages"]["transcribe"]["state"] == "failed"
    jobs.start("p", "run2")                                    # restart allowed


def test_superseded_run_cannot_overwrite_successor(aws):
    jobs.start("p", "run1")
    old = runner.JobTracker("p", "run1")
    dynamo_item = jobs.get("p")
    # run2 takes over (as after a stale detection)
    from app.store import dynamo
    dynamo.client().delete_item(TableName=dynamo.table(), Key=jobs._key("p"))
    jobs.start("p", "run2")
    old.finish("done")
    assert old.superseded and jobs.get("p")["runId"] == "run2" and jobs.get("p")["state"] == "running"
    assert dynamo_item["runId"] == "run1"


def test_concurrent_stage_reports_are_not_lost(aws):
    """Transcribe and Sarvam report from two threads; both updates must survive."""
    jobs.start("p", "r")
    tracker = runner.JobTracker("p", "r")
    with jobctx.use(jobctx.JobContext("p", tracker.on_stage)):
        with ThreadPoolExecutor(2) as pool:
            for stage in ("transcribe", "sarvam"):
                jobctx.submit(pool, lambda s=stage: (jobctx.report(s, "running"), jobctx.report(s, "done")))
    stages = jobs.get("p")["stages"]
    assert stages["transcribe"]["state"] == stages["sarvam"]["state"] == "done"


def _fake_pipeline(monkeypatch, fail_at=None):
    from app import media, s3
    monkeypatch.setattr(s3, "download", lambda key, path: open(path, "wb").write(b"x"))
    monkeypatch.setattr(s3, "upload", lambda *a: None)
    monkeypatch.setattr(media, "probe", lambda p: media.MediaInfo(15400, 1080, 1920, True))
    monkeypatch.setattr(media, "extract_wav", lambda s, d: open(d, "wb").write(b"x"))

    def fake_run(**kw):
        for stage in ("transcribe", "sarvam", "align", "prosody", "tag", "build"):
            jobctx.report(stage, "running")
            if stage == fail_at:
                raise RuntimeError(f"{stage} exploded")
            jobctx.report(stage, "done")
        return {"id": kw["project_id"], "videoUrl": kw["video_url"], "durationMs": kw["duration_ms"],
                "width": kw["width"], "height": kw["height"], "presetId": kw["preset_id"],
                "words": [{"id": "w1", "text": "bhai", "startMs": 0, "endMs": 300, "emphasis": False,
                           "emotion": "neutral", "stretch": 1.0}],
                "overlays": [], "settings": {"emojis": True, "emotionLayer": True}}
    monkeypatch.setattr(runner.pipeline, "run", fake_run)


def _upload(pid_body):
    import boto3
    boto3.client("s3", region_name="ap-south-1").put_object(
        Bucket="test-bucket", Key=pid_body["upload"]["fields"]["key"], Body=b"video")


def test_process_end_to_end_with_fake_pipeline(aws, monkeypatch):
    _fake_pipeline(monkeypatch)
    c = client()
    body = c.post("/projects", json={"filename": "a.mp4", "contentType": "video/mp4", "presetId": "minimal"}).json()
    pid = body["projectId"]
    assert c.post(f"/projects/{pid}/process").status_code == 400      # not uploaded yet
    _upload(body)
    r = c.post(f"/projects/{pid}/process")                              # TestClient runs the bg task inline
    assert r.status_code == 202
    status = c.get(f"/projects/{pid}/status").json()
    assert status["state"] == "done" and status["status"] == "ready"
    assert all(s["state"] == "done" for s in status["stages"].values())
    project = c.get(f"/projects/{pid}").json()
    assert project["presetId"] == "minimal" and project["durationMs"] == 15400   # preset carried through
    assert project["videoUrl"].startswith("https://")


def test_failure_marks_job_and_stage_failed(aws, monkeypatch):
    _fake_pipeline(monkeypatch, fail_at="tag")
    c = client()
    body = c.post("/projects", json={"filename": "a.mp4", "contentType": "video/mp4"}).json()
    _upload(body)
    c.post(f"/projects/{body['projectId']}/process")
    status = c.get(f"/projects/{body['projectId']}/status").json()
    assert status["state"] == "failed" and "tag exploded" in status["error"]
    assert status["stages"]["tag"]["state"] == "failed" and status["stages"]["prosody"]["state"] == "done"
    assert status["status"] == "failed"


def test_process_refuses_to_destroy_manual_edits(aws, monkeypatch):
    _fake_pipeline(monkeypatch)
    c = client()
    body = c.post("/projects", json={"filename": "a.mp4", "contentType": "video/mp4"}).json()
    pid = body["projectId"]
    _upload(body)
    c.post(f"/projects/{pid}/process")
    projects.patch_word(pid, "w1", {"text": "edited"}, None)
    assert c.post(f"/projects/{pid}/process").status_code == 409
    assert c.post(f"/projects/{pid}/process?force=true").status_code == 202
    record = projects.get(pid)
    assert record.project.words[0].text == "bhai" and not record.has_manual_edits


def test_long_clip_rejected_before_any_paid_call(aws, monkeypatch):
    _fake_pipeline(monkeypatch)
    from app import media
    monkeypatch.setattr(media, "probe", lambda p: media.MediaInfo(301_000, 1080, 1920, True))
    called = []
    monkeypatch.setattr(runner.pipeline, "run", lambda **kw: called.append(1))
    c = client()
    body = c.post("/projects", json={"filename": "a.mp4", "contentType": "video/mp4"}).json()
    _upload(body)
    c.post(f"/projects/{body['projectId']}/process")
    status = c.get(f"/projects/{body['projectId']}/status").json()
    assert status["state"] == "failed" and "limit is 90s" in status["error"] and not called
