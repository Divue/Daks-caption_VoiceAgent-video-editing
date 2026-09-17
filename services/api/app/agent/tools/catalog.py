"""Phase 2 (updated in Phase 3 and Phase 4): the planned-tool catalog.

Registers the still-unimplemented tools from the approved architecture
plan's MVP tool table (§6) into `default_registry`, as `ToolStatus.PLANNED`
with no handler — documentation made checkable, not an implementation.

As of Phase 4, the only entry left here is `analyze_frame` — every other
MVP tool now has a real handler and registers itself as `ToolStatus.AVAILABLE`
directly in its own module (`context_tools.py` for the three read-only
tools, `style_tools.py` for the three per-word style tools, `project_tools.py`
for the two project-level tools). Each removal follows the same pattern the
Phase 2 audit predicted and Phase 3 first applied: `register()` rejects
duplicate names, so a tool's real implementation can't overwrite its old
PLANNED placeholder in place — it has to be registered fresh, which means
removing the old entry from here first.

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

from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import AnalyzeFrameArgs, AnalyzeFrameResult

_PLANNED_TOOLS = [
    ToolSpec(
        name="analyze_frame",
        description="Grab a video frame at a timestamp and return bounding boxes for a target (person/face).",
        input_model=AnalyzeFrameArgs,
        output_model=AnalyzeFrameResult,
        reads=True,
        writes=False,
        status=ToolStatus.PLANNED,
        notes=(
            "Contract-only until P1 wires real video storage — no Project in this repo has a "
            "backend-readable videoUrl yet. Phase 5 implements the contract; real execution stays "
            "blocked until that infra exists (see the approved plan, §6a)."
        ),
    ),
]

for _spec in _PLANNED_TOOLS:
    default_registry.register(_spec)  # handler=None — PLANNED tools never carry a handler
