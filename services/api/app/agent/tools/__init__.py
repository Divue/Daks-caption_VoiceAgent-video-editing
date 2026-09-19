"""Phase 2 (updated in Phases 3, 4, and 5): public surface of the tool
registry package.

Importing this package populates `default_registry` with:
- the still-planned tools (catalog.py) — metadata only, no handler
  (as of Phase 5: empty — see catalog.py)
- the real, available context tools (context_tools.py) — Phase 3
- the real, available style mutation tools (style_tools.py) — Phase 4
- the real, available per-word content tools (word_tools.py)
- the real project-level tools (project_tools.py) — Phase 4, plus the
  DISABLED `add_overlay` (registered, never offered to the model)
- the real, available vision tool (vision_tools.py) — Phase 5
- the media-layer tools (layer_tools.py): images and clips over the video

Nothing here calls Bedrock, boto3, ffmpeg, or any tool handler; import-time
registration only attaches callables, it doesn't invoke them.
"""
from __future__ import annotations

from . import catalog  # noqa: F401  (import triggers planned-tool registration)
from . import context_tools  # noqa: F401  (import triggers Phase 3 tool registration)
from . import layer_tools  # noqa: F401  (media layers: images and clips over the video)
from . import project_tools  # noqa: F401  (import triggers Phase 4 tool registration)
from . import style_tools  # noqa: F401  (import triggers Phase 4 tool registration)
from . import vision_tools  # noqa: F401  (import triggers Phase 5 tool registration)
from . import word_tools  # noqa: F401  (import triggers per-word content tool registration)
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
