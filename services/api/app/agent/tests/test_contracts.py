#!/usr/bin/env python3
"""Phase 1 verification: agent contracts + validation boundary.

No pytest dependency — the repo has no test framework yet (verified: not in
services/api/requirements.txt, no pytest anywhere in the repo), and adding
one is out of scope for a contracts-only phase. Plain assertions instead,
matching the style already used by services/api/scripts/stt_bakeoff/bakeoff.py.

Run:
    cd services/api && python -m app.agent.tests.test_contracts

Requires no AWS credentials and makes no network calls — everything here is
pure Pydantic model construction/validation against a local fixture.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from pydantic import ValidationError  # noqa: E402

from app.agent.contracts import (  # noqa: E402
    AddOverlayAction,
    AgentCommandRequest,
    AgentCommandResponse,
    AgentLogEntry,
    SelectionContext,
    SetPresetAction,
    UpdateWordAction,
    WordPatch,
)
from app.agent.validation import PatchError, apply_patch, apply_patches  # noqa: E402
from app.schema import Overlay, Project  # noqa: E402

from app.agent.tests._fixtures import fixtures_dir  # noqa: E402

FIXTURES = fixtures_dir()
DEMO_PROJECT = FIXTURES / "demo-project.json"

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def load_demo_project() -> Project:
    raw = json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))
    return Project.model_validate(raw)


def test_fixture_is_schema_valid() -> Project:
    project = load_demo_project()
    check("demo-project.json validates against app.schema.Project", isinstance(project, Project))
    check("demo-project.json has at least one word", len(project.words) > 0)
    return project


def test_request_response_round_trip(project: Project) -> None:
    request = AgentCommandRequest(
        command="Make the word insane yellow",
        project=project,
        selection=SelectionContext(selectedWordId=project.words[0].id, playheadMs=0),
    )
    dumped = request.model_dump(mode="json")
    reloaded = AgentCommandRequest.model_validate(dumped)
    check("AgentCommandRequest round-trips through JSON", reloaded == request)

    response = AgentCommandResponse(
        status="ok",
        patches=[SetPresetAction(presetId=project.presetId)],
        log=[AgentLogEntry(id="log-1", message="Command received", timestamp=0)],
    )
    dumped_response = response.model_dump(mode="json")
    reloaded_response = AgentCommandResponse.model_validate(dumped_response)
    check("AgentCommandResponse round-trips through JSON", reloaded_response == response)


def test_valid_update_word_patch(project: Project) -> None:
    target = project.words[0]
    patch = UpdateWordAction(wordId=target.id, patch=WordPatch(style={"color": "#FFE600", "fontSize": 96}))
    result = apply_patch(project, patch)

    check("apply_patch returns a Project", isinstance(result, Project))
    updated = next(w for w in result.words if w.id == target.id)
    check("UPDATE_WORD patch applied the new color", updated.style is not None and updated.style.color == "#FFE600")
    check("UPDATE_WORD patch applied the new fontSize", updated.style.fontSize == 96)
    check("UPDATE_WORD patch left other words untouched", result.words[1:] == project.words[1:] if len(project.words) > 1 else True)
    check("original project object was not mutated", project.words[0].style != updated.style or target.style is None)


def test_valid_set_preset_patch(project: Project) -> None:
    other_preset = "minimal" if project.presetId != "minimal" else "mrbeast"
    patch = SetPresetAction(presetId=other_preset)
    result = apply_patch(project, patch)
    check("SET_PRESET patch applied", result.presetId == other_preset)
    check("SET_PRESET did not mutate the original project", project.presetId != other_preset)


def test_valid_add_overlay_patch(project: Project) -> None:
    overlay = Overlay(
        id="test-overlay-1",
        text="hi",
        startMs=0,
        endMs=1000,
        x=50,
        y=50,
        style={"fontFamily": "Inter", "fontSize": 40, "color": "#ffffff", "weight": 400},
    )
    patch = AddOverlayAction(overlay=overlay)
    before_count = len(project.overlays)
    result = apply_patch(project, patch)
    check("ADD_OVERLAY patch appended one overlay", len(result.overlays) == before_count + 1)
    check("ADD_OVERLAY did not mutate the original project's overlay count", len(project.overlays) == before_count)


def test_invalid_word_id_rejected(project: Project) -> None:
    patch = UpdateWordAction(wordId="does-not-exist", patch=WordPatch(text="x"))
    snapshot = project.model_dump(mode="json")
    raised = False
    try:
        apply_patch(project, patch)
    except PatchError:
        raised = True
    check("PatchError raised for unknown wordId", raised)
    check("project unchanged after unknown-wordId failure", project.model_dump(mode="json") == snapshot)


def test_invalid_patch_values_rejected_at_construction(project: Project) -> None:
    raised = False
    try:
        UpdateWordAction(wordId=project.words[0].id, patch=WordPatch(stretch=0.5))  # schema requires stretch >= 1
    except ValidationError:
        raised = True
    check("WordPatch rejects stretch < 1 at construction time", raised)

    raised = False
    try:
        SetPresetAction(presetId="not-a-real-preset")
    except ValidationError:
        raised = True
    check("SetPresetAction rejects an unknown presetId at construction time", raised)


def test_malformed_project_rejected() -> None:
    raised = False
    try:
        Project.model_validate({"id": "x"})  # missing every other required field
    except ValidationError:
        raised = True
    check("Project.model_validate rejects a malformed/incomplete document", raised)


def test_apply_patches_all_or_nothing(project: Project) -> None:
    good = SetPresetAction(presetId="minimal" if project.presetId != "minimal" else "mrbeast")
    bad = UpdateWordAction(wordId="does-not-exist", patch=WordPatch(text="x"))
    snapshot = project.model_dump(mode="json")

    result, error = apply_patches(project, [good, bad])
    check("apply_patches reports an error when any patch in the list fails", error is not None)
    check("apply_patches returns the ORIGINAL project when a later patch fails", result.model_dump(mode="json") == snapshot)

    result_ok, error_ok = apply_patches(project, [good])
    check("apply_patches succeeds and returns a changed project when all patches are valid", error_ok is None and result_ok.presetId == good.presetId)


def main() -> int:
    project = test_fixture_is_schema_valid()
    test_request_response_round_trip(project)
    test_valid_update_word_patch(project)
    test_valid_set_preset_patch(project)
    test_valid_add_overlay_patch(project)
    test_invalid_word_id_rejected(project)
    test_invalid_patch_values_rejected_at_construction(project)
    test_malformed_project_rejected()
    test_apply_patches_all_or_nothing(project)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
