"""The per-word STYLE mutation tools: `update_caption_style`, `set_position`.

Both take `wordIds: list[str]` and return one UPDATE_WORD patch per word,
built and validated through `word_targets.build_word_patches` — the same
commit-or-nothing boundary every mutation tool uses. Nothing here persists
anything; the agent returns patches for the frontend's own reducer.

`move_caption` and `scale_caption` used to live here. They were deleted:
both were thin wrappers that narrowed `update_caption_style`'s `StylePatch`
to one concern, and a smaller set of well-described tools selects better
than a larger set of near-duplicates. Their entire effect is
`update_caption_style(wordIds, {"x": ..., "y": ...})` and
`update_caption_style(wordIds, {"fontSize": ...})`. `set_position` replaces
the vague half of `move_caption` ("move the captions up") with three named
anchors, which is what people actually ask for.
"""
from __future__ import annotations

from app.schema import Project, StylePatch

from ..contracts import AgentStylePatch, WordPatch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    RampCaptionSizeArgs,
    RampCaptionSizeResult,
    SetPositionArgs,
    SetPositionResult,
    UpdateCaptionStyleArgs,
    UpdateCaptionStyleResult,
)
from .word_targets import build_word_patches, resolve_words

# `Style.y` is a percentage of frame height (0-100), per root CLAUDE.md.
# Chosen to sit inside a safe margin at both ends and to bracket the
# presets' own anchors (packages/shared/src/presets.ts uses y: 34 for the
# top-stacked look and y: 70 for the centred one), so "put the captions at
# the top" lands above every preset's default and "at the bottom" below it,
# without colliding with short-form UI chrome at the very edges.
POSITION_Y = {"top": 25.0, "middle": 50.0, "bottom": 75.0}


def update_caption_style(args: UpdateCaptionStyleArgs, project: Project) -> UpdateCaptionStyleResult:
    """Set and/or REMOVE style keys on one or many words.

    Two distinct operations, two distinct arguments:
    - `patch` sets keys (color, fontFamily, fontSize, weight, italic,
      textCase, glow, glowColor, stroke*, letterSpacing, lineHeight, shake,
      gradient, gradientStops, x, y).
    - `clearKeys` removes keys, so the word falls back to the preset's
      value. Each named key lands on the wire as an explicit JSON `null`,
      which is what the style-override contract removes an override on
      (audit 15 §4); an omitted key is left untouched.

    Raises ToolExecutionError if neither argument would change anything, or
    if `clearKeys` names something that isn't a style key — both are
    individually-valid-but-meaningless calls that Pydantic can't catch.
    """
    set_fields = args.patch.model_dump(exclude_none=True)
    if not set_fields and not args.clearKeys:
        raise ToolExecutionError("nothing to do: give `patch` keys to set, `clearKeys` keys to remove, or both")

    overlap = sorted(set(set_fields) & set(args.clearKeys))
    if overlap:
        raise ToolExecutionError(f"cannot set and clear the same style key(s): {', '.join(overlap)}")

    try:
        style = AgentStylePatch(**set_fields, cleared=list(args.clearKeys))
    except ValueError as exc:
        raise ToolExecutionError(f"invalid clearKeys: {exc}") from exc

    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(style=style))
    return UpdateCaptionStyleResult(patches=patches)


def set_position(args: SetPositionArgs, project: Project) -> SetPositionResult:
    """Move one or many words to a named vertical anchor (top / middle /
    bottom), as a percentage of frame height."""
    style = StylePatch(y=POSITION_Y[args.position])
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(style=style))
    return SetPositionResult(patches=patches)


def ramp_caption_size(args: RampCaptionSizeArgs, project: Project) -> RampCaptionSizeResult:
    """Grow (or shrink) the words across a run, first to last.

    "Each word bigger than the one before" is not expressible with update_caption_style,
    whose `patch` is ONE value written to every id. The sizes are interpolated linearly over
    `wordIds` IN THE ORDER GIVEN — which is playback order when the ids came from
    select_word_range — so the first word lands exactly on `startFontSize` and the last
    exactly on `endFontSize`.

    A single id is legal and simply gets `startFontSize`; interpolating over one point has
    no meaningful answer and guessing one would be worse than the obvious behaviour.

    Per-word fontSize is FINAL: it beats the preset's emphasis scale, which is the intended
    effect here (a deliberate ramp should not be re-sorted by which words happen to be
    emphasised) and the reason the system prompt keeps per-word sizing away from "make all
    the captions bigger".
    """
    count = len(args.wordIds)
    span = args.endFontSize - args.startFontSize
    sizes = [
        round(args.startFontSize + (span * index / (count - 1) if count > 1 else 0), 1)
        for index in range(count)
    ]
    # Zip against the RESOLVED ids rather than args.wordIds: build_word_patches collapses
    # duplicates, so a repeated id would otherwise slide every later word onto the wrong size.
    resolved = [word.id for word in resolve_words(project, args.wordIds)]
    if len(resolved) != count:
        sizes = [
            round(args.startFontSize + (span * index / (len(resolved) - 1) if len(resolved) > 1 else 0), 1)
            for index in range(len(resolved))
        ]
    by_id = dict(zip(resolved, sizes))

    patches = build_word_patches(
        project, resolved, lambda word: WordPatch(style=AgentStylePatch(fontSize=by_id[word.id]))
    )
    return RampCaptionSizeResult(patches=patches, fontSizes=sizes)


default_registry.register(
    ToolSpec(
        name="update_caption_style",
        description=(
            "Set and/or remove style keys on one or many words at once. `patch` SETS keys "
            "(color, fontFamily, fontSize, weight, italic, textCase, glow, glowColor, strokeWidth, "
            "strokeColor, letterSpacing, lineHeight, shake, gradient, gradientStops, x, y). "
            "`clearKeys` REMOVES keys so the word goes back to the preset's look — use it for "
            "'remove the colour', 'take the glow off', 'put it back to normal'. Setting a key to "
            "null in `patch` does NOT remove it; only `clearKeys` does. Pass every word id you want "
            "changed in one call."
        ),
        input_model=UpdateCaptionStyleArgs,
        output_model=UpdateCaptionStyleResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Returns one UpdateWordAction per word id, validated via app.agent.validation.",
    ),
    update_caption_style,
)

default_registry.register(
    ToolSpec(
        name="set_position",
        description=(
            "Move one or many words to the top, middle or bottom of the frame. Use this for "
            "'move the captions up', 'put them at the bottom'. For an exact position use "
            "update_caption_style's x/y instead."
        ),
        input_model=SetPositionArgs,
        output_model=SetPositionResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes=f"Maps to Style.y = {POSITION_Y} (percent of frame height).",
    ),
    set_position,
)

default_registry.register(
    ToolSpec(
        name="ramp_caption_size",
        description=(
            "Give a run of words a size that CHANGES word by word — 'each word bigger than the "
            "last', 'make them grow', 'start small and get huge'. Sizes are px at 1080p and "
            "interpolate linearly from startFontSize (first id) to endFontSize (last id), so pass "
            "the ids in playback order — select_word_range already returns them that way. Read the "
            "preset's baseFontSize from <active_preset> to choose sensible ends; a growth ramp "
            "usually starts at about the base size and finishes 2-3x it. update_caption_style "
            "cannot do this: its patch writes ONE size to every word."
        ),
        input_model=RampCaptionSizeArgs,
        output_model=RampCaptionSizeResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Linear interpolation over the resolved ids; per-word fontSize overrides emphasisScale.",
    ),
    ramp_caption_size,
)
