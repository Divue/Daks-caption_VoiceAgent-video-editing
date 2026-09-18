"""API entrypoint (P1). Routers for the pipeline and agent get added here."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings

settings = get_settings()  # fail fast at startup, listing every missing variable

app = FastAPI(title="Expressive Captions API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Project-Version", "X-Schema-Version"],
)


@app.get("/health")
def health():
    return {"ok": True}
