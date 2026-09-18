"""API entrypoint (P1). Routers for the pipeline and agent get added here."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routers import agent, costs, projects, render

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
app.include_router(agent.router)
app.include_router(render.router)
