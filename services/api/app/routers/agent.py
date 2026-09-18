"""P4's seam: the HTTP envelope for the voice/text agent. The agent itself lives in app/agent/ (P4).

Until P4 wires `app.agent` in, this validates the request against the real project and answers
501 with the response contract, so the editor and the agent can both code against it now.

Contract notes for P4 (audit 12):
- `patch` is RFC 6902 JSON Patch over the Project. `/words/N` is an ARRAY INDEX, not a word id:
  word "w12" is `/words/11` (build.py numbers ids from w1). Prefer resolving ids to indexes
  server-side from `selection`, never trusting the LLM to count.
- The route must validate the patched Project (app.schema.Project) before persisting, and persist
  through app.store.projects with the client's `version` (409 on stale), like PATCH does.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from ..store import projects

router = APIRouter(prefix="/projects/{project_id}/agent", tags=["agent (P4)"])

RESPONSE_CONTRACT = {
    "patch": [{"op": "replace", "path": "/words/11/style/color", "value": "#ff2d55"}],
    "applied": True,
    "version": 9,
    "steps": [{"tool": "find_words", "args": {"query": "swear words"}},
              {"tool": "update_style", "args": {"wordIds": ["w12"], "style": {"color": "#ff2d55"}}}],
}


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    utterance: str = Field(min_length=1, max_length=2000)
    selection: list[str] = []
    version: Optional[int] = None


@router.post("")
def agent(project_id: str, req: AgentRequest):
    try:
        record = projects.get(project_id)
    except projects.NotFound:
        raise HTTPException(404, {"error": "not_found", "projectId": project_id}) from None
    if record.project is None:
        raise HTTPException(409, {"error": "not_ready", "status": record.status})
    known = {w.id for w in record.project.words}
    unknown = [wid for wid in req.selection if wid not in known]
    if unknown:
        raise HTTPException(422, {"error": "unknown_word_ids", "wordIds": unknown})
    return JSONResponse(status_code=501, content={
        "error": "not_implemented", "owner": "P4",
        "detail": "request is valid; the agent is not wired in yet (app/agent/)",
        "responseContract": RESPONSE_CONTRACT,
    })
