"""The real analyze_frame handler.

Implements the approved architecture's vision pipeline exactly as decided in
root CLAUDE.md's Stack section — "Vision: ffmpeg frame grab -> Rekognition
DetectLabels (fallback: Claude vision on Bedrock)" — nothing invented beyond
that. The Bedrock-vision fallback is NOT implemented; see the Phase 5 audit.

Media location (revised): the earlier version of this module accepted only an
`s3://` videoUrl and blamed the fixtures for the failure. That diagnosis was
wrong. `routers/projects.py::_project_body` — the one door every Project
leaves the API through — replaces `videoUrl` with a *fresh presigned GET*
("videoUrl is a fresh presigned GET, never s3://"), so the Project the editor
holds, and therefore the Project the agent is handed, carries an `https://`
URL. `analyze_frame` used to fail 100% of the time on real projects for that
reason, not because of a missing P1 integration.

`_resolve_media_location` now accepts, in priority order:
  1. `https://` / `http://` — a presigned GET (the real, normal case).
  2. `s3://bucket/key` — kept working; turned into a presigned GET with
     `app.s3`'s already-configured SigV4 regional client, so it joins the
     same single read path rather than needing a second one. (That client is
     pinned to the configured region's endpoint, which is the only bucket
     this service ever deals with.)
  3. A local filesystem path (optionally `file://`-prefixed) that really
     exists — how the clips under `services/api/scripts/stt_bakeoff/clips/`
     are exercised, and how anything mounted into the container is read.
Anything else — a bare filename like "demo.mp4", which is what the fixtures
carry — still raises a `ToolExecutionError` naming the actual value.

No whole-video download: ffmpeg seeks the remote URL directly (input `-ss`
before `-i`, so HTTP range requests fetch only what the seek needs), and the
subprocess is bounded by `FRAME_GRAB_TIMEOUT_SEC`.

Reuse: the ffmpeg subprocess goes through `app.media._run` — the same wrapper
the audio stage uses — so there is exactly one way this repo shells out to
ffmpeg (list args, never `shell=True`; `-nostdin -v error -y`; a timeout;
stderr tail in the raised error). S3 access goes through `app.s3.client()`
rather than a second ad-hoc boto3 client.

Testability: `_grab_frame_bytes` and `_detect_labels` are real ffmpeg/boto3
calls with no faking in production. `analyze_frame` accepts them as
keyword-only, dependency-injected parameters (defaulting to the real
implementations) so tests can substitute doubles at the external I/O boundary
without test-only branches in production code.
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from app.media import MediaError, _run as run_ffmpeg
from app.schema import Project

from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import AnalyzeFrameArgs, AnalyzeFrameResult, BoundingBox

AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")

# One remote seek + one frame decode. Generous enough for a cold S3 range
# request on a slow link, short enough that a wedged ffmpeg cannot hold an
# agent turn open indefinitely.
FRAME_GRAB_TIMEOUT_SEC = 60

# How long the presigned URL minted for an `s3://` videoUrl stays valid. It
# is consumed by the ffmpeg process started microseconds later and never
# handed to anyone.
_S3_PRESIGN_EXPIRES = 300

_HTTP_SCHEMES = ("https://", "http://")

# Rekognition DetectLabels' "Person" label, with per-instance BoundingBox,
# is a well-established, reliable feature. A distinct, reliable "face"
# label with its own bounding boxes is NOT something DetectLabels alone
# guarantees (that's Rekognition's separate DetectFaces API, which root
# CLAUDE.md's Stack decision does not name and this module does not add).
# The approved architecture plan is also explicit that face recognition is
# out of scope ("no object tracking ..., no face recognition"). So
# target="face" is treated as "person" here, rather than inventing
# behavior for a label this pipeline was never decided to produce.
_TARGET_LABEL = "Person"


_URL_QUERY_RE = re.compile(r"(https?://[^\s?]+)\?\S*")


def _redact(text: str) -> str:
    """Drop the query string — a presigned URL's signature lives there — from
    every URL in `text`. Applied to the location AND to ffmpeg's stderr, which
    echoes the input URL verbatim on failure."""
    return _URL_QUERY_RE.sub(r"\1", text)


def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
    without_scheme = s3_uri[len("s3://") :]
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        raise ToolExecutionError(f"malformed s3 URI: {s3_uri!r}")
    return bucket, key


def _resolve_media_location(project: Project) -> str:
    """Return a location ffmpeg can read for `project.videoUrl`, or raise.

    Accepted, in priority order: an `https://`/`http://` URL (the presigned
    GET the API actually hands out), an `s3://bucket/key` URI, or an existing
    local filesystem path (`file://` accepted and stripped). The returned
    string is passed straight to `grab_frame`.
    """
    video_url = (project.videoUrl or "").strip()

    if video_url.startswith(_HTTP_SCHEMES):
        return video_url

    if video_url.startswith("s3://"):
        _parse_s3_uri(video_url)  # reject a malformed URI before any I/O
        return video_url

    local = video_url[len("file://") :] if video_url.startswith("file://") else video_url
    if local and Path(local).is_file():
        return str(Path(local).resolve())

    raise ToolExecutionError(
        "analyze_frame needs a video it can actually read: a presigned https:// URL "
        "(what the API hands the editor), an s3://bucket/key URI, or an existing local file. "
        f"This project's videoUrl is {video_url!r}, which is none of those — a bare filename "
        "is not resolvable from the backend. This must not be faked."
    )


def _ms_to_ffmpeg_seek(at_ms: int) -> str:
    return f"{at_ms / 1000:.3f}"


def _ffmpeg_input(location: str) -> str:
    """The string handed to ffmpeg's `-i`. Everything but `s3://` is already
    one; an `s3://` URI becomes a short-lived presigned GET, using `app.s3`'s
    configured client, so remote reads have a single code path."""
    if not location.startswith("s3://"):
        return location

    bucket, key = _parse_s3_uri(location)
    from app import s3 as s3_module  # local import: reading settings at import time would break host-side tests

    return s3_module.client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=_S3_PRESIGN_EXPIRES
    )


def _grab_frame_bytes(location: str, at_ms: int) -> bytes:
    """Real implementation: one ffmpeg run that seeks to `at_ms` and writes a
    single JPEG. For an http(s) source ffmpeg range-reads the remote file —
    the whole video is never downloaded. No fabricated bytes: a real ffmpeg
    process produces the frame, or this raises.
    """
    source = _ffmpeg_input(location)

    with tempfile.TemporaryDirectory() as tmp_dir:
        frame_path = Path(tmp_dir) / "frame.jpg"
        try:
            run_ffmpeg(
                [
                    "ffmpeg", "-nostdin", "-v", "error", "-y",
                    "-ss", _ms_to_ffmpeg_seek(at_ms),
                    "-i", source,
                    "-frames:v", "1",
                    "-f", "image2",
                    "-c:v", "mjpeg",
                    str(frame_path),
                ],
                timeout=FRAME_GRAB_TIMEOUT_SEC,
            )
        except MediaError as exc:
            raise ToolExecutionError(
                _redact(f"ffmpeg could not read a frame at {at_ms}ms from {location}: {exc}")
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ToolExecutionError(
                f"ffmpeg timed out after {FRAME_GRAB_TIMEOUT_SEC}s grabbing the frame at "
                f"{at_ms}ms from {_redact(location)}"
            ) from exc
        except FileNotFoundError as exc:
            raise ToolExecutionError(f"ffmpeg is not installed on this host: {exc}") from exc

        if not frame_path.is_file() or frame_path.stat().st_size == 0:
            raise ToolExecutionError(
                f"ffmpeg produced no frame at {at_ms}ms from {_redact(location)} "
                "(the timestamp may be past the end of the actual media)"
            )
        return frame_path.read_bytes()


def _detect_labels(frame_bytes: bytes) -> list[dict]:
    """Real implementation: Amazon Rekognition DetectLabels over the frame
    bytes. Returns the raw `Labels` list from the API response — no
    synthetic/fabricated labels."""
    import boto3

    client = boto3.client("rekognition", region_name=AWS_REGION)
    response = client.detect_labels(Image={"Bytes": frame_bytes}, MaxLabels=25, MinConfidence=55)
    return response.get("Labels", [])


FrameGrabber = Callable[[str, int], bytes]
LabelDetector = Callable[[bytes], list]


def _percent(fraction: float) -> float:
    """Rekognition boxes are fractions of the frame, and a box may run a hair
    past an edge (Left slightly negative, Top+Height slightly over 1). Clamp
    to the 0-100 range BoundingBox declares, so a real detection is usable
    instead of blowing up Pydantic validation."""
    return round(min(max(fraction, 0.0), 1.0) * 100, 2)


def analyze_frame(
    args: AnalyzeFrameArgs,
    project: Project,
    *,
    grab_frame: FrameGrabber = _grab_frame_bytes,
    detect_labels: LabelDetector = _detect_labels,
) -> AnalyzeFrameResult:
    """Grab the video frame at `args.atMs` and return normalized (0-100)
    bounding boxes for `args.target`.

    Raises ToolExecutionError if `args.atMs` is past the project's duration,
    if the project's videoUrl is not readable (see `_resolve_media_location`),
    or if frame extraction fails.

    `grab_frame`/`detect_labels` default to the real implementations above;
    they exist as parameters solely so tests can inject doubles at this
    module's I/O boundary — production callers should never pass anything
    else.
    """
    if args.atMs > project.durationMs:
        raise ToolExecutionError(
            f"atMs ({args.atMs}) is after the project's durationMs ({project.durationMs})"
        )

    location = _resolve_media_location(project)
    frame_bytes = grab_frame(location, args.atMs)
    labels = detect_labels(frame_bytes)

    boxes: list[BoundingBox] = []
    for label in labels:
        if label.get("Name") != _TARGET_LABEL:
            continue
        for instance in label.get("Instances", []):
            bounding_box = instance.get("BoundingBox")
            if not bounding_box:
                continue
            boxes.append(
                BoundingBox(
                    label=_TARGET_LABEL,
                    x=_percent(bounding_box["Left"]),
                    y=_percent(bounding_box["Top"]),
                    width=_percent(bounding_box["Width"]),
                    height=_percent(bounding_box["Height"]),
                )
            )

    return AnalyzeFrameResult(found=bool(boxes), boxes=boxes)


default_registry.register(
    ToolSpec(
        name="analyze_frame",
        description="Grab a video frame at a timestamp and return bounding boxes for a target (person/face).",
        input_model=AnalyzeFrameArgs,
        output_model=AnalyzeFrameResult,
        reads=True,
        writes=False,
        status=ToolStatus.AVAILABLE,
        notes=(
            "Real ffmpeg frame grab + real Rekognition DetectLabels. Reads the presigned https:// "
            "videoUrl the API hands the editor (no whole-video download — ffmpeg range-seeks the "
            "remote file), an s3:// URI, or a local file. A project whose videoUrl is a bare "
            "filename (the repo fixtures) still fails honestly rather than inventing a result."
        ),
    ),
    analyze_frame,
)
