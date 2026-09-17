"""Phase 2 (updated in Phases 3, 4, and 5): the planned-tool catalog.

Registers the still-unimplemented tools from the approved architecture
plan's MVP tool table (§6) into `default_registry`, as `ToolStatus.PLANNED`
with no handler — documentation made checkable, not an implementation.

As of Phase 5, this list is EMPTY: every tool in the approved MVP set now
has a real handler and registers itself as `ToolStatus.AVAILABLE` directly
in its own module (`context_tools.py`, `style_tools.py`, `project_tools.py`,
`vision_tools.py`). This file is kept, rather than deleted, as the
canonical place a future tool would be catalogued before it has a real
handler — the mechanism it exercises (register a PLANNED spec here, remove
it once its own module implements and registers it AVAILABLE) is unchanged
even though nothing currently uses it.

"Has a real handler" is not the same as "is currently usable" —
`analyze_frame` (vision_tools.py) is AVAILABLE but fails honestly with
ToolExecutionError against every Project in this repo today, since none has
a backend-readable videoUrl yet (a P1 storage dependency, unchanged since
Phase 1). See the Phase 5 audit.

Deliberately NOT catalogued at all (see the approved plan §6 for the
reasoning, restated briefly here so this file stays the single source of
truth for "what we're building"):
  - trim_video, split_video: root CLAUDE.md excludes general video editing
    from MVP scope; building these would contradict an existing decision.
  - add_zoom, spotlight_caption: no representation in packages/shared's
    Project/Style/Overlay today; needs a lead-approved schema change first.
  - set_caption_effect, set_caption_gradient: recommended against as
    separate tools — glow/shake/gradient are already fields on Style and
    fold into update_caption_style instead of needing dedicated tools.
"""
from __future__ import annotations

from .registry import ToolSpec, default_registry  # noqa: F401  (kept for the next tool that needs this file)

_PLANNED_TOOLS: list[ToolSpec] = []

for _spec in _PLANNED_TOOLS:
    default_registry.register(_spec)  # handler=None — PLANNED tools never carry a handler
