"""Project routes: create/upload, process, status, read, list, patch.

Every Project leaves this API through `_project_body`, which dumps with exclude_none: the zod
schema's `.optional()` accepts a missing key but rejects `null`.
"""
from __future__ import annotations

import time
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import s3
from ..jobs import runner
from ..schema import PresetId, Project
from ..store import jobs, projects

router = APIRouter(prefix="/projects", tags=["projects"])


def _record_or_404(project_id: str) -> projects.ProjectRecord:
    try:
        return projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None


def _project_body(record: projects.ProjectRecord, project: Project | None = None) -> dict:
    """The Project as the editor sees it: videoUrl is a fresh presigned GET, never s3://."""
    project = project or record.project
    body = project.model_dump(mode="json", exclude_none=True)
    if record.s3_key:
        body["videoUrl"] = s3.presigned_get(record.s3_key)
    return body


def _version_headers(response: Response, version: int, schema_version: int) -> None:
    response.headers["X-Project-Version"] = str(version)
    response.headers["X-Schema-Version"] = str(schema_version)


class CreateProject(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    contentType: str = Field(pattern=r"^video/[\w.+-]+$")
    presetId: PresetId = "kathmandu"


@router.post("", status_code=201)
def create_project(req: CreateProject):
    project_id = uuid.uuid4().hex[:12]
    key = s3.source_key(project_id, req.filename)
    projects.create(project_id, s3_key=key, preset_id=req.presetId,
                    filename=req.filename, content_type=req.contentType)
    return {"projectId": project_id, "upload": s3.presigned_upload(key, req.contentType),
            "expiresInSec": s3.UPLOAD_EXPIRES}


@router.get("")
def list_projects():
    return {"projects": projects.list_projects()}


@router.get("/{project_id}")
def get_project(project_id: str, response: Response):
    record = _record_or_404(project_id)
    if record.project is None:
        return JSONResponse(status_code=409, content={
            "error": "not_ready", "status": record.status,
            "detail": "no captions yet; POST /projects/{id}/process and poll /status"})
    _version_headers(response, record.version, record.schema_version)
    return _project_body(record)


@router.post("/{project_id}/process", status_code=202)
def process_project(project_id: str, background: BackgroundTasks, force: bool = False):
    """Start the pipeline. The client calls this after its presigned POST to S3 returned.

    Re-running REPLACES every word and re-numbers every word id (ids are positional,
    build.py). With manual edits present that is destructive, so it needs ?force=true —
    this is a refuse-to-destroy guard, not a merge.
    """
    record = _record_or_404(project_id)
    if record.has_manual_edits and not force:
        return JSONResponse(status_code=409, content={
            "error": "has_manual_edits",
            "detail": "re-running replaces all words and invalidates word ids; "
                      "pass ?force=true to discard manual edits"})
    if not record.s3_key or not s3.exists(record.s3_key):
        return JSONResponse(status_code=400, content={
            "error": "upload_missing", "detail": "no source video in S3 yet; finish the presigned upload first"})
    run_id = uuid.uuid4().hex[:12]
    try:
        job = jobs.start(project_id, run_id)
    except jobs.AlreadyRunning as exc:
        return JSONResponse(status_code=409, content={"error": "already_running", "job": exc.job})
    projects.set_status(project_id, "processing")
    background.add_task(runner.run_job, project_id, run_id, time.time())
    return job


@router.get("/{project_id}/status")
def project_status(project_id: str):
    record = _record_or_404(project_id)
    job = jobs.get(project_id)
    if job is None:
        return {"projectId": project_id, "state": "not_started", "status": record.status,
                "stages": jobs.empty_stages(), "error": None}
    return {**job, "status": record.status}
