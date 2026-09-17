"""Phase 1: a route object that exercises the Phase 1 contract end-to-end
over HTTP — and nothing more.

NOT wired into app/main.py. That one-line `app.include_router(...)` touches
a file outside services/api/app/agent/ (see the Phase 1 audit's "Files NOT
Modified" / cross-team section for why this is flagged rather than done
silently). This module is only imported by tests until that's decided.

The handler below deliberately does not attempt to understand
`request.command` — there is no planner yet (Phase 6). It validates the
request against the Phase 1 contract and returns an honest
status="not_implemented" response, per the instruction not to let a stub
pretend the agent works.
"""
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter

from .contracts import AgentCommandRequest, AgentCommandResponse, AgentLogEntry

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/command", response_model=AgentCommandResponse)
def run_command(request: AgentCommandRequest) -> AgentCommandResponse:
    """Validate `request` against the Phase 1 contract; return a fixed
    not-implemented response. Replaced by the real planner in Phase 6."""
    return AgentCommandResponse(
        status="not_implemented",
        patches=[],
        log=[
            AgentLogEntry(
                id=uuid.uuid4().hex,
                message="Agent planner is not implemented yet (Phase 6).",
                timestamp=int(time.time() * 1000),
            )
        ],
    )
