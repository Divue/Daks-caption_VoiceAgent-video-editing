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


EXPECTED_PLANNED_TOOLS = {
    "get_project_context",
    "get_timeline",
    "find_words",
    "update_caption_style",
    "move_caption",
    "scale_caption",
    "apply_preset",
    "add_overlay",
    "analyze_frame",
}


def test_default_catalog_matches_approved_mvp_tool_set() -> None:
    names = {spec.name for spec in default_registry.list_specs()}
    check("default_registry contains exactly the approved MVP + analyze_frame tool set", names == EXPECTED_PLANNED_TOOLS)

    planned = default_registry.list_specs(status=ToolStatus.PLANNED)
    check("every catalogued tool is PLANNED (none fake-implemented in Phase 2)", len(planned) == len(EXPECTED_PLANNED_TOOLS))

    available = default_registry.list_specs(status=ToolStatus.AVAILABLE)
    check("no tool is AVAILABLE yet — Phase 2 implements no tool logic", len(available) == 0)


def test_default_catalog_tools_all_raise_not_implemented() -> None:
    all_raise = True
    for name in EXPECTED_PLANNED_TOOLS:
        if not raises(ToolNotImplementedError, lambda n=name: default_registry.get_handler(n)):
            all_raise = False
    check("every catalogued tool's get_handler() raises ToolNotImplementedError (no fabricated results)", all_raise)


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
