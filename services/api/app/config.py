"""Settings, read once from the environment. Fails fast, listing every missing variable at once.

Sarvam is optional on purpose: without the key the pipeline still runs (Transcribe text,
romanised by Bedrock) and the `sarvam` stage reports `skipped`. Requiring it at startup would
stop anyone without the secret from even reaching /health.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from functools import lru_cache

REQUIRED = ("AWS_REGION", "S3_BUCKET", "DYNAMO_TABLE", "DEV_PREFIX", "BEDROCK_MODEL_ID")


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    aws_region: str
    s3_bucket: str
    dynamo_table: str
    dev_prefix: str
    bedrock_model_id: str
    sarvam_api_key: str | None
    cors_origins: tuple[str, ...]
    max_clip_seconds: int = 60           # checked after ffprobe, before any paid call
    max_upload_bytes: int = 200 * 1024 * 1024
    stale_job_seconds: int = 120         # a running job with an older heartbeat is "worker lost"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    missing = [name for name in REQUIRED if not os.environ.get(name, "").strip()]
    if missing:
        raise SettingsError(
            "missing required environment variables: " + ", ".join(missing)
            + " (copy .env.example to .env and fill them in)"
        )
    sarvam = os.environ.get("SARVAM_API_KEY", "").strip() or None
    if sarvam is None:
        print("warning: SARVAM_API_KEY not set; pipeline will use Transcribe + Bedrock romanisation",
              file=sys.stderr)
    return Settings(
        aws_region=os.environ["AWS_REGION"].strip(),
        s3_bucket=os.environ["S3_BUCKET"].strip(),
        dynamo_table=os.environ["DYNAMO_TABLE"].strip(),
        dev_prefix=os.environ["DEV_PREFIX"].strip(),
        bedrock_model_id=os.environ["BEDROCK_MODEL_ID"].strip(),
        sarvam_api_key=sarvam,
        cors_origins=tuple(
            o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        ),
        max_clip_seconds=int(os.environ.get("MAX_CLIP_SECONDS", "60")),
    )
