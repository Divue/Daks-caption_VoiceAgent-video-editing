#!/usr/bin/env python3
"""Phase 2 verification: the tool registry mechanism + the planned-tool
catalog.

Generic mechanism tests (registration, lookup, duplicates, missing tools)
use a FRESH `ToolRegistry()` with synthetic dummy specs — not the real
catalog — so they test the mechanism itself, not today's specific tool
list. Catalog tests separately check the real `default_registry` against
the approved plan's MVP tool set.

Run:
    cd services/api && python -m app.agent.tests.test_tool_registry

No AWS credentials, no network calls, no tool handler is ever invoked
(none exist yet — every catalog entry is ToolStatus.PLANNED).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from pydantic import BaseModel  # noqa: E402

from app.agent.tools import (  # noqa: E402
    ToolAlreadyRegisteredError,
    ToolNotFoundError,
    ToolNotImplementedError,
    ToolRegistry,
    ToolSpec,
    ToolStatus,
    default_registry,
)
from app.schema import Project  # noqa: E402

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


class DummyArgs(BaseModel):
    value: str


class DummyResult(BaseModel):
    ok: bool


def dummy_handler(args: DummyArgs, project: Project) -> DummyResult:
    return DummyResult(ok=True)


def test_register_available_tool_with_handler() -> None:
    registry = ToolRegistry()
    spec = ToolSpec(
        name="dummy_tool",
        description="test-only tool",
        input_model=DummyArgs,
        output_model=DummyResult,
        reads=True,
        writes=False,
        status=ToolStatus.AVAILABLE,
    )
    registry.register(spec, dummy_handler)
    check("registering an AVAILABLE tool with a handler succeeds", "dummy_tool" in registry)
    check("get_spec returns the registered spec", registry.get_spec("dummy_tool") is spec)
    check("get_handler returns the registered handler", registry.get_handler("dummy_tool") is dummy_handler)


def test_register_planned_tool_without_handler() -> None:
    registry = ToolRegistry()
    spec = ToolSpec(
        name="future_tool",
        description="not built yet",
        input_model=DummyArgs,
        output_model=DummyResult,
        reads=True,
        writes=False,
        status=ToolStatus.PLANNED,
    )
    registry.register(spec)
    check("registering a PLANNED tool with no handler succeeds", "future_tool" in registry)
    check(
        "get_handler on a PLANNED tool raises ToolNotImplementedError, not a fabricated result",
        raises(ToolNotImplementedError, lambda: registry.get_handler("future_tool")),
    )


def test_duplicate_registration_rejected() -> None:
    registry = ToolRegistry()
    spec = ToolSpec(
        name="dup_tool", description="x", input_model=DummyArgs, output_model=DummyResult,
        reads=True, writes=False, status=ToolStatus.PLANNED,
    )
    registry.register(spec)
    check(
        "registering the same tool name twice raises ToolAlreadyRegisteredError",
        raises(ToolAlreadyRegisteredError, lambda: registry.register(spec)),
    )
    check("the original registration was not overwritten/duplicated", len(registry) == 1)


def test_missing_tool_lookup_raises() -> None:
    registry = ToolRegistry()
    check("get_spec on an unregistered name raises ToolNotFoundError", raises(ToolNotFoundError, lambda: registry.get_spec("nope")))
    check("get_handler on an unregistered name raises ToolNotFoundError", raises(ToolNotFoundError, lambda: registry.get_handler("nope")))


def test_available_requires_handler_and_planned_forbids_one() -> None:
    registry = ToolRegistry()
    available_spec_no_handler = ToolSpec(
        name="broken_available", description="x", input_model=DummyArgs, output_model=DummyResult,
        reads=True, writes=False, status=ToolStatus.AVAILABLE,
    )
    check(
        "registering AVAILABLE with no handler is rejected (would be a fabricated tool)",
        raises(ValueError, lambda: registry.register(available_spec_no_handler)),
    )

    planned_spec_with_handler = ToolSpec(
        name="broken_planned", description="x", input_model=DummyArgs, output_model=DummyResult,
        reads=True, writes=False, status=ToolStatus.PLANNED,
    )
    check(
        "registering PLANNED with a handler is rejected (would fake an unimplemented tool)",
        raises(ValueError, lambda: registry.register(planned_spec_with_handler, dummy_handler)),
    )


def test_tool_spec_rejects_non_basemodel_schemas() -> None:
    check(
        "ToolSpec rejects a non-BaseModel input_model",
        raises(
            TypeError,
            lambda: ToolSpec(
                name="bad_input", description="x", input_model=dict, output_model=DummyResult,
                reads=True, writes=False, status=ToolStatus.PLANNED,
            ),
        ),
    )
    check(
        "ToolSpec rejects an empty name",
        raises(
            ValueError,
            lambda: ToolSpec(
                name="", description="x", input_model=DummyArgs, output_model=DummyResult,
                reads=True, writes=False, status=ToolStatus.PLANNED,
            ),
        ),
    )


EXPECTED_ALL_TOOLS = {
    # read-only context
    "get_project_context", "get_timeline", "find_words",
    # per-word edits, every one taking a LIST of word ids
    "set_text", "set_emphasis", "set_emotion", "set_stretch", "set_single",
    "set_emoji", "shift_timing", "set_position", "update_caption_style",
    "emphasise_peaks",
    # project-level
    "apply_preset", "set_settings", "set_preset_override", "reset_styling",
    # vision
    "analyze_frame",
    # media layers — images and clips over the video
    "get_layers", "update_layer_items", "retime_layer_item", "split_layer_item",
    "set_layer_track", "duplicate_layer_item", "remove_layer_items",
    # registered but DISABLED — nothing renders an overlay, so it is never offered
    "add_overlay",
}

# As of Phase 5, every tool in the approved MVP set has a real handler and
# is ToolStatus.AVAILABLE (Phase 3: the three context tools; Phase 4: the
# three style tools plus the two project tools; Phase 5: analyze_frame).
# EXPECTED_PLANNED_TOOLS is now empty — catalog.py's list is empty too (see
# its module docstring). "AVAILABLE" here means "has a real handler," not
# "currently usable": analyze_frame fails honestly against every real
# fixture today, since none has a backend-readable videoUrl (see the Phase
# 5 audit / test_vision_tools.py).
EXPECTED_DISABLED_TOOLS = {"add_overlay"}
EXPECTED_AVAILABLE_TOOLS = EXPECTED_ALL_TOOLS - EXPECTED_DISABLED_TOOLS
EXPECTED_PLANNED_TOOLS: set[str] = set()


def test_default_catalog_matches_approved_mvp_tool_set() -> None:
    names = {spec.name for spec in default_registry.list_specs()}
    check("default_registry contains exactly the approved MVP + analyze_frame tool set", names == EXPECTED_ALL_TOOLS)

    planned = default_registry.list_specs(status=ToolStatus.PLANNED)
    check("no tool remains PLANNED (every MVP tool now has a real handler)", {s.name for s in planned} == EXPECTED_PLANNED_TOOLS == set())

    available = default_registry.list_specs(status=ToolStatus.AVAILABLE)
    check("every MVP tool is AVAILABLE", {s.name for s in available} == EXPECTED_AVAILABLE_TOOLS)


def test_default_catalog_tools_all_raise_not_implemented() -> None:
    all_raise = True
    for name in EXPECTED_PLANNED_TOOLS:
        if not raises(ToolNotImplementedError, lambda n=name: default_registry.get_handler(n)):
            all_raise = False
    check("every still-PLANNED tool's get_handler() raises ToolNotImplementedError (no fabricated results)", all_raise)

    all_callable = True
    for name in EXPECTED_AVAILABLE_TOOLS:
        try:
            default_registry.get_handler(name)
        except ToolNotImplementedError:
            all_callable = False
    check("every AVAILABLE tool's get_handler() returns a real callable, not an error", all_callable)


def test_excluded_tools_are_not_in_the_catalog() -> None:
    excluded = {
        "trim_video", "split_video", "add_zoom", "spotlight_caption",
        "set_caption_effect", "set_caption_gradient",
    }
    names = {spec.name for spec in default_registry.list_specs()}
    check("out-of-scope/deferred tools (trim_video, add_zoom, etc.) are not catalogued", names.isdisjoint(excluded))


def main() -> int:
    test_register_available_tool_with_handler()
    test_register_planned_tool_without_handler()
    test_duplicate_registration_rejected()
    test_missing_tool_lookup_raises()
    test_available_requires_handler_and_planned_forbids_one()
    test_tool_spec_rejects_non_basemodel_schemas()
    test_default_catalog_matches_approved_mvp_tool_set()
    test_default_catalog_tools_all_raise_not_implemented()
    test_excluded_tools_are_not_in_the_catalog()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
