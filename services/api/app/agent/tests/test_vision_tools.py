#!/usr/bin/env python3
"""Phase 5 verification: the analyze_frame handler.

Run:
    cd services/api && python -m app.agent.tests.test_vision_tools

No AWS credentials and no ffmpeg execution are required or performed here:
- The "media unavailable" tests exercise the REAL production code path
  (_resolve_media_location) against every real fixture in this repo, none
  of which has a backend-readable videoUrl — no mocking needed, because
  that's the actual, current state of every Project in this repo.
- The "found"/"not found" bounding-box tests inject test-double
  grab_frame/detect_labels callables at analyze_frame's documented
  dependency-injection seam, per this phase's explicit instruction that
  test doubles belong only in tests, never in production code. A separate
  test confirms the real production functions are what's actually wired as
  the function's defaults (i.e. the doubles never leak into production).
"""
from __future__ import annotations

import glob
import inspect
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from app.agent.tools import ToolNotImplementedError, ToolStatus, default_registry  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.schemas import AnalyzeFrameArgs  # noqa: E402
from app.agent.tools.vision_tools import (  # noqa: E402
    _detect_labels,
    _grab_frame_bytes,
    _parse_s3_uri,
    analyze_frame,
)
from app.schema import Project  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[5]
FIXTURES_DIR = REPO_ROOT / "packages" / "shared" / "fixtures"

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


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


def demo_project_with_s3_video() -> Project:
    """A copy of the real demo fixture with only videoUrl swapped for a
    syntactically-valid (but not real) s3:// URI — the minimum needed to
    pass `_resolve_media_location` so the bounding-box logic downstream of
    it can be exercised via injected doubles."""
    project = load_fixture("demo-project.json")
    return project.model_copy(update={"videoUrl": "s3://fake-bucket/fake-key.mp4"})


# --- media-unavailable path: REAL code, REAL fixtures, no mocking -----------
def test_every_real_fixture_fails_honestly_with_no_backend_video() -> None:
    """Every fixture in this repo has a bare-filename videoUrl today (e.g.
    "demo.mp4") — not an s3:// URI. This confirms analyze_frame's real,
    unmocked media-availability check correctly refuses to proceed against
    every one of them, rather than fabricating a result."""
    fixture_paths = sorted(glob.glob(str(FIXTURES_DIR / "*.json")))
    check("at least one fixture exists to test against", len(fixture_paths) > 0)

    all_fail_honestly = True
    for path in fixture_paths:
        project = Project.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
        ok = raises(ToolExecutionError, lambda p=project: analyze_frame(AnalyzeFrameArgs(atMs=0), p))
        if not ok:
            all_fail_honestly = False
            print(f"    unexpected: {path} (videoUrl={project.videoUrl!r}) did not raise")
    check("analyze_frame raises ToolExecutionError against every real fixture (none has an s3:// videoUrl)", all_fail_honestly)


def test_error_message_names_the_real_cause() -> None:
    project = load_fixture("demo-project.json")
    message = ""
    try:
        analyze_frame(AnalyzeFrameArgs(atMs=0), project)
    except ToolExecutionError as exc:
        message = str(exc)
    check("the error message mentions the actual videoUrl value, not a generic failure", project.videoUrl in message)
    check("the error message mentions s3, the actual requirement", "s3://" in message)


# --- argument-level checks ----------------------------------------------------
def test_at_ms_past_duration_rejected() -> None:
    project = demo_project_with_s3_video()
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


def _fake_grab_frame(s3_uri: str, at_ms: int) -> bytes:
    return b"not-a-real-jpeg"  # never touched by a real decoder in these tests


def test_analyze_frame_found_case_via_injected_doubles() -> None:
    project = demo_project_with_s3_video()
    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0, target="person"),
        project,
        grab_frame=_fake_grab_frame,
        detect_labels=lambda frame_bytes: _FAKE_LABELS_WITH_PERSON,
    )
    check("found=True when a Person instance with a bounding box is present", result.found is True)
    check("exactly one box is returned", len(result.boxes) == 1)
    box = result.boxes[0]
    check("box.label is 'Person'", box.label == "Person")
    check("box.x is normalized to 0-100 (Left=0.3 -> 30.0)", box.x == 30.0)
    check("box.y is normalized to 0-100 (Top=0.1 -> 10.0)", box.y == 10.0)
    check("box.width is normalized to 0-100 (Width=0.4 -> 40.0)", box.width == 40.0)
    check("box.height is normalized to 0-100 (Height=0.6 -> 60.0)", box.height == 60.0)


def test_analyze_frame_not_found_case_via_injected_doubles() -> None:
    project = demo_project_with_s3_video()
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
    project = demo_project_with_s3_video()
    result = analyze_frame(
        AnalyzeFrameArgs(atMs=0, target="face"),
        project,
        grab_frame=_fake_grab_frame,
        detect_labels=lambda frame_bytes: _FAKE_LABELS_WITH_PERSON,
    )
    check("target='face' currently resolves via the same Person-label lookup as target='person'", result.found is True and result.boxes[0].label == "Person")


# --- production defaults are the real implementations, never a double -------
def test_production_defaults_are_the_real_implementations() -> None:
    sig = inspect.signature(analyze_frame)
    check("grab_frame defaults to the real _grab_frame_bytes function", sig.parameters["grab_frame"].default is _grab_frame_bytes)
    check("detect_labels defaults to the real _detect_labels function", sig.parameters["detect_labels"].default is _detect_labels)


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
    test_every_real_fixture_fails_honestly_with_no_backend_video()
    test_error_message_names_the_real_cause()
    test_at_ms_past_duration_rejected()
    test_malformed_s3_uri_rejected()
    test_analyze_frame_found_case_via_injected_doubles()
    test_analyze_frame_not_found_case_via_injected_doubles()
    test_face_target_is_treated_as_person_by_design()
    test_production_defaults_are_the_real_implementations()
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
