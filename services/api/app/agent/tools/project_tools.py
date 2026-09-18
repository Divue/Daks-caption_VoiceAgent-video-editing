"""Phase 4: real handlers for the two project-level mutation tools.

Same commit-or-nothing pattern as style_tools.py: build the AgentPatch,
confirm it validates via app.agent.validation.apply_patch (which never
mutates `project`), and only then return the patch — never the mutated
Project itself, since the agent is stateless per request.
"""
from __future__ import annotations

import uuid

from app.schema import Overlay, Project

from ..contracts import AddOverlayAction, SetPresetAction
from ..validation import PatchError, apply_patch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import AddOverlayArgs, AddOverlayResult, ApplyPresetArgs, ApplyPresetResult


def apply_preset(args: ApplyPresetArgs, project: Project) -> ApplyPresetResult:
    """Set the project's active preset. `args.presetId` is already a closed
    PresetId enum (rejected at ApplyPresetArgs construction if unknown), so
    the only way this can fail here is if some other part of the resulting
    document were somehow left invalid — kept as a real check, not
    decorative, via the same apply_patch validation boundary every other
    mutation tool uses."""
    patch = SetPresetAction(presetId=args.presetId)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return ApplyPresetResult(patch=patch)


def add_overlay(args: AddOverlayArgs, project: Project) -> AddOverlayResult:
    """Add a free-floating overlay caption/text box.

    Raises ToolExecutionError if the time range is inverted or extends past
    the project's actual duration — Pydantic (schemas.py) already checked
    each of startMs/endMs is individually >= 0, but not that they make sense
    as a pair, or against this specific project's `durationMs`.
    """
    if args.startMs >= args.endMs:
        raise ToolExecutionError(f"startMs ({args.startMs}) must be before endMs ({args.endMs})")
    if args.endMs > project.durationMs:
        raise ToolExecutionError(f"endMs ({args.endMs}) exceeds the project's durationMs ({project.durationMs})")

    overlay = Overlay(
        id=f"overlay-{uuid.uuid4().hex[:8]}",
        text=args.text,
        startMs=args.startMs,
        endMs=args.endMs,
        x=args.x,
        y=args.y,
        style=args.style,
    )
    patch = AddOverlayAction(overlay=overlay)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return AddOverlayResult(patch=patch)


default_registry.register(
    ToolSpec(
        name="apply_preset",
        description="Set the project's active preset.",
        input_model=ApplyPresetArgs,
        output_model=ApplyPresetResult,
        reads=False,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 4.",
    ),
    apply_preset,
)

default_registry.register(
    ToolSpec(
        name="add_overlay",
        description="Add a free-floating overlay caption/text box.",
        input_model=AddOverlayArgs,
        output_model=AddOverlayResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 4. reads=True (updated from Phase 2's placeholder): the handler "
        "reads project.durationMs to bound-check the overlay's time range.",
    ),
    add_overlay,
)
