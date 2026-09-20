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
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .. import s3
from ..jobs import runner
from ..schema import Emotion, PresetId, Project, Signals
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
    presetId: PresetId = "rangmanch"


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


class WordFields(BaseModel):
    """The mutable Word fields, and nothing else.

    Split out of `WordPatch` so the bulk route's per-word entry carries EXACTLY the same fields
    without inheriting `version` — a bulk call has one version for the whole batch, not one per
    word. `WordPatch`'s own shape is unchanged.
    """
    model_config = ConfigDict(extra="forbid")
    text: Optional[str] = None
    startMs: Optional[int] = None
    endMs: Optional[int] = None
    emphasis: Optional[bool] = None
    emotion: Optional[Emotion] = None
    stretch: Optional[float] = None
    single: Optional[bool] = None
    emoji: Optional[str] = None
    style: Optional[dict] = None
    signals: Optional[Signals] = None


class WordPatch(WordFields):
    """Any subset of the mutable Word fields. `style` merges key-by-key; a null style key removes it.
    `version` opts in to conflict detection; omitted means last write wins."""
    version: Optional[int] = None


class WordsPatchEntry(WordFields):
    """One word's patch inside a bulk PATCH: the same fields as `WordPatch`, plus the word it hits."""
    wordId: str = Field(min_length=1)


class WordsPatch(BaseModel):
    """Many per-word patches applied as ONE atomic write. See `patch_words` below."""
    model_config = ConfigDict(extra="forbid")
    words: list[WordsPatchEntry] = []
    version: Optional[int] = None


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    presetId: Optional[PresetId] = None
    settings: Optional[dict] = None
    # Persisted preset tweaks (wordsPerLine, the emphasis face/scale, reveal, per-emotion styling).
    # Merges key-by-key like `settings`, but a null KEY removes that one override and a null
    # OBJECT clears them all — see store/projects.patch_project.
    presetOverride: Optional[dict] = None
    # The overlay media, as the whole list it should now be (store/projects.patch_project).
    # Items are validated as part of the resulting Project, so a bad one is a 422, not a write.
    layers: Optional[list[dict]] = None
    # The preset segments, as the whole list they should now be — same shape and same reason as
    # `layers` above. Validated as part of the resulting Project (which is also where the
    # sorted/disjoint rule is enforced), so a bad list is a 422 and not a write.
    presetSegments: Optional[list[dict]] = None
    version: Optional[int] = None


def _apply(response: Response, project_id: str, fn, patch: dict | list, version: Optional[int]):
    """Every store error, mapped to this API's flat error bodies. `patch` is whatever `fn` takes:
    a dict for the single-word/project routes, an ordered list of (wordId, patch) for the bulk one."""
    try:
        return fn(project_id, patch, version)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None
    except projects.WordNotFound as exc:
        raise HTTPException(404, {"error": "word_not_found", "wordId": str(exc)}) from None
    except projects.StaleVersion as exc:
        raise HTTPException(409, {"error": "stale_version", "currentVersion": exc.current_version}) from None
    except ValidationError as exc:
        raise HTTPException(422, {"error": "invalid_project", "detail": exc.errors(include_url=False,
                                                                                  include_context=False)}) from None


@router.patch("/{project_id}/words")
def patch_words(project_id: str, req: WordsPatch, response: Response):
    """Bulk per-word edit: one validation, one write, ONE version bump, all-or-nothing.

    The single-word route is fine for a click in the inspector. One agent turn is not: a 94-word
    restyle would be 94 sequential round trips through the same version counter, each one a read,
    a full-Project validation and a conditional write, and any failure half-way leaves the project
    half-styled. Here a single unknown wordId fails the whole call (404 `word_not_found`, nothing
    written) and the client gets back exactly one new version to send with its next edit.

    Body:  {"words": [{"wordId": "w1", ...WordPatch fields}, ...], "version": 7}
    Reply: {"words": [ ...the updated words, in request order... ], "version": 8}
    """
    entries = [(entry.wordId, entry.model_dump(exclude_unset=True, exclude={"wordId"}))
               for entry in req.words]
    empty = [word_id for word_id, patch in entries if not patch]
    if not entries or empty:
        raise HTTPException(400, {"error": "empty_patch", **({"wordIds": empty} if empty else {})})
    words, version = _apply(response, project_id,
                            lambda pid, p, v: projects.patch_words(pid, p, v), entries, req.version)
    _version_headers(response, version, projects.SCHEMA_VERSION)
    return {"words": [w.model_dump(mode="json", exclude_none=True) for w in words], "version": version}


@router.patch("/{project_id}/words/{word_id}")
def patch_word(project_id: str, word_id: str, req: WordPatch, response: Response):
    patch = req.model_dump(exclude_unset=True, exclude={"version"})
    if not patch:
        raise HTTPException(400, {"error": "empty_patch"})
    word, version = _apply(response, project_id,
                           lambda pid, p, v: projects.patch_word(pid, word_id, p, v), patch, req.version)
    _version_headers(response, version, projects.SCHEMA_VERSION)
    return {"word": word.model_dump(mode="json", exclude_none=True), "version": version}


@router.patch("/{project_id}")
def patch_project(project_id: str, req: ProjectPatch, response: Response):
    patch = req.model_dump(exclude_unset=True, exclude={"version"})
    if not patch:
        raise HTTPException(400, {"error": "empty_patch"})
    project, version = _apply(response, project_id, projects.patch_project, patch, req.version)
    _version_headers(response, version, projects.SCHEMA_VERSION)
    return {"project": _project_body(_record_or_404(project_id), project), "version": version}
