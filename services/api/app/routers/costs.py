"""Cost visibility: per project, and across days (one Query per day on the byDay GSI)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from .. import costs
from ..store import projects

router = APIRouter(tags=["costs"])


@router.get("/projects/{project_id}/cost")
def project_cost(project_id: str):
    try:
        record = projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None
    return costs.project_summary(project_id, record.project.durationMs if record.project else None)


@router.get("/costs")
def cost_range(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None):
    today = datetime.now(timezone.utc).date()   # cost rows are bucketed by UTC day
    start, end = from_ or to or today, to or from_ or today
    try:
        return costs.range_summary(start, end)
    except ValueError as exc:
        raise HTTPException(400, {"error": "bad_range", "detail": str(exc)}) from None
