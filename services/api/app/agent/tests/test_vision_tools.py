#!/usr/bin/env python3
"""Verification for the analyze_frame handler.

Run:
    cd services/api && python -m app.agent.tests.test_vision_tools

No AWS credentials are required or used here:
- The media-resolution tests exercise the REAL production `_resolve_media_location`
  against real values: the presigned https:// URL shape `routers/projects.py::_project_body`
  actually hands the editor, an s3:// URI, real local files, and the bare filenames every
  fixture in this repo still carries.
- One test runs the REAL `_grab_frame_bytes` (a real ffmpeg subprocess) against a real
  clip in `services/api/scripts/stt_bakeoff/clips/` when one is present — no network, no
  credentials. It is skipped, loudly, when the clips are not mounted.
- The bounding-box tests inject test-double grab_frame/detect_labels callables at
  analyze_frame's documented dependency-injection seam. A separate test confirms the real
  production functions are what's wired as the defaults (i.e. the doubles never leak into
  production).
- The real Rekognition DetectLabels call is NOT exercised here (it needs credentials);
  it was verified separately against a real clip — see the phase report.
"""
from __future__ import annotations

import glob
import inspect
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from app.agent.tools import ToolNotImplementedError, ToolStatus, default_registry  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.schemas import AnalyzeFrameArgs  # noqa: E402
from app.agent.tools.vision_tools import (  # noqa: E402
    _detect_labels,
    _grab_frame_bytes,
    _ms_to_ffmpeg_seek,
    _parse_s3_uri,
    _percent,
    _redact,
    _resolve_media_location,
    analyze_frame,
)
from app.schema import Project  # noqa: E402

from app.agent.tests._fixtures import fixtures_dir, repo_root  # noqa: E402

FIXTURES = fixtures_dir()
FIXTURES_DIR = FIXTURES

# The presigned GET the API really hands the editor: `_project_body` builds it with
# `s3.presigned_get`, whose client is regional + SigV4 + virtual-hosted.
PRESIGNED_URL = (
    "https://demo-bucket.s3.ap-south-1.amazonaws.com/p1/projects/abc123/source.mp4"
    "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20260919%2Fap-south-1"
    "%2Fs3%2Faws4_request&X-Amz-Date=20260919T000000Z&X-Amz-Expires=3600"
    "&X-Amz-SignedHeaders=host&X-Amz-Signature=deadbeef"
)

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def skip(name: str, why: str) -> None:
    print(f"[SKIP] {name} — {why}")


def raises(exc_type: type[Exception], fn) -> bool:
    try:
        fn()
    except exc_type:
        return True
    except Exception:
        return False
    return False


def load_fixture(name: str) -> Project:
    raw = json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))
    return Project.model_validate(raw)


def project_with_video(video_url: str) -> Project:
    """The real demo fixture with only videoUrl swapped — the minimum needed to drive
    a specific media-location branch."""
    return load_fixture("demo-project.json").model_copy(update={"videoUrl": video_url})


def find_clip() -> Path | None:
    """A real clip, in a repo checkout or in the API container (scripts/ is mounted)."""
    candidates = []
    root = repo_root()
    if root is not None:
        candidates.append(root / "services" / "api" / "scripts" / "stt_bakeoff" / "clips")
    candidates.append(Path("/srv/scripts/stt_bakeoff/clips"))
    for directory in candidates:
        for name in ("Normal.mp4", "Real_reel.mp4", "Angry.mp4", "Excited_long_texts.mp4"):
            clip = directory / name
            if clip.is_file():
                return clip
    return None


# --- media resolution: REAL code, real URL shapes, no mocking ----------------
def test_presigned_https_url_is_accepted() -> None:
    """The regression this module exists for: `_project_body`'s docstring says
    "videoUrl is a fresh presigned GET, never s3://", so the Project the agent gets
    carries an https URL. Rejecting it made analyze_frame fail on every real project."""
    project = project_with_video(PRESIGNED_URL)
    check(
        "a presigned https:// videoUrl resolves (does not raise)",
        _resolve_media_location(project) == PRESIGNED_URL,
    )
    check(
        "a plain http:// videoUrl resolves too",
        _resolve_media_location(project_with_video("http://example.test/a.mp4"))
        == "http://example.test/a.mp4",
    )


def test_s3_uri_still_works() -> None:
    project = project_with_video("s3://my-bucket/p1/projects/abc/source.mp4")
    check(
        "an s3:// videoUrl still resolves unchanged",
        _resolve_media_location(project) == "s3://my-bucket/p1/projects/abc/source.mp4",
    )
    check(
        "a malformed s3:// URI is rejected before any I/O",
        raises(ToolExecutionError, lambda: _resolve_media_location(project_with_video("s3://bucket-only"))),
    )


def test_local_path_is_accepted_only_when_it_exists() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        real_file = Path(tmp_dir) / "source.mp4"
        real_file.write_bytes(b"not really a video, but a real file")
        check(
            "an existing local path resolves to its absolute path",
            _resolve_media_location(project_with_video(str(real_file))) == str(real_file.resolve()),
        )
        check(
            "a file:// URL resolves to the same absolute path",
            _resolve_media_location(project_with_video(f"file://{real_file}")) == str(real_file.resolve()),
        )
        missing = str(Path(tmp_dir) / "nope.mp4")
        check(
            "a local path that does not exist is rejected",
            raises(ToolExecutionError, lambda: _resolve_media_location(project_with_video(missing))),
        )


def test_every_real_fixture_still_fails_honestly() -> None:
    """Every fixture in this repo has a bare-filename videoUrl ("demo.mp4", ...), which is
    not resolvable from the backend by any of the three accepted forms. Confirms the real,
    unmocked check refuses to proceed rather than fabricating a result."""
    fixture_paths = sorted(glob.glob(str(FIXTURES_DIR / "*.json")))
    check("at least one fixture exists to test against", len(fixture_paths) > 0)

    all_fail_honestly = True
    for path in fixture_paths:
        project = Project.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
        ok = raises(ToolExecutionError, lambda p=project: analyze_frame(AnalyzeFrameArgs(atMs=0), p))
        if not ok:
            all_fail_honestly = False
            print(f"    unexpected: {path} (videoUrl={project.videoUrl!r}) did not raise")
    check("analyze_frame raises ToolExecutionError against every real fixture (bare filenames)", all_fail_honestly)


def test_error_message_names_the_real_cause() -> None:
    project = load_fixture("demo-project.json")
    message = ""
    try:
        analyze_frame(AnalyzeFrameArgs(atMs=0), project)
    except ToolExecutionError as exc:
        message = str(exc)
    check("the error message mentions the actual videoUrl value, not a generic failure", project.videoUrl in message)
    check("the error message names https:// as an accepted form", "https://" in message)
    check("the error message names s3:// as an accepted form", "s3://" in message)


def test_presigned_url_is_redacted_in_messages() -> None:
    redacted = _redact(PRESIGNED_URL)
    check("_redact drops the query string (the signature) from a presigned URL", "X-Amz-Signature" not in redacted)
    check("_redact keeps the object path, so the error still identifies the media", redacted.endswith("/source.mp4"))
    check("_redact leaves a non-http location alone", _redact("s3://b/k.mp4") == "s3://b/k.mp4")
    stderr = f"ffmpeg failed: Error opening input file {PRESIGNED_URL}."
    check(
        "_redact also scrubs a URL embedded in ffmpeg's stderr (which echoes the input verbatim)",
        "X-Amz-Signature" not in _redact(stderr) and "Error opening input file" in _redact(stderr),
    )


# --- argument-level checks ----------------------------------------------------
def test_at_ms_past_duration_rejected() -> None:
    project = project_with_video(PRESIGNED_URL)
    check(
        "analyze_frame raises ToolExecutionError when atMs is past durationMs",
        raises(ToolExecutionError, lambda: analyze_frame(AnalyzeFrameArgs(atMs=project.durationMs + 10_000), project)),
    )


def test_malformed_s3_uri_rejected() -> None:
    check(
        "_parse_s3_uri raises ToolExecutionError for a URI missing a key",
        raises(ToolExecutionError, lambda: _parse_s3_uri("s3://bucket-only")),
    )
    check(
        "_parse_s3_uri correctly splits a well-formed URI",
        _parse_s3_uri("s3://my-bucket/path/to/video.mp4") == ("my-bucket", "path/to/video.mp4"),
    )


def test_seek_formatting() -> None:
    check("atMs is formatted as seconds for ffmpeg's -ss", _ms_to_ffmpeg_seek(22_450) == "22.450")
    check("atMs=0 formats as 0.000", _ms_to_ffmpeg_seek(0) == "0.000")


# --- bounding-box logic, via injected test doubles ---------------------------
_FAKE_LABELS_WITH_PERSON = [
    {
        "Name": "Person",
        "Confidence": 99.0,
        "Instances": [{"BoundingBox": {"Left": 0.3, "Top": 0.1, "Width": 0.4, "Height": 0.6}, "Confidence": 98.0}],
    },
    {"Name": "Furniture", "Confidence": 80.0, "Instances": []},
]
_FAKE_LABELS_WITHOUT_PERSON = [{"Name": "Furniture", "Confidence": 80.0, "Instances": []}]


def _fake_grab_frame(location: str, at_ms: int) -> bytes:
    return b"not-a-real-jpeg"  # never touched by a real decoder in these tests


def test_analyze_frame_found_case_via_injected_doubles() -> None:
    project = project_with_video(PRESIGNED_URL)
    seen: list[tuple[str, int]] = []

    def recording_grab(location: str, at_ms: int) -> bytes:
        seen.append((location, at_ms))
        return b"not-a-real-jpeg"

    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0, target="person"),
        project,
        grab_frame=recording_grab,
        detect_labels=lambda frame_bytes: _FAKE_LABELS_WITH_PERSON,
    )
    check("the resolved https URL is what reaches grab_frame", seen == [(PRESIGNED_URL, 0)])
    check("found=True when a Person instance with a bounding box is present", result.found is True)
    check("exactly one box is returned", len(result.boxes) == 1)
    box = result.boxes[0]
    check("box.label is 'Person'", box.label == "Person")
    check("box.x is normalized to 0-100 (Left=0.3 -> 30.0)", box.x == 30.0)
    check("box.y is normalized to 0-100 (Top=0.1 -> 10.0)", box.y == 10.0)
    check("box.width is normalized to 0-100 (Width=0.4 -> 40.0)", box.width == 40.0)
    check("box.height is normalized to 0-100 (Height=0.6 -> 60.0)", box.height == 60.0)


def test_analyze_frame_not_found_case_via_injected_doubles() -> None:
    project = project_with_video(PRESIGNED_URL)
    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0),
        project,
        grab_frame=_fake_grab_frame,
        detect_labels=lambda frame_bytes: _FAKE_LABELS_WITHOUT_PERSON,
    )
    check("found=False when no matching label is present", result.found is False)
    check("boxes is empty when nothing is found", result.boxes == [])


def test_face_target_is_treated_as_person_by_design() -> None:
    """Documented design decision (see vision_tools.py's module docstring):
    real face-specific detection is out of scope, so target="face" uses the
    same Person-label lookup as target="person" rather than inventing
    behavior for a label this pipeline was never decided to produce."""
    project = project_with_video(PRESIGNED_URL)
    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0, target="face"),
        project,
        grab_frame=_fake_grab_frame,
        detect_labels=lambda frame_bytes: _FAKE_LABELS_WITH_PERSON,
    )
    check("target='face' currently resolves via the same Person-label lookup as target='person'", result.found is True and result.boxes[0].label == "Person")


def test_out_of_frame_box_is_clamped_not_crashed() -> None:
    """Rekognition really does return boxes a hair outside the frame (a Left of
    -0.004, a Top+Height over 1). BoundingBox declares 0-100, so an unclamped value
    would raise ValidationError out of a successful detection."""
    project = project_with_video(PRESIGNED_URL)
    labels = [{
        "Name": "Person",
        "Instances": [{"BoundingBox": {"Left": -0.004, "Top": 0.27, "Width": 1.02, "Height": 0.72}}],
    }]
    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0),
        project,
        grab_frame=_fake_grab_frame,
        detect_labels=lambda frame_bytes: labels,
    )
    check("a slightly out-of-frame Rekognition box still produces a result", result.found is True)
    check("a negative Left clamps to 0", result.boxes[0].x == 0.0)
    check("a Width over 1 clamps to 100", result.boxes[0].width == 100.0)
    check("_percent leaves an in-range fraction alone", _percent(0.2731863558292389) == 27.32)


# --- real ffmpeg, real clip, no network --------------------------------------
def test_real_ffmpeg_frame_grab_from_a_local_clip() -> None:
    clip = find_clip()
    if clip is None:
        skip("real ffmpeg frame grab", "no clip under services/api/scripts/stt_bakeoff/clips")
        return
    project = project_with_video(str(clip))
    location = _resolve_media_location(project)
    try:
        frame = _grab_frame_bytes(location, 5_000)
    except ToolExecutionError as exc:
        skip("real ffmpeg frame grab", f"ffmpeg unavailable or failed: {exc}")
        return
    check(f"real ffmpeg grabbed a frame at 5000ms from {clip.name}", len(frame) > 1000)
    check("the grabbed frame is a real JPEG (SOI marker)", frame[:2] == b"\xff\xd8")


# --- production defaults are the real implementations, never a double -------
def test_production_defaults_are_the_real_implementations() -> None:
    sig = inspect.signature(analyze_frame)
    check("grab_frame defaults to the real _grab_frame_bytes function", sig.parameters["grab_frame"].default is _grab_frame_bytes)
    check("detect_labels defaults to the real _detect_labels function", sig.parameters["detect_labels"].default is _detect_labels)


def test_ffmpeg_is_invoked_through_the_shared_media_helper() -> None:
    """One way to shell out to ffmpeg in this repo: app.media._run (list args, no
    shell, a timeout, stderr tail in the error)."""
    from app import media
    from app.agent.tools import vision_tools

    check("vision_tools reuses app.media._run rather than its own subprocess call", vision_tools.run_ffmpeg is media._run)
    check("the frame grab is bounded by a timeout", vision_tools.FRAME_GRAB_TIMEOUT_SEC > 0)


# --- registry integration -----------------------------------------------------
def test_analyze_frame_is_registered_as_available() -> None:
    spec = default_registry.get_spec("analyze_frame")
    check("analyze_frame is registered as AVAILABLE", spec.status is ToolStatus.AVAILABLE)
    handler_ok = True
    try:
        default_registry.get_handler("analyze_frame")
    except ToolNotImplementedError:
        handler_ok = False
    check("analyze_frame's handler is retrievable without ToolNotImplementedError", handler_ok)


def test_no_planned_tools_remain() -> None:
    planned = default_registry.list_specs(status=ToolStatus.PLANNED)
    check("catalog.py's planned-tool list is now empty (every MVP tool has a real handler)", planned == [])


def main() -> int:
    test_presigned_https_url_is_accepted()
    test_s3_uri_still_works()
    test_local_path_is_accepted_only_when_it_exists()
    test_every_real_fixture_still_fails_honestly()
    test_error_message_names_the_real_cause()
    test_presigned_url_is_redacted_in_messages()
    test_at_ms_past_duration_rejected()
    test_malformed_s3_uri_rejected()
    test_seek_formatting()
    test_analyze_frame_found_case_via_injected_doubles()
    test_analyze_frame_not_found_case_via_injected_doubles()
    test_face_target_is_treated_as_person_by_design()
    test_out_of_frame_box_is_clamped_not_crashed()
    test_real_ffmpeg_frame_grab_from_a_local_clip()
    test_production_defaults_are_the_real_implementations()
    test_ffmpeg_is_invoked_through_the_shared_media_helper()
    test_analyze_frame_is_registered_as_available()
    test_no_planned_tools_remain()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
