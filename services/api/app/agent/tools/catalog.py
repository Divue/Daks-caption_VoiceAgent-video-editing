"""Phase 2: the planned-tool catalog.

Registers every tool named in the approved architecture plan's MVP tool
table (§6) into `default_registry`, as `ToolStatus.PLANNED` with no
handler — this is documentation made checkable, not an implementation.
Phase 3 (context tools), Phase 4 (mutation tools), and Phase 5 (vision)
attach real handlers and flip each entry to `ToolStatus.AVAILABLE`; this
file does not change when they do (they call `default_registry.register`
again — which will need this file's PLANNED entry removed/replaced at that
point, since a name can only be registered once — see the Phase 2 audit's
"Architecture Decisions" for why registration doesn't allow silent
overwrites).

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
    FindWordsArgs,
    FindWordsResult,
    GetProjectContextArgs,
    GetProjectContextResult,
    GetTimelineArgs,
    GetTimelineResult,
    MoveCaptionArgs,
    MoveCaptionResult,
    ScaleCaptionArgs,
    ScaleCaptionResult,
    UpdateCaptionStyleArgs,
    UpdateCaptionStyleResult,
)

_PLANNED_TOOLS = [
    ToolSpec(
        name="get_project_context",
        description="Summarize the current project: duration, dimensions, preset, settings, word count.",
        input_model=GetProjectContextArgs,
        output_model=GetProjectContextResult,
        reads=True,
        writes=False,
        status=ToolStatus.PLANNED,
        notes="Buildable now — operates only on the Project already sent with the request (Phase 3).",
    ),
    ToolSpec(
        name="get_timeline",
        description="List words (optionally windowed by time range) in timeline order.",
        input_model=GetTimelineArgs,
        output_model=GetTimelineResult,
        reads=True,
        writes=False,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 3).",
    ),
    ToolSpec(
        name="find_words",
        description="Locate word(s) by text (exact or substring match).",
        input_model=FindWordsArgs,
        output_model=FindWordsResult,
        reads=True,
        writes=False,
        status=ToolStatus.PLANNED,
        notes="Buildable now (Phase 3).",
    ),
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
