"""Serves the bake-off clips so the bundled demo project has a real video.

DEV ONLY, and narrow on purpose. The demo fixtures carry a bare filename
("Normal.mp4") which is not a URL: the editor's <video> shows nothing and
`analyze_frame` refuses it, so vision could never run in the app even though it
works perfectly against a real URL. Serving the same clips the STT bake-off
already keeps in the repo turns the fixture into something both the browser and
ffmpeg can actually read.

Not a general static-file route: it serves exactly the files already present in
`scripts/stt_bakeoff/clips`, by name, with no path traversal and no directory
listing. Real projects never come through here — their `videoUrl` is a
presigned S3 GET.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/demo-media", tags=["demo"])

CLIPS = Path(__file__).resolve().parents[2] / "scripts" / "stt_bakeoff" / "clips"


@router.get("/{name}")
def demo_clip(name: str) -> FileResponse:
    # `name` is matched against the real directory listing rather than joined
    # onto a path, so "../.." and absolute paths cannot escape it.
    if not CLIPS.is_dir():
        raise HTTPException(404, {"error": "demo_media_unavailable", "detail": "no clips directory"})
    allowed = {entry.name for entry in CLIPS.iterdir() if entry.is_file()}
    if name not in allowed:
        raise HTTPException(404, {"error": "not_found", "name": name})
    return FileResponse(CLIPS / name, media_type="video/mp4")
