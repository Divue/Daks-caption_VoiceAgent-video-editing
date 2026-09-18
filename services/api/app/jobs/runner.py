"""Run the pipeline for one project, as a FastAPI background task.

`run_job` is a plain `def` on purpose: Starlette runs sync background tasks in its threadpool.
An `async def` here would run the 20-40 s pipeline on the event loop and freeze the whole API.

Stage progress and cost rows reach Dynamo through the job context (app/jobctx.py); the pipeline
modules don't know a job exists.
"""
from __future__ import annotations

import os
import tempfile
import threading
import time
import traceback
from typing import Optional

from .. import jobctx, media, s3
from ..config import get_settings
from ..pipeline import run as pipeline
from ..schema import Project
from ..store import jobs, projects

HEARTBEAT_EVERY_S = 10


class ClipRejected(Exception):
    pass


class JobTracker:
    """In-memory job state, guarded by one lock, written to Dynamo as a whole item."""

    def __init__(self, project_id: str, run_id: str, started: Optional[float] = None):
        self.project_id, self.run_id = project_id, run_id
        self.started = started or time.time()
        self.stages = jobs.empty_stages()
        self._t0: dict[str, float] = {}
        self._lock = threading.Lock()
        self._last_write = 0.0
        self.superseded = False

    def on_stage(self, stage: str, state: str, *, error: str | None = None, detail: str | None = None):
        with self._lock:
            entry = self.stages.setdefault(stage, {"state": "pending", "ms": None})
            now = time.monotonic()
            if state == "running":
                self._t0[stage] = now
            elif stage in self._t0:
                entry["ms"] = int((now - self._t0.pop(stage)) * 1000)
            entry["state"] = state
            if error:
                entry["error"] = error
            if detail:
                entry["detail"] = detail
            self._write_locked("running")

    def heartbeat(self):
        with self._lock:
            if time.time() - self._last_write >= HEARTBEAT_EVERY_S:
                self._write_locked("running")

    def finish(self, state: str, *, error: str | None = None, detail: str | None = None):
        with self._lock:
            for entry in self.stages.values():
                if entry["state"] == "running":
                    entry["state"] = "failed"
            self._write_locked(state, error=error, detail=detail, finished=time.time())

    def _write_locked(self, state: str, **kw):
        if self.superseded:
            return
        try:
            jobs.write(self.project_id, self.run_id, state=state, stages=self.stages,
                       started=self.started, **kw)
            self._last_write = time.time()
        except jobs.Superseded:
            self.superseded = True
            print(f"job {self.project_id}/{self.run_id}: superseded by a newer run; stopping writes")


def _prepare_audio(record: projects.ProjectRecord, tmp: str) -> tuple[str, media.MediaInfo]:
    """Download source -> ffprobe -> reject long clips (before any paid call) -> 16k wav -> S3."""
    jobctx.report("audio", "running")
    try:
        src = os.path.join(tmp, "source" + (os.path.splitext(record.s3_key)[1] or ".mp4"))
        s3.download(record.s3_key, src)
        info = media.probe(src)
        limit = get_settings().max_clip_seconds
        if info.duration_ms > limit * 1000:
            raise ClipRejected(f"clip is {info.duration_ms / 1000:.1f}s; the limit is {limit}s")
        if not info.has_audio:
            raise ClipRejected("video has no audio track")
        wav = os.path.join(tmp, "audio.wav")
        media.extract_wav(src, wav)
        s3.upload(wav, s3.audio_key(record.id), "audio/wav")
    except Exception as exc:
        jobctx.report("audio", "failed", error=str(exc)[:300])
        raise
    jobctx.report("audio", "done", detail=f"{info.duration_ms / 1000:.1f}s {info.width}x{info.height}")
    return wav, info


def run_job(project_id: str, run_id: str, started: Optional[float] = None) -> None:
    tracker = JobTracker(project_id, run_id, started)
    ctx = jobctx.JobContext(project_id, on_stage=tracker.on_stage, on_heartbeat=tracker.heartbeat)
    t0 = time.monotonic()
    with jobctx.use(ctx):
        try:
            record = projects.get(project_id)
            preset = record.project.presetId if record.project else record.preset_id
            with tempfile.TemporaryDirectory(prefix=f"job-{project_id}-") as tmp:
                wav, info = _prepare_audio(record, tmp)
                doc = pipeline.run(
                    wav_path=wav, s3_uri=s3.s3_uri(s3.audio_key(project_id)),
                    video_url=s3.s3_uri(record.s3_key), duration_ms=info.duration_ms,
                    width=info.width, height=info.height, project_id=project_id, preset_id=preset,
                )
            project = Project.model_validate(doc)
            if tracker.superseded or not jobs.is_current(project_id, run_id):
                print(f"job {project_id}/{run_id}: superseded; result discarded")
                return
            projects.put_project(project_id, project, expected_version=None, manual_edit=False,
                                 status="ready")
            tracker.finish("done", detail=f"{len(project.words)} words in {time.monotonic() - t0:.1f}s")
        except Exception as exc:  # noqa: BLE001 — a background task has nobody to raise to
            traceback.print_exc()
            tracker.finish("failed", error=f"{type(exc).__name__}: {exc}"[:1000])
            try:
                projects.set_status(project_id, "failed")
            except Exception:  # noqa: BLE001
                pass
