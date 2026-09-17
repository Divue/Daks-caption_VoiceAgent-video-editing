"""Phase 2 (updated in Phase 3): the planned-tool catalog.

Registers the still-unimplemented tools from the approved architecture
plan's MVP tool table (§6) into `default_registry`, as `ToolStatus.PLANNED`
with no handler — documentation made checkable, not an implementation.

`get_project_context`, `get_timeline`, and `find_words` are no longer listed
here as of Phase 3: they were REMOVED from this file and now register
themselves as `ToolStatus.AVAILABLE` directly in `context_tools.py`. This
resolves the exact tension the Phase 2 audit flagged in advance
("Dependencies / Blockers": registration doesn't allow a PLANNED entry to be
silently promoted in place, since `register()` rejects duplicate names) —
rather than "flip a status in place," each phase's real tools live in their
own module and this file only ever lists what's still unimplemented. Phase 4
(mutation tools) and Phase 5 (vision) will remove their entries from here the
same way when they add real handlers.

Deliberately NOT catalogued (see the approved plan §6 for the reasoning,
restated briefly here so this file stays the single source of truth for
"what we're building"):
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
from .schemas import (
    AddOverlayArgs,
    AddOverlayResult,
    AnalyzeFrameArgs,
    AnalyzeFrameResult,
    ApplyPresetArgs,
    ApplyPresetResult,
    MoveCaptionArgs,
    MoveCaptionResult,
    ScaleCaptionArgs,
    ScaleCaptionResult,
    UpdateCaptionStyleArgs,
    UpdateCaptionStyleResult,
)

_PLANNED_TOOLS = [
    ToolSpec(
        name="update_caption_style",
        description="Apply a style patch (color, font, weight, glow, shake, gradient, etc.) to one word.",
        input_model=UpdateCaptionStyleArgs,
        output_model=UpdateCaptionStyleResult,
        reads=True,
        writes=True,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 4) — produces an UpdateWordAction patch, validated via app.agent.validation.",
    ),
    ToolSpec(
        name="move_caption",
        description="Set a word's x/y position. Thin wrapper over update_caption_style for clearer LLM tool-selection.",
        input_model=MoveCaptionArgs,
        output_model=MoveCaptionResult,
        reads=True,
        writes=True,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 4).",
    ),
    ToolSpec(
        name="scale_caption",
        description="Set a word's font size. Thin wrapper over update_caption_style for clearer LLM tool-selection.",
        input_model=ScaleCaptionArgs,
        output_model=ScaleCaptionResult,
        reads=True,
        writes=True,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 4).",
    ),
    ToolSpec(
        name="apply_preset",
        description="Set the project's active preset.",
        input_model=ApplyPresetArgs,
        output_model=ApplyPresetResult,
        reads=False,
        writes=True,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 4) — presetId is already a closed enum (PresetId), validated at construction.",
    ),
    ToolSpec(
        name="add_overlay",
        description="Add a free-floating overlay caption/text box.",
        input_model=AddOverlayArgs,
        output_model=AddOverlayResult,
        reads=False,
        writes=True,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 4).",
    ),
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
