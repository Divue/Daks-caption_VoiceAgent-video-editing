#!/usr/bin/env python3
"""Phase 4 verification: the five mutation tool handlers.

Run:
    cd services/api && python -m app.agent.tests.test_mutation_tools

No AWS credentials, no network calls — every handler here only reads/
validates against a Project already loaded from a local fixture, and never
mutates it (checked explicitly below for every failure case).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from pydantic import ValidationError  # noqa: E402

from app.agent.contracts import UpdateWordAction, WordPatch  # noqa: E402
from app.agent.tools import ToolNotImplementedError, ToolStatus, default_registry  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.project_tools import add_overlay, apply_preset  # noqa: E402
from app.agent.tools.schemas import (  # noqa: E402
    AddOverlayArgs,
    ApplyPresetArgs,
    MoveCaptionArgs,
    ScaleCaptionArgs,
    UpdateCaptionStyleArgs,
)
from app.agent.tools.style_tools import move_caption, scale_caption, update_caption_style  # noqa: E402
from app.agent.validation import PatchError, apply_patch  # noqa: E402
from app.schema import Project, StylePatch  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[5] / "packages" / "shared" / "fixtures"
DEMO_PROJECT = FIXTURES / "demo-project.json"

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


def load_demo_project() -> Project:
    raw = json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))
    return Project.model_validate(raw)


def snapshot(project: Project) -> dict:
    return project.model_dump(mode="json")


# --- update_caption_style -----------------------------------------------------
def test_update_caption_style_valid(project: Project) -> None:
    target = project.words[0]
    args = UpdateCaptionStyleArgs(wordId=target.id, patch=StylePatch(color="#FFE600", glow=5))
    result = update_caption_style(args, project)

    check("update_caption_style returns an UPDATE_WORD patch", result.patch.type == "UPDATE_WORD")
    check("patch targets the requested wordId", result.patch.wordId == target.id)
    check("patch carries the requested color", result.patch.patch.style.color == "#FFE600")
    check("patch carries the requested glow", result.patch.patch.style.glow == 5)
    check("patch does not set unrelated style fields", result.patch.patch.style.fontSize is None)


def test_update_caption_style_unknown_word_id(project: Project) -> None:
    before = snapshot(project)
    args = UpdateCaptionStyleArgs(wordId="does-not-exist", patch=StylePatch(color="#fff"))
    check(
        "update_caption_style raises ToolExecutionError for an unknown wordId",
        raises(ToolExecutionError, lambda: update_caption_style(args, project)),
    )
    check("project is unchanged after the failure", snapshot(project) == before)


def test_update_caption_style_rejects_out_of_range_values_at_construction() -> None:
    check(
        "StylePatch(weight=50) is rejected at construction (schema requires 100-900)",
        raises(ValidationError, lambda: StylePatch(weight=50)),
    )
    check(
        "StylePatch(fontSize=-1) is rejected at construction (schema requires > 0)",
        raises(ValidationError, lambda: StylePatch(fontSize=-1)),
    )


# --- move_caption --------------------------------------------------------------
def test_move_caption_valid(project: Project) -> None:
    target = project.words[0]
    result = move_caption(MoveCaptionArgs(wordId=target.id, x=10, y=90), project)
    check("move_caption returns an UPDATE_WORD patch", result.patch.type == "UPDATE_WORD")
    check("move_caption sets x", result.patch.patch.style.x == 10)
    check("move_caption sets y", result.patch.patch.style.y == 90)
    check("move_caption does not set fontSize/color", result.patch.patch.style.fontSize is None and result.patch.patch.style.color is None)


def test_move_caption_unknown_word_id(project: Project) -> None:
    before = snapshot(project)
    check(
        "move_caption raises ToolExecutionError for an unknown wordId",
        raises(ToolExecutionError, lambda: move_caption(MoveCaptionArgs(wordId="nope", x=0, y=0), project)),
    )
    check("project is unchanged after the failure", snapshot(project) == before)


def test_move_caption_rejects_out_of_range_position_at_construction() -> None:
    check(
        "MoveCaptionArgs rejects x > 100 at construction",
        raises(ValidationError, lambda: MoveCaptionArgs(wordId="w1", x=150, y=0)),
    )
    check(
        "MoveCaptionArgs rejects negative y at construction",
        raises(ValidationError, lambda: MoveCaptionArgs(wordId="w1", x=0, y=-5)),
    )


# --- scale_caption --------------------------------------------------------------
def test_scale_caption_valid(project: Project) -> None:
    target = project.words[0]
    result = scale_caption(ScaleCaptionArgs(wordId=target.id, fontSize=120), project)
    check("scale_caption returns an UPDATE_WORD patch", result.patch.type == "UPDATE_WORD")
    check("scale_caption sets fontSize", result.patch.patch.style.fontSize == 120)
    check("scale_caption does not set x/y/color", result.patch.patch.style.x is None and result.patch.patch.style.color is None)


def test_scale_caption_unknown_word_id(project: Project) -> None:
    before = snapshot(project)
    check(
        "scale_caption raises ToolExecutionError for an unknown wordId",
        raises(ToolExecutionError, lambda: scale_caption(ScaleCaptionArgs(wordId="nope", fontSize=50), project)),
    )
    check("project is unchanged after the failure", snapshot(project) == before)


def test_scale_caption_rejects_non_positive_size_at_construction() -> None:
    check(
        "ScaleCaptionArgs rejects fontSize=0 at construction",
        raises(ValidationError, lambda: ScaleCaptionArgs(wordId="w1", fontSize=0)),
    )


# --- apply_preset -----------------------------------------------------------
def test_apply_preset_valid(project: Project) -> None:
    other = "minimal" if project.presetId != "minimal" else "mrbeast"
    result = apply_preset(ApplyPresetArgs(presetId=other), project)
    check("apply_preset returns a SET_PRESET patch", result.patch.type == "SET_PRESET")
    check("patch carries the requested presetId", result.patch.presetId == other)


def test_apply_preset_rejects_unknown_preset_at_construction(project: Project) -> None:
    before = snapshot(project)
    check(
        "ApplyPresetArgs rejects an unknown presetId at construction",
        raises(ValidationError, lambda: ApplyPresetArgs(presetId="not-a-real-preset")),
    )
    check("project is unchanged (construction never even reached the handler)", snapshot(project) == before)


# --- add_overlay -------------------------------------------------------------
def test_add_overlay_valid(project: Project) -> None:
    before_count = len(project.overlays)
    args = AddOverlayArgs(
        text="hi", startMs=0, endMs=1000, x=50, y=50,
        style=StylePatch(fontFamily="Inter", fontSize=40, color="#fff", weight=400),
    )
    result = add_overlay(args, project)
    check("add_overlay returns an ADD_OVERLAY patch", result.patch.type == "ADD_OVERLAY")
    check("patch carries the requested text", result.patch.overlay.text == "hi")
    check("patch carries the requested time range", (result.patch.overlay.startMs, result.patch.overlay.endMs) == (0, 1000))
    check("patch overlay has a generated, non-empty id", bool(result.patch.overlay.id))
    check("original project's overlay count is untouched by building the patch", len(project.overlays) == before_count)


def test_add_overlay_inverted_time_range(project: Project) -> None:
    before = snapshot(project)
    args = AddOverlayArgs(text="x", startMs=1000, endMs=500, x=50, y=50, style=StylePatch())
    check(
        "add_overlay raises ToolExecutionError when startMs >= endMs",
        raises(ToolExecutionError, lambda: add_overlay(args, project)),
    )
    check("project is unchanged after the failure", snapshot(project) == before)


def test_add_overlay_exceeds_project_duration(project: Project) -> None:
    before = snapshot(project)
    args = AddOverlayArgs(text="x", startMs=0, endMs=project.durationMs + 5000, x=50, y=50, style=StylePatch())
    check(
        "add_overlay raises ToolExecutionError when endMs exceeds durationMs",
        raises(ToolExecutionError, lambda: add_overlay(args, project)),
    )
    check("project is unchanged after the failure", snapshot(project) == before)


# --- validation boundary (Phase 1) defense in depth --------------------------
def test_apply_patch_still_catches_a_smuggled_invalid_value(project: Project) -> None:
    """`model_construct()` bypasses Pydantic field validation entirely —
    simulating a value that somehow got past normal construction. Confirms
    the Phase 1 validation boundary (`apply_patch`'s final
    `Project.model_validate`) is real defense in depth, not decorative,
    exactly as Phase 4 requires ("every resulting Project must pass the
    Phase 1 validation boundary before being returned")."""
    smuggled_style = StylePatch.model_construct(fontSize=-999)
    smuggled_patch = UpdateWordAction.model_construct(
        type="UPDATE_WORD",
        wordId=project.words[0].id,
        patch=WordPatch.model_construct(style=smuggled_style),
    )
    before = snapshot(project)
    check(
        "apply_patch's final schema revalidation catches a smuggled invalid value",
        raises(PatchError, lambda: apply_patch(project, smuggled_patch)),
    )
    check("project is unchanged after that failure too", snapshot(project) == before)


# --- registry integration -----------------------------------------------------
def test_all_five_tools_are_registered_as_available() -> None:
    for name in ("update_caption_style", "move_caption", "scale_caption", "apply_preset", "add_overlay"):
        spec = default_registry.get_spec(name)
        check(f"{name} is registered as AVAILABLE", spec.status is ToolStatus.AVAILABLE)
        handler_ok = True
        try:
            default_registry.get_handler(name)
        except ToolNotImplementedError:
            handler_ok = False
        check(f"{name}'s handler is retrievable without ToolNotImplementedError", handler_ok)


def test_this_phases_five_tools_did_not_leave_anything_planned_that_they_own() -> None:
    """Phase 4 only implements the 5 mutation tools — analyze_frame was
    still PLANNED when this test was written. Phase 5 later implemented it
    too (see test_vision_tools.py); this assertion intentionally only
    checks this phase's own 5 tools are gone from the PLANNED list, so it
    doesn't need updating again for Phase 5's unrelated change."""
    planned = {s.name for s in default_registry.list_specs(status=ToolStatus.PLANNED)}
    this_phases_tools = {"update_caption_style", "move_caption", "scale_caption", "apply_preset", "add_overlay"}
    check("none of this phase's 5 tools remain PLANNED", planned.isdisjoint(this_phases_tools))


def main() -> int:
    project = load_demo_project()

    test_update_caption_style_valid(project)
    test_update_caption_style_unknown_word_id(project)
    test_update_caption_style_rejects_out_of_range_values_at_construction()

    test_move_caption_valid(project)
    test_move_caption_unknown_word_id(project)
    test_move_caption_rejects_out_of_range_position_at_construction()

    test_scale_caption_valid(project)
    test_scale_caption_unknown_word_id(project)
    test_scale_caption_rejects_non_positive_size_at_construction()

    test_apply_preset_valid(project)
    test_apply_preset_rejects_unknown_preset_at_construction(project)

    test_add_overlay_valid(project)
    test_add_overlay_inverted_time_range(project)
    test_add_overlay_exceeds_project_duration(project)

    test_apply_patch_still_catches_a_smuggled_invalid_value(project)

    test_all_five_tools_are_registered_as_available()
    test_this_phases_five_tools_did_not_leave_anything_planned_that_they_own()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
