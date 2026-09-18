"""P2's seam: export via Remotion Lambda. `remotion/` is a README today, so both routes are 501
with the shapes P2 fills in. Renders are async, like the pipeline: start, then poll."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..store import projects

router = APIRouter(prefix="/projects/{project_id}/render", tags=["render (P2)"])


def _require_ready(project_id: str) -> None:
    try:
        record = projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None
    if record.project is None:
        raise HTTPException(409, {"error": "not_ready", "status": record.status})


@router.post("")
def start_render(project_id: str):
    _require_ready(project_id)
    return JSONResponse(status_code=501, content={
        "error": "not_implemented", "owner": "P2",
        "responseContract": {"status": 202, "body": {"renderId": "r_abc123", "state": "queued"}}})


@router.get("/{render_id}")
def render_status(project_id: str, render_id: str):
    _require_ready(project_id)
    return JSONResponse(status_code=501, content={
        "error": "not_implemented", "owner": "P2",
        "responseContract": {"state": "queued | rendering | done | failed", "progress": 0.42,
                             "outputUrl": "presigned GET of the mp4 when done, else null"}})
