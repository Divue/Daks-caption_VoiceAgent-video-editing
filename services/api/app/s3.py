"""S3: key layout, presigned upload (POST) / playback (GET), and transfer for the job runner.

Presigned POST, not PUT: a POST policy can carry `content-length-range`, so a browser cannot
push a multi-GB file into the demo bucket. The client is regional + SigV4 + virtual-hosted so
the signed URL is `https://{bucket}.s3.ap-south-1.amazonaws.com/...` — the global endpoint
redirects, and a redirect on a CORS preflight fails in the browser.
"""
from __future__ import annotations

import os
import threading

import boto3
from botocore.config import Config

from .config import get_settings

_lock = threading.Lock()
_client = None

UPLOAD_EXPIRES = 900
PLAYBACK_EXPIRES = 3600


def client():
    global _client
    with _lock:
        if _client is None:
            s = get_settings()
            _client = boto3.session.Session().client(
                "s3", region_name=s.aws_region,
                endpoint_url=f"https://s3.{s.aws_region}.amazonaws.com",
                config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
            )
        return _client


def reset_client() -> None:
    global _client
    with _lock:
        _client = None


def project_prefix(project_id: str) -> str:
    return f"{get_settings().dev_prefix}/projects/{project_id}"


def source_key(project_id: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower() or ".mp4"
    return f"{project_prefix(project_id)}/source{ext}"


def media_key(project_id: str, media_id: str) -> str:
    """Overlay media (layers). `media_id` must already match schema.MEDIA_ID_PATTERN — that is
    what keeps this a name under the project's prefix and never a path."""
    return f"{project_prefix(project_id)}/media/{media_id}"


def audio_key(project_id: str) -> str:
    return f"{project_prefix(project_id)}/audio.wav"


def s3_uri(key: str) -> str:
    return f"s3://{get_settings().s3_bucket}/{key}"


def presigned_upload(key: str, content_type: str) -> dict:
    s = get_settings()
    return client().generate_presigned_post(
        Bucket=s.s3_bucket, Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, s.max_upload_bytes]],
        ExpiresIn=UPLOAD_EXPIRES,
    )


def presigned_get(key: str) -> str:
    return client().generate_presigned_url(
        "get_object", Params={"Bucket": get_settings().s3_bucket, "Key": key}, ExpiresIn=PLAYBACK_EXPIRES)


def presigned_download(key: str, filename: str) -> str:
    """A presigned GET that makes the browser SAVE the file instead of playing it.

    A plain link to S3 is cross-origin, and browsers ignore the `download` attribute on cross-origin links,
    so "Download" would just open the video in a tab. Sending `Content-Disposition: attachment` from S3
    itself is the only thing that reliably triggers a save.
    """
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in filename)[:120] or "video.mp4"
    return client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().s3_bucket, "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{safe}"',
                "ResponseContentType": "video/mp4"},
        ExpiresIn=PLAYBACK_EXPIRES,
    )


def exists(key: str) -> bool:
    try:
        client().head_object(Bucket=get_settings().s3_bucket, Key=key)
        return True
    except client().exceptions.ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def download(key: str, path: str) -> None:
    client().download_file(get_settings().s3_bucket, key, path)


def upload(path: str, key: str, content_type: str) -> None:
    client().upload_file(path, get_settings().s3_bucket, key, ExtraArgs={"ContentType": content_type})
