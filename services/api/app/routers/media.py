"""Overlay media for layers: upload an image or a video, then serve it back.

    POST /projects/{id}/media           {filename, contentType} -> 201 {mediaId, kind, upload}
    GET  /projects/{id}/media/{mediaId} -> 307 to a fresh presigned GET

Upload reuses the main video's presigned-POST path unchanged (s3.presigned_upload), including
its size cap, so the browser sends the bytes straight to S3 and they never pass through here.

Serving is a redirect rather than a URL stored in the project, for the same reason `videoUrl` is
minted per response: a presigned URL expires in an hour, and a project document outlives that.
`<img>` and `<video>` follow the redirect, so the editor can use this path as a plain `src`.
"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from .. import s3
from ..schema import MEDIA_ID_PATTERN
from ..store import projects

router = APIRouter(prefix="/projects/{project_id}/media", tags=["media"])

#: The only types a layer accepts, and the extension each is stored under. A closed list: the
#: extension is part of the media id, and the id pattern admits exactly these.
EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}


class CreateMedia(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    contentType: str


def _require_project(project_id: str) -> None:
    try:
        projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None


@router.post("", status_code=201)
def create_media(project_id: str, req: CreateMedia):
    ext = EXTENSIONS.get(req.contentType)
    if ext is None:
        raise HTTPException(415, {"error": "unsupported_media_type", "contentType": req.contentType,
                                  "accepted": sorted(EXTENSIONS)})
    _require_project(project_id)
    media_id = uuid.uuid4().hex[:12] + ext
    return {
        "mediaId": media_id,
        "kind": "video" if req.contentType.startswith("video/") else "image",
        "upload": s3.presigned_upload(s3.media_key(project_id, media_id), req.contentType),
        "expiresInSec": s3.UPLOAD_EXPIRES,
    }


@router.get("/{media_id}")
def get_media(project_id: str, media_id: str):
    # Checked BEFORE anything touches S3 or the store: an id that is not ours is simply not found.
    if not re.fullmatch(MEDIA_ID_PATTERN, media_id):
        raise HTTPException(404, {"error": "not_found", "mediaId": media_id})
    _require_project(project_id)
    return RedirectResponse(s3.presigned_get(s3.media_key(project_id, media_id)), status_code=307)
