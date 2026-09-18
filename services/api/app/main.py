"""API entrypoint (P1). Routers for the pipeline and agent get added here."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .agent.router import router as agent_router
from .config import get_settings
from .routers import costs, projects, render

settings = get_settings()  # fail fast at startup, listing every missing variable

app = FastAPI(title="Expressive Captions API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Project-Version", "X-Schema-Version"],
)


@app.exception_handler(HTTPException)
def flat_errors(request: Request, exc: HTTPException):
    """Every error body is flat: {"error": "...", ...}, never wrapped in {"detail": ...}."""
    body = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(projects.router)
app.include_router(costs.router)
# The REAL agent (P4): POST /agent/command, /agent/voice-command, /agent/livekit-token.
# It replaces the old `routers/agent.py` 501 stub (an RFC-6902 JSON Patch contract that was
# never built); the stub is deleted, so POST /projects/{id}/agent is gone with it.
# Importing this is startup-safe: boto3 is imported inside `agent.bedrock_client.get_bedrock_client`
# and `livekit-api` inside `agent.livekit_token.mint_join_token`, so a missing LIVEKIT_* var fails
# that one request, never the process. BEDROCK_MODEL_ID stays required by config.get_settings().
app.include_router(agent_router)
app.include_router(render.router)
