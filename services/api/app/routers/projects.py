"""Project routes: create/upload, read, list. (process/status/patch are added in later steps.)

Every Project leaves this API through `_project_body`, which dumps with exclude_none: the zod
schema's `.optional()` accepts a missing key but rejects `null`.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import s3
from ..schema import PresetId, Project
from ..store import projects

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
