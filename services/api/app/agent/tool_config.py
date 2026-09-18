"""Phase 6: converts the server-side ToolRegistry into Bedrock Converse's
`toolConfig` shape.

This is the ONLY place a tool name/schema reaches the model. The model can
never be told about, and therefore can never request, a tool that isn't
`ToolStatus.AVAILABLE` in `default_registry` at the moment this is built —
there is no other code path in the planner that adds a tool name to what's
sent to Bedrock. This is the concrete mechanism behind "do not allow the
model to register or invent tools" / "only allow calls to tools present in
the server-side ToolRegistry".

It is also the mechanism behind `ToolStatus.DISABLED` (registry.py): a
DISABLED tool has a real handler but is filtered out here, so the model is
never told it exists and answers UNSUPPORTED for it instead of claiming a
change that cannot land. The planner refuses to execute a non-AVAILABLE
tool as well, so the filter is defence in depth rather than the only gate.
"""
from __future__ import annotations

from .tools import ToolStatus, default_registry
from .tools.registry import ToolRegistry


def build_tool_config(registry: ToolRegistry = default_registry) -> dict:
    """Bedrock Converse's `toolConfig`: `{"tools": [{"toolSpec": {...}}, ...]}`.

    Each tool's `inputSchema` is generated directly from its Pydantic
    `input_model` via `model_json_schema()` — the same shape already
    enforced when a tool's handler validates its arguments (planner.py
    re-validates with the identical model before ever calling a handler),
    so the schema shown to the model can never drift from what's actually
    accepted.
    """
    tools = [
        {
            "toolSpec": {
                "name": spec.name,
                "description": spec.description,
                "inputSchema": {"json": spec.input_model.model_json_schema()},
            }
        }
        for spec in registry.list_specs(status=ToolStatus.AVAILABLE)
    ]
    return {"tools": tools}
