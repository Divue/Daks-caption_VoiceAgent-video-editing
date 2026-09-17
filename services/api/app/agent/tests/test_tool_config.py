#!/usr/bin/env python3
"""Phase 6 verification: converting the ToolRegistry into Bedrock's
toolConfig shape.

Run:
    cd services/api && python -m app.agent.tests.test_tool_config

No AWS credentials, no network calls — this only inspects data structures.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from pydantic import BaseModel  # noqa: E402

from app.agent.tool_config import build_tool_config  # noqa: E402
from app.agent.tools import default_registry  # noqa: E402
from app.agent.tools.registry import ToolRegistry, ToolSpec, ToolStatus  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


class _Args(BaseModel):
    value: str


class _Result(BaseModel):
    ok: bool


def _dummy_handler(args: _Args, project) -> _Result:
    return _Result(ok=True)


def test_default_registry_produces_all_nine_tools() -> None:
    config = build_tool_config()
    names = {tool["toolSpec"]["name"] for tool in config["tools"]}
    check("build_tool_config() includes all 9 implemented tools", len(names) == 9)
    check("get_project_context is present", "get_project_context" in names)
    check("analyze_frame is present", "analyze_frame" in names)


def test_each_tool_spec_has_the_required_bedrock_shape() -> None:
    config = build_tool_config()
    all_shaped_correctly = True
    for tool in config["tools"]:
        spec = tool.get("toolSpec", {})
        if not (spec.get("name") and spec.get("description") and "json" in spec.get("inputSchema", {})):
            all_shaped_correctly = False
    check("every tool entry has name, description, and inputSchema.json", all_shaped_correctly)


def test_planned_tools_never_appear_in_tool_config() -> None:
    """A registry with a mix of AVAILABLE and PLANNED tools must only
    surface the AVAILABLE ones to Bedrock — this is the actual mechanism
    behind "the model can never be told about a tool that isn't real"."""
    registry = ToolRegistry()
    registry.register(
        ToolSpec(
            name="real_tool", description="x", input_model=_Args, output_model=_Result,
            reads=True, writes=False, status=ToolStatus.AVAILABLE,
        ),
        _dummy_handler,
    )
    registry.register(
        ToolSpec(
            name="future_tool", description="x", input_model=_Args, output_model=_Result,
            reads=True, writes=False, status=ToolStatus.PLANNED,
        )
    )

    config = build_tool_config(registry)
    names = {tool["toolSpec"]["name"] for tool in config["tools"]}
    check("only the AVAILABLE tool appears in toolConfig", names == {"real_tool"})
    check("the PLANNED tool is absent from toolConfig", "future_tool" not in names)


def test_empty_registry_produces_empty_tool_list() -> None:
    registry = ToolRegistry()
    config = build_tool_config(registry)
    check("an empty registry produces an empty tools list, not an error", config == {"tools": []})


def test_input_schema_reflects_the_real_pydantic_model() -> None:
    """Spot-check one tool: the JSON schema sent to the model must actually
    describe the fields its Args model requires — proving there's no
    separate, hand-maintained schema that could drift from the real one."""
    spec = default_registry.get_spec("move_caption")
    config = build_tool_config()
    move_caption_entry = next(t for t in config["tools"] if t["toolSpec"]["name"] == "move_caption")
    schema = move_caption_entry["toolSpec"]["inputSchema"]["json"]
    check(
        "move_caption's schema requires wordId, x, and y (from the real MoveCaptionArgs model)",
        set(schema.get("required", [])) == set(spec.input_model.model_json_schema().get("required", [])) == {"wordId", "x", "y"},
    )


def main() -> int:
    test_default_registry_produces_all_nine_tools()
    test_each_tool_spec_has_the_required_bedrock_shape()
    test_planned_tools_never_appear_in_tool_config()
    test_empty_registry_produces_empty_tool_list()
    test_input_schema_reflects_the_real_pydantic_model()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
