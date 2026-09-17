"""Phase 5: the real analyze_frame handler.

Implements the approved architecture's vision pipeline exactly as decided in
root CLAUDE.md's Stack section — "Vision: ffmpeg frame grab -> Rekognition
DetectLabels (fallback: Claude vision on Bedrock)" — nothing invented beyond
that. The Bedrock-vision fallback is NOT implemented in this phase; see
"Deviations / Blockers" in the Phase 5 audit.

Media dependency: as of this phase, NO Project anywhere in this repo
(packages/shared/fixtures/*.json) has a backend-readable videoUrl — every
existing fixture's videoUrl is a bare filename ("demo.mp4", "Angry.mp4",
...), not an s3:// URI. This is not a bug in this module: it's the same P1
storage/upload dependency every prior phase's audit has already identified.
`analyze_frame` therefore ALWAYS fails honestly with a ToolExecutionError
against every Project currently in this repo — this is the intended,
correct behavior per this phase's explicit instruction to "fail honestly ...
rather than inventing a result," not a placeholder to be silently fixed
later.

Testability: `_grab_frame_bytes` and `_detect_labels` are real boto3/ffmpeg
calls with no faking in production. `analyze_frame` accepts them as
keyword-only, dependency-injected parameters (defaulting to the real
implementations) specifically so tests can substitute doubles for the
external I/O boundary without touching this module's real code path or
requiring AWS credentials — per this phase's instruction that test doubles
belong only in tests, never in production code.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from app.schema import Project

from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import AnalyzeFrameArgs, AnalyzeFrameResult, BoundingBox

AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")

# Rekognition DetectLabels' "Person" label, with per-instance BoundingBox,
# is a well-established, reliable feature. A distinct, reliable "face"
# label with its own bounding boxes is NOT something DetectLabels alone
# guarantees (that's Rekognition's separate DetectFaces API, which root
# CLAUDE.md's Stack decision does not name and this phase does not add).
# The approved architecture plan is also explicit that face recognition is
# out of scope ("no object tracking ..., no face recognition"). So
# target="face" is treated as "person" here, rather than inventing
# behavior for a label this pipeline was never decided to produce.
_TARGET_LABEL = "Person"


def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
    without_scheme = s3_uri[len("s3://") :]
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        raise ToolExecutionError(f"malformed s3 URI: {s3_uri!r}")
    return bucket, key


def _resolve_media_location(project: Project) -> str:
    """Return a backend-readable (s3://) location for `project.videoUrl`,
    or raise ToolExecutionError. This is the honest-failure boundary this
    phase's requirements call for: no existing Project has one yet, so this
    always raises against real repo data today — see the module docstring.
    """
    video_url = project.videoUrl
    if not video_url.startswith("s3://"):
        raise ToolExecutionError(
            "analyze_frame requires a backend-readable video location (an s3:// URI); "
            f"this project's videoUrl is {video_url!r}. No video upload/storage integration "
            "exists yet for this project (P1 dependency) — this is not something analyze_frame "
            "itself can work around, and it must not be faked."
        )
    return video_url


def _ms_to_ffmpeg_seek(at_ms: int) -> str:
    return f"{at_ms / 1000:.3f}"


def _grab_frame_bytes(s3_uri: str, at_ms: int) -> bytes:
    """Real implementation: download the video from S3, then use ffmpeg to
    extract a single JPEG frame at `at_ms`. No fabricated bytes — a real
    ffmpeg process runs against a real downloaded file, or this raises.
    """
    import boto3

    bucket, key = _parse_s3_uri(s3_uri)

    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = Path(tmp_dir) / "source"
        frame_path = Path(tmp_dir) / "frame.jpg"

        boto3.client("s3", region_name=AWS_REGION).download_file(bucket, key, str(video_path))

        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", _ms_to_ffmpeg_seek(at_ms),
                    "-i", str(video_path),
                    "-frames:v", "1",
                    str(frame_path),
                ],
                check=True,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            raise ToolExecutionError(f"ffmpeg frame extraction failed: {exc}") from exc

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


def analyze_frame(
    args: AnalyzeFrameArgs,
    project: Project,
    *,
    grab_frame: FrameGrabber = _grab_frame_bytes,
    detect_labels: LabelDetector = _detect_labels,
) -> AnalyzeFrameResult:
    """Grab the video frame at `args.atMs` and return normalized (0-100)
    bounding boxes for `args.target`.

    Raises ToolExecutionError if `args.atMs` is past the project's actual
    duration, if the project has no backend-readable video location yet
    (see `_resolve_media_location`), or if frame extraction fails.

    `grab_frame`/`detect_labels` default to the real implementations above;
    they exist as parameters solely so tests can inject doubles at this
    module's I/O boundary — production callers should never pass anything
    else.
    """
    if args.atMs > project.durationMs:
        raise ToolExecutionError(f"atMs ({args.atMs}) is after the project's durationMs ({project.durationMs})")

    s3_uri = _resolve_media_location(project)
    frame_bytes = grab_frame(s3_uri, args.atMs)
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
                    x=round(bounding_box["Left"] * 100, 2),
                    y=round(bounding_box["Top"] * 100, 2),
                    width=round(bounding_box["Width"] * 100, 2),
                    height=round(bounding_box["Height"] * 100, 2),
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
            "Implemented in Phase 5, but practically unusable until P1 wires real video storage: "
            "every current Project's videoUrl is a bare filename, not an s3:// URI, so this tool "
            "raises ToolExecutionError against all of them today. This is a real implementation "
            "of a currently-unreachable path, not a stub — see the Phase 5 audit."
        ),
    ),
    analyze_frame,
)
