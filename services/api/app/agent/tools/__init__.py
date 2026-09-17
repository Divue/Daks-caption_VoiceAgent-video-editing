"""Phase 2 (updated in Phase 3): public surface of the tool registry package.

Importing this package populates `default_registry` with:
- the still-planned tools (catalog.py) — metadata only, no handler
- the real, available context tools (context_tools.py) — Phase 3

Nothing here calls Bedrock, boto3, or any tool handler; import-time
registration only attaches callables, it doesn't invoke them.
"""
from __future__ import annotations

from . import catalog  # noqa: F401  (import triggers planned-tool registration)
from . import context_tools  # noqa: F401  (import triggers Phase 3 tool registration)
from .registry import (
    ToolAlreadyRegisteredError,
    ToolHandler,
    ToolNotFoundError,
    ToolNotImplementedError,
    ToolRegistry,
    ToolRegistryError,
    ToolSpec,
    ToolStatus,
    default_registry,
)

__all__ = [
    "ToolAlreadyRegisteredError",
    "ToolHandler",
    "ToolNotFoundError",
    "ToolNotImplementedError",
    "ToolRegistry",
    "ToolRegistryError",
    "ToolSpec",
    "ToolStatus",
    "default_registry",
]
