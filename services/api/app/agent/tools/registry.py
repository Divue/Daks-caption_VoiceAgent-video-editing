"""Phase 2: the tool registry engine — no real tool logic lives here.

A `ToolSpec` is a typed description of one agent tool: its name, purpose,
argument/result shapes, whether it reads/writes project state, and whether
it currently has a real implementation (`ToolStatus.AVAILABLE`) or is only
documented for a future phase (`ToolStatus.PLANNED`, no handler).

`ToolRegistry` is the registration/lookup mechanism later phases use to
attach real handlers (Phase 3: context tools, Phase 4: mutation tools,
Phase 5: vision) without touching this file.
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass
from enum import Enum
from typing import Callable

from pydantic import BaseModel

from app.schema import Project


class ToolStatus(str, Enum):
    """AVAILABLE = has a real handler, is executable, and IS offered to the
    model (tool_config.py builds Bedrock's toolConfig from exactly this set).

    PLANNED = documented in the catalog for a future phase; no handler yet,
    and none may be attached until that phase implements it for real.

    DISABLED = has a real, tested handler, but is deliberately NOT offered
    to the model and may not be executed by the planner. This is for a tool
    whose effect cannot actually land anywhere today, where offering it
    would make the agent claim a capability the product does not have; the
    honest answer for such a request is "UNSUPPORTED", which the model can
    only give if the tool is absent from its toolConfig. Kept registered
    (rather than deleted) so the spec, the handler and its tests stay real
    and re-enabling it is a one-word change — see tools/project_tools.py's
    `add_overlay`.
    """

    AVAILABLE = "available"
    PLANNED = "planned"
    DISABLED = "disabled"


# A handler takes the tool's validated arguments plus the current Project
# (every planned tool needs at least read access to it) and returns the
# tool's validated result. Finalized here for Phase 3+ to implement against;
# revisit if a later phase's tool genuinely doesn't fit this shape.
ToolHandler = Callable[[BaseModel, Project], BaseModel]


class ToolRegistryError(Exception):
    """Base class for registry errors."""


class ToolAlreadyRegisteredError(ToolRegistryError):
    def __init__(self, name: str) -> None:
        super().__init__(f"tool {name!r} is already registered")
        self.name = name


class ToolNotFoundError(ToolRegistryError):
    def __init__(self, name: str) -> None:
        super().__init__(f"no tool named {name!r} is registered")
        self.name = name


class ToolNotImplementedError(ToolRegistryError):
    """Raised when a tool is known (present in the catalog) but has no
    handler yet — i.e. `ToolStatus.PLANNED`. Distinct from
    `ToolNotFoundError` so callers, logs, and the eventual planner can tell
    "doesn't exist" apart from "exists, not built yet" (per the approved
    plan's rule against hallucinating unsupported operations)."""

    def __init__(self, name: str) -> None:
        super().__init__(f"tool {name!r} is planned but not implemented yet")
        self.name = name


@dataclass(frozen=True)
class ToolSpec:
    """A typed description of one agent tool. Never carries a fabricated
    handler: construction itself enforces that AVAILABLE specs have a real
    handler and PLANNED specs don't (see `ToolRegistry.register`)."""

    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    reads: bool
    writes: bool
    status: ToolStatus
    notes: str = ""

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("ToolSpec.name must be non-empty")
        for field_name, value in (("input_model", self.input_model), ("output_model", self.output_model)):
            if not (inspect.isclass(value) and issubclass(value, BaseModel)):
                raise TypeError(f"ToolSpec.{field_name} must be a BaseModel subclass, got {value!r}")


class ToolRegistry:
    """In-memory registry of `ToolSpec`s plus, for AVAILABLE tools, their
    handlers. Deliberately has no persistence and no global side effects on
    import for a fresh instance — the shared, catalog-populated instance is
    `default_registry` at the bottom of this module."""

    def __init__(self) -> None:
        self._specs: dict[str, ToolSpec] = {}
        self._handlers: dict[str, ToolHandler] = {}

    def register(self, spec: ToolSpec, handler: ToolHandler | None = None) -> None:
        """Register `spec`, with `handler` required unless `spec.status` is
        PLANNED (AVAILABLE and DISABLED both describe a real, callable
        implementation; only PLANNED means "not built"). Raises
        `ToolAlreadyRegisteredError` on a duplicate name — registration
        never silently overwrites an existing tool."""
        if spec.name in self._specs:
            raise ToolAlreadyRegisteredError(spec.name)

        if spec.status is not ToolStatus.PLANNED and handler is None:
            raise ValueError(f"tool {spec.name!r} is marked {spec.status.value.upper()} but no handler was given")
        if spec.status is ToolStatus.PLANNED and handler is not None:
            raise ValueError(
                f"tool {spec.name!r} is marked PLANNED but a handler was given — "
                "this would fake an implementation that doesn't exist yet"
            )

        self._specs[spec.name] = spec
        if handler is not None:
            self._handlers[spec.name] = handler

    def get_spec(self, name: str) -> ToolSpec:
        try:
            return self._specs[name]
        except KeyError:
            raise ToolNotFoundError(name) from None

    def get_handler(self, name: str) -> ToolHandler:
        """Raises `ToolNotFoundError` if `name` isn't registered at all, or
        `ToolNotImplementedError` if it's registered but still PLANNED."""
        spec = self.get_spec(name)  # raises ToolNotFoundError first, if applicable
        try:
            return self._handlers[name]
        except KeyError:
            raise ToolNotImplementedError(spec.name) from None

    def list_specs(self, status: ToolStatus | None = None) -> list[ToolSpec]:
        specs = list(self._specs.values())
        if status is not None:
            specs = [s for s in specs if s.status is status]
        return sorted(specs, key=lambda s: s.name)

    def __contains__(self, name: str) -> bool:
        return name in self._specs

    def __len__(self) -> int:
        return len(self._specs)


# The shared registry every real tool phase (3, 4, 5) registers into.
# Populated with the current planned-tool catalog by importing
# app.agent.tools (see tools/__init__.py -> tools/catalog.py).
default_registry = ToolRegistry()
