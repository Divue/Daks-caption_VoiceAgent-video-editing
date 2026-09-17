"""Phase 2: public surface of the tool registry package.

Importing this package populates `default_registry` with the current
planned-tool catalog (see catalog.py) as a side effect — this is metadata
registration, not tool execution; nothing here calls Bedrock, boto3, or any
tool handler.
"""
from __future__ import annotations

from . import catalog  # noqa: F401  (import triggers planned-tool registration)
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
