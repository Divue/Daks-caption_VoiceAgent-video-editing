"""Phase 4: real handlers for the three per-word style mutation tools.

Every handler here builds an `UpdateWordAction` (Phase 1's patch shape) and
runs it through `app.agent.validation.apply_patch` before returning it —
`apply_patch` never mutates its `project` argument, so the resulting,
schema-revalidated Project it computes is discarded once confirmed valid;
this module is stateless per the approved architecture (the agent never
persists a mutated Project, it only ever returns a validated patch for the
frontend to apply through its own reducer).

`move_caption`/`scale_caption` are thin wrappers over the exact same
mechanism as `update_caption_style` — each just narrows the `StylePatch` to
one concern (position, size) for clearer LLM tool-selection, per the
approved plan's tool-design principle. All three only ever touch fields
`Style` already has (`x`, `y`, `fontSize`, plus whatever the caller passes
via `update_caption_style`'s `patch`) — no new effect fields are invented.
"""
from __future__ import annotations

from app.schema import Project, StylePatch

from ..contracts import UpdateWordAction, WordPatch
from ..validation import PatchError, apply_patch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    MoveCaptionArgs,
    MoveCaptionResult,
    ScaleCaptionArgs,
    ScaleCaptionResult,
    UpdateCaptionStyleArgs,
    UpdateCaptionStyleResult,
)


def _build_and_validate_style_patch(project: Project, word_id: str, style_patch: StylePatch) -> UpdateWordAction:
    """Build an UPDATE_WORD patch for `word_id` and confirm the resulting
    Project would still be schema-valid, WITHOUT mutating `project`.

    Raises ToolExecutionError (wrapping the underlying PatchError) if
    `word_id` doesn't exist in `project.words`, or if the merged result
    would somehow fail full-Project schema validation.
    """
    patch = UpdateWordAction(wordId=word_id, patch=WordPatch(style=style_patch))
    try:
        apply_patch(project, patch)  # validates only; the returned Project is intentionally discarded
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return patch


def update_caption_style(args: UpdateCaptionStyleArgs, project: Project) -> UpdateCaptionStyleResult:
    """Apply an arbitrary style patch (any subset of Style's own fields —
    color, font, weight, uppercase, glow, shake, gradient, x, y, fontSize)
    to one word."""
    patch = _build_and_validate_style_patch(project, args.wordId, args.patch)
    return UpdateCaptionStyleResult(patch=patch)


def move_caption(args: MoveCaptionArgs, project: Project) -> MoveCaptionResult:
    """Set a word's x/y position only."""
    patch = _build_and_validate_style_patch(project, args.wordId, StylePatch(x=args.x, y=args.y))
    return MoveCaptionResult(patch=patch)


def scale_caption(args: ScaleCaptionArgs, project: Project) -> ScaleCaptionResult:
    """Set a word's font size only."""
    patch = _build_and_validate_style_patch(project, args.wordId, StylePatch(fontSize=args.fontSize))
    return ScaleCaptionResult(patch=patch)


default_registry.register(
    ToolSpec(
        name="update_caption_style",
        description="Apply a style patch (color, font, weight, glow, shake, gradient, etc.) to one word.",
        input_model=UpdateCaptionStyleArgs,
        output_model=UpdateCaptionStyleResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 4. Produces an UpdateWordAction, validated via app.agent.validation.",
    ),
    update_caption_style,
)

default_registry.register(
    ToolSpec(
        name="move_caption",
        description="Set a word's x/y position. Thin wrapper over update_caption_style for clearer LLM tool-selection.",
        input_model=MoveCaptionArgs,
        output_model=MoveCaptionResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 4.",
    ),
    move_caption,
)

default_registry.register(
    ToolSpec(
        name="scale_caption",
        description="Set a word's font size. Thin wrapper over update_caption_style for clearer LLM tool-selection.",
        input_model=ScaleCaptionArgs,
        output_model=ScaleCaptionResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 4.",
    ),
    scale_caption,
)
