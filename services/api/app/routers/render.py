"""Export: render the SAVED project with the caption composition and hand back a download link.

The render itself runs in the Remotion render server (`remotion/server`, Node + Chromium), not here:
a browser render does not belong in this Python image, and it needs 1-2 GB the API should not be
holding. This router is deliberately thin and STATELESS — the render server owns the render's state;
this only starts it, reports it, and, once it is done, moves the finished MP4 onto S3 so the editor
gets an ordinary presigned link (which also survives a render-server restart).

    POST /projects/{id}/render          -> 202 {renderId, state}
    GET  /projects/{id}/render/{rid}    -> {renderId, state, progress, outputUrl, error}
                                           state: queued | rendering | done | failed

What it exports is what is SAVED. The editor also holds session-only tweaks (unsaved slider drags) that
are not part of the Project; they cannot be rendered, and the editor's export dialog says so.
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
import threading
from typing import Any

import requests
from fastapi import APIRouter, HTTPException

from .. import s3
from ..store import projects
from .projects import _project_body

router = APIRouter(prefix="/projects/{project_id}/render", tags=["render"])

# The render server mints 12 hex characters. Refusing anything else keeps a caller from steering the
# request path this router builds for the render server.
RENDER_ID = re.compile(r"^[0-9a-f]{12}$")
DEFAULT_FPS = 30.0
MIN_FPS, MAX_FPS = 1.0, 120.0
START_TIMEOUT_S = 20
STATUS_TIMEOUT_S = 10

_upload_locks: dict[str, threading.Lock] = {}
_upload_locks_guard = threading.Lock()


def service_url() -> str:
    """Read per call, so a changed environment (and tests) take effect without an import-time freeze."""
    return os.environ.get("RENDER_SERVICE_URL", "http://host.docker.internal:3100").rstrip("/")


def _unavailable(detail: str | None = None) -> HTTPException:
    return HTTPException(503, {
        "error": "render_unavailable",
        "detail": detail or (
            "The render server isn't running. Start it with `npm run render-server` in the remotion/ folder "
            f"(the API looks for it at {service_url()})."),
    })


def _call(method: str, path: str, *, timeout: float, **kwargs: Any) -> requests.Response:
    try:
        return requests.request(method, f"{service_url()}{path}", timeout=timeout, **kwargs)
    except (requests.ConnectionError, requests.Timeout):
        raise _unavailable() from None


def _require_ready(project_id: str) -> projects.ProjectRecord:
    try:
        record = projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None
    if record.project is None:
        raise HTTPException(409, {"error": "not_ready", "status": record.status})
    if not record.s3_key:
        # A seeded demo project has no uploaded video, so there is nothing to put captions on.
        raise HTTPException(409, {"error": "no_video", "detail": "This project has no uploaded video to export."})
    return record


def parse_frame_rate(text: str) -> float | None:
    """'30000/1001' -> 29.97, '25/1' -> 25.0, '0/0' or junk -> None."""
    try:
        num, _, den = text.strip().partition("/")
        value = float(num) / float(den or 1)
    except (ValueError, ZeroDivisionError):
        return None
    return round(value, 3) if MIN_FPS <= value <= MAX_FPS else None


def probe_fps(url: str) -> float:
    """The source's own frame rate, so a 25 fps clip exports at 25 rather than being resampled to 30.

    Best-effort: any failure falls back to 30, because an export at the wrong frame rate is a much
    smaller problem than an export that cannot start.
    """
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=avg_frame_rate,r_frame_rate", "-of", "csv=p=0", url],
            capture_output=True, text=True, timeout=30,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return DEFAULT_FPS
    for field in out.strip().replace("\n", ",").split(","):
        fps = parse_frame_rate(field)
        if fps:
            return fps
    return DEFAULT_FPS


def output_key(project_id: str, render_id: str) -> str:
    return f"{s3.project_prefix(project_id)}/renders/{render_id}.mp4"


def download_name(project_id: str) -> str:
    return f"{project_id}-captioned.mp4"


def _media_urls(project_id: str, record) -> dict[str, str]:
    """A fresh presigned GET for every file the project's layers use, keyed by mediaId.

    Minted here, like `videoUrl`, because the render server has no AWS credentials and a URL stored in
    the project would have expired. The ids already passed schema.MEDIA_ID_PATTERN when the project
    was validated, so each key built from one is a name under this project's prefix, never a path.
    """
    layers = (record.project.layers if record.project else None) or []
    return {item.mediaId: s3.presigned_get(s3.media_key(project_id, item.mediaId))
            for item in layers}


@router.post("", status_code=202)
def start_render(project_id: str) -> dict:
    record = _require_ready(project_id)
    body = _project_body(record)  # the SAVED project, with a fresh presigned videoUrl
    video_url = body.get("videoUrl", "")
    response = _call("POST", "/renders", timeout=START_TIMEOUT_S, json={
        "projectId": project_id, "project": body, "videoUrl": video_url, "fps": probe_fps(video_url),
        "mediaUrls": _media_urls(project_id, record)})
    if response.status_code == 400:
        raise HTTPException(422, {"error": "invalid_render_request", "detail": response.json().get("detail", "")})
    if not response.ok:
        raise HTTPException(502, {"error": "render_failed_to_start", "detail": response.text[:200]})
    data = response.json()
    return {"renderId": data["renderId"], "state": data["state"]}


def _deliver(project_id: str, render_id: str) -> None:
    """Move the finished MP4 from the render server onto S3. Idempotent, and serialised per render."""
    key = output_key(project_id, render_id)
    with _upload_locks_guard:
        lock = _upload_locks.setdefault(render_id, threading.Lock())
    with lock:
        if s3.exists(key):  # another poll got here first
            return
        with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
            try:
                with requests.get(f"{service_url()}/renders/{render_id}/file", stream=True, timeout=(5, 120)) as r:
                    if not r.ok:
                        raise _unavailable("The finished video could not be fetched from the render server.")
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        tmp.write(chunk)
            except (requests.ConnectionError, requests.Timeout):
                raise _unavailable() from None
            tmp.flush()
            s3.upload(tmp.name, key, "video/mp4")
    try:  # free the render server's disk; a failure here costs nothing
        requests.delete(f"{service_url()}/renders/{render_id}", timeout=STATUS_TIMEOUT_S)
    except requests.RequestException:
        pass


def _result(render_id: str, state: str, progress: float, *, url: str | None = None, error: str | None = None) -> dict:
    return {"renderId": render_id, "state": state, "progress": progress, "outputUrl": url, "error": error}


@router.get("/{render_id}")
def render_status(project_id: str, render_id: str) -> dict:
    _require_ready(project_id)
    if not RENDER_ID.match(render_id):
        raise HTTPException(404, {"error": "not_found", "renderId": render_id})
    key = output_key(project_id, render_id)

    # Already delivered: answer from S3 alone, so a poll after completion never needs the render server.
    if s3.exists(key):
        return _result(render_id, "done", 1.0, url=s3.presigned_download(key, download_name(project_id)))

    response = _call("GET", f"/renders/{render_id}", timeout=STATUS_TIMEOUT_S)
    if response.status_code == 404:
        return _result(render_id, "failed", 0.0,
                       error="This export was lost (the render server restarted). Please export again.")
    if not response.ok:
        raise HTTPException(502, {"error": "render_status_failed", "detail": response.text[:200]})
    data = response.json()
    # Exact match only. Accepting a missing projectId let a render created straight against the
    # render server (which does not require one) be claimed by ANY project id, and its MP4 copied
    # into that project's S3 prefix.
    if data.get("projectId") != project_id:
        raise HTTPException(404, {"error": "not_found", "renderId": render_id})  # someone else's render

    state = data.get("state", "failed")
    if state == "done":
        _deliver(project_id, render_id)
        return _result(render_id, "done", 1.0, url=s3.presigned_download(key, download_name(project_id)))
    return _result(render_id, state, float(data.get("progress") or 0.0), error=data.get("error"))
