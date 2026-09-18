"""Projects: one Dynamo item per project, the whole Project stored as one JSON string.

Why a blob (plan §1, confirmed in audit 12): the Project JSON is the contract, every write is one
validated Project, and word ids are positional (`build.py`), so per-word rows would buy nothing.
Why a string and not a Map: floats. A JSON string round-trips exactly; a Map goes through Decimal.

Writes are optimistic: every item carries `version`; a write is conditional on the version it read.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from ..schema import Project
from . import dynamo
from .dynamo import B, N, S

SCHEMA_VERSION = 1
# (from_version, to_version, fn(doc) -> doc). Applied lazily on read; written back on next write.
MIGRATIONS: list[tuple[int, int, Callable[[dict], dict]]] = []

MAX_DOC_BYTES = 350 * 1024   # Dynamo's hard item limit is 400 KB

SK = "PROJECT"


class NotFound(Exception):
    pass


class StaleVersion(Exception):
    def __init__(self, current_version: int):
        super().__init__(f"stale version; current is {current_version}")
        self.current_version = current_version


class TooLarge(Exception):
    pass


class WordNotFound(Exception):
    pass


@dataclass
class ProjectRecord:
    id: str
    status: str                 # awaiting_upload | processing | ready | failed
    version: int
    schema_version: int
    preset_id: str
    s3_key: str | None
    has_manual_edits: bool
    created_at: str
    updated_at: str
    project: Project | None     # None until the pipeline (or a seed) has written one


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def migrate(doc: dict, from_version: int) -> dict:
    version = from_version
    for src, dst, step in MIGRATIONS:
        if src == version:
            doc, version = step(doc), dst
    if version != SCHEMA_VERSION:
        raise ValueError(f"no migration path from schema v{from_version} to v{SCHEMA_VERSION}")
    return doc


def _key(project_id: str) -> dict:
    return {"pk": S(dynamo.project_pk(project_id)), "sk": S(SK)}


def _record(project_id: str, raw: dict) -> ProjectRecord:
    item = dynamo.plain(raw)
    project = None
    if item.get("doc"):
        doc = migrate(json.loads(item["doc"]), int(item.get("schemaVersion", 1)))
        project = Project.model_validate(doc)
    return ProjectRecord(
        id=project_id,
        status=item.get("status", "ready"),
        version=int(item.get("version", 0)),
        schema_version=int(item.get("schemaVersion", SCHEMA_VERSION)),
        preset_id=item.get("presetId", "kathmandu"),
        s3_key=item.get("s3Key"),
        has_manual_edits=bool(item.get("hasManualEdits", False)),
        created_at=item.get("createdAt", ""),
        updated_at=item.get("updatedAt", ""),
        project=project,
    )


def _dump(project: Project) -> str:
    doc = project.model_dump_json(exclude_none=True)
    if len(doc.encode()) > MAX_DOC_BYTES:
        raise TooLarge(f"project JSON is {len(doc.encode())} bytes; limit {MAX_DOC_BYTES}")
    return doc


def create(project_id: str, *, s3_key: str | None, preset_id: str, filename: str = "",
           content_type: str = "") -> ProjectRecord:
    ts = now_iso()
    item = {
        **_key(project_id),
        "status": S("awaiting_upload"), "version": N(0), "schemaVersion": N(SCHEMA_VERSION),
        "presetId": S(preset_id), "hasManualEdits": B(False),
        "createdAt": S(ts), "updatedAt": S(ts),
        "filename": S(filename), "contentType": S(content_type),
    }
    if s3_key:
        item["s3Key"] = S(s3_key)
    dynamo.client().put_item(TableName=dynamo.table(), Item=item,
                             ConditionExpression="attribute_not_exists(pk)")
    return get(project_id)


def get(project_id: str) -> ProjectRecord:
    raw = dynamo.client().get_item(TableName=dynamo.table(), Key=_key(project_id),
                                   ConsistentRead=True).get("Item")
    if not raw:
        raise NotFound(project_id)
    return _record(project_id, raw)


def put_project(project_id: str, project: Project, *, expected_version: int | None,
                manual_edit: bool, status: str = "ready", s3_key: str | None = None,
                seed: bool = False) -> int:
    """Write a whole validated Project. Returns the new version.

    expected_version=None with seed=True creates-or-replaces unconditionally (seeding only).
    Pipeline writes set manual_edit=False, which clears hasManualEdits: a fresh run has no edits.
    """
    if project.id != project_id:
        raise ValueError(f"project.id {project.id!r} != {project_id!r}")
    doc = _dump(project)
    names = {"#doc": "doc", "#v": "version", "#st": "status", "#sv": "schemaVersion",
             "#u": "updatedAt", "#m": "hasManualEdits", "#p": "presetId"}
    values = {":doc": S(doc), ":one": N(1), ":st": S(status), ":sv": N(SCHEMA_VERSION),
              ":u": S(now_iso()), ":m": B(manual_edit), ":p": S(project.presetId), ":zero": N(0)}
    sets = "#doc = :doc, #st = :st, #sv = :sv, #u = :u, #m = :m, #p = :p"
    if s3_key:
        names["#k"], values[":k"] = "s3Key", S(s3_key)
        sets += ", #k = :k"
    if seed:
        names["#c"], values[":c"] = "createdAt", S(now_iso())
        sets += ", #c = if_not_exists(#c, :c)"
        condition = None
    else:
        condition = "attribute_exists(pk)" if expected_version is None else "#v = :expected"
        if expected_version is not None:
            values[":expected"] = N(expected_version)
    kwargs: dict[str, Any] = dict(
        TableName=dynamo.table(), Key=_key(project_id),
        UpdateExpression=f"SET {sets}, #v = if_not_exists(#v, :zero) + :one",
        ExpressionAttributeNames=names, ExpressionAttributeValues=values,
        ReturnValues="UPDATED_NEW",
    )
    if condition:
        kwargs["ConditionExpression"] = condition
    try:
        out = dynamo.client().update_item(**kwargs)
    except dynamo.client().exceptions.ConditionalCheckFailedException:
        raise _stale_or_missing(project_id) from None
    return int(out["Attributes"]["version"]["N"])


def _stale_or_missing(project_id: str) -> Exception:
    try:
        return StaleVersion(get(project_id).version)
    except NotFound as exc:
        return exc


def set_status(project_id: str, status: str) -> None:
    dynamo.client().update_item(
        TableName=dynamo.table(), Key=_key(project_id),
        UpdateExpression="SET #st = :st, #u = :u",
        ConditionExpression="attribute_exists(pk)",
        ExpressionAttributeNames={"#st": "status", "#u": "updatedAt"},
        ExpressionAttributeValues={":st": S(status), ":u": S(now_iso())},
    )


def _edit(project_id: str, expected_version: int | None,
          change: Callable[[dict], Any]) -> tuple[Any, int]:
    """Read -> change the doc dict -> re-validate the WHOLE Project -> conditional write.

    Mirrors the client reducer (audit 02): an invalid result raises pydantic.ValidationError and
    nothing is written. With expected_version=None the caller opted out of conflict detection
    (last write wins), so a lost race is retried once against the fresh version.
    """
    for attempt in range(2):
        record = get(project_id)
        if record.project is None:
            raise NotFound(project_id)
        if expected_version is not None and expected_version != record.version:
            raise StaleVersion(record.version)
        doc = record.project.model_dump(exclude_none=True)
        result = change(doc)
        project = Project.model_validate(doc)
        try:
            version = put_project(project_id, project, expected_version=record.version,
                                  manual_edit=True, status=record.status)
            return result(project) if callable(result) else result, version
        except StaleVersion:
            if expected_version is not None or attempt:
                raise
    raise AssertionError("unreachable")


def _merge_style(current: dict | None, patch: dict) -> dict | None:
    merged = dict(current or {})
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)       # explicit null removes the override
        else:
            merged[key] = value
    return merged or None


def patch_word(project_id: str, word_id: str, patch: dict, expected_version: int | None):
    """Apply a partial Word update. `style` merges key-by-key; other fields replace."""
    def change(doc: dict):
        for index, word in enumerate(doc["words"]):
            if word["id"] == word_id:
                break
        else:
            raise WordNotFound(word_id)
        for key, value in patch.items():
            if key == "style":
                style = _merge_style(word.get("style"), value or {})
                if style is None:
                    word.pop("style", None)
                else:
                    word["style"] = style
            elif value is None:
                word.pop(key, None)     # only optional fields (emoji, signals) survive validation
            else:
                word[key] = value
        return lambda project: project.words[index]
    return _edit(project_id, expected_version, change)


def patch_project(project_id: str, patch: dict, expected_version: int | None):
    """presetId and/or settings (settings merge key-by-key)."""
    def change(doc: dict):
        if "presetId" in patch:
            doc["presetId"] = patch["presetId"]
        if "settings" in patch:
            doc["settings"] = {**doc["settings"], **patch["settings"]}
        return lambda project: project
    return _edit(project_id, expected_version, change)


def list_projects() -> list[dict]:
    prefix = f"{dynamo.project_pk('')}"
    out, start = [], None
    while True:
        kwargs = dict(
            TableName=dynamo.table(),
            FilterExpression="begins_with(pk, :p) AND sk = :sk",
            ExpressionAttributeValues={":p": S(prefix), ":sk": S(SK)},
            ProjectionExpression="pk, #st, version, presetId, createdAt, updatedAt, hasManualEdits, filename",
            ExpressionAttributeNames={"#st": "status"},
        )
        if start:
            kwargs["ExclusiveStartKey"] = start
        page = dynamo.client().scan(**kwargs)
        for raw in page.get("Items", []):
            item = dynamo.plain(raw)
            item["projectId"] = item.pop("pk")[len(prefix):]
            out.append(item)
        start = page.get("LastEvaluatedKey")
        if not start:
            break
    return sorted(out, key=lambda i: i.get("createdAt", ""), reverse=True)
