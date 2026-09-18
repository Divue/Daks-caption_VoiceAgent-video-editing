"""The project-level mutation tools: `apply_preset`, `set_settings`, and
the deliberately DISABLED `add_overlay`.

Same commit-or-nothing pattern as style_tools.py: build the AgentPatch,
confirm it validates via app.agent.validation.apply_patch (which never
mutates `project`), and only then return the patch — never the mutated
Project itself, since the agent is stateless per request.

`add_overlay` is registered `ToolStatus.DISABLED`, so `tool_config.py`
never puts it in the toolConfig sent to Bedrock and the planner refuses to
execute it even if a model named it anyway. The handler, its spec and its
tests are all still real and still exercised — this is not a deletion. The
reason it is not offered: nothing renders an overlay. The Remotion
composition does not draw `project.overlays`, the editor has no overlay UI,
and `applyAgentPatches` in apps/web/src/hooks/useWordPatch.ts counts
ADD_OVERLAY as `unpersistable` because no API route can save one. Offering
it would let the agent report "added your text box" for a change that
appears nowhere, which is worse than answering UNSUPPORTED. Flip the status
back to AVAILABLE the day any of those three exists.
"""
from __future__ import annotations

import uuid

from app.schema import Overlay, Project

from ..contracts import (
    AddOverlayAction,
    AgentPresetOverridePatch,
    SetPresetAction,
    SetPresetOverrideAction,
    SetSettingsAction,
    SettingsPatch,
)
from ..validation import PatchError, apply_patch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    AddOverlayArgs,
    AddOverlayResult,
    ApplyPresetArgs,
    ApplyPresetResult,
    SetPresetOverrideArgs,
    SetPresetOverrideResult,
    SetSettingsArgs,
    SetSettingsResult,
)


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


def set_settings(args: SetSettingsArgs, project: Project) -> SetSettingsResult:
    """Toggle the project-level caption layers.

    `emojis=false` hides every emoji at once; `emotionLayer=false` turns the
    whole tone layer off — "stop making things red" is this, not a per-word
    colour edit (audit 17 §3.4). Merges per key: whichever of the two is
    omitted is left exactly as it is.

    Raises ToolExecutionError if neither is given. Each field is
    individually valid when absent (both default to None), but a patch that
    names no setting changes nothing and must not be reported as an edit.
    """
    settings = SettingsPatch(emojis=args.emojis, emotionLayer=args.emotionLayer)
    if settings.model_dump(exclude_none=True) == {}:
        raise ToolExecutionError("no settings given: set `emojis`, `emotionLayer`, or both")

    patch = SetSettingsAction(settings=settings)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return SetSettingsResult(patch=patch)



def set_preset_override(args: SetPresetOverrideArgs, project: Project) -> SetPresetOverrideResult:
    """Change the conditional layers of the look.

    These have no per-word home: `Style` is per word and cannot express
    "when this word is emphasised" or "when this run is angry", so none of
    them can be written onto words (audit 17 §4). That makes this the only
    route to four of the most natural things a short-form creator asks for:

      "fewer words per line"            -> wordsPerLine
      "make the emphasised words bigger" -> emphasis / emphasisScale
      "make angry words shake harder"    -> emotion
      "reveal the words one at a time"   -> reveal

    Note the distinction the model must not blur: "make EVERY word Anton" is
    a style write over all word ids; "make the EMPHASISED words Anton" is
    `emphasis.fontFamily` here. They produce different videos.

    Raises ToolExecutionError if the call would change nothing, or if
    `clearKeys` names something that is not an override key.
    """
    set_fields = {
        key: value
        for key, value in (
            ("wordsPerLine", args.wordsPerLine),
            ("emphasis", args.emphasis),
            ("emphasisScale", args.emphasisScale),
            ("reveal", args.reveal),
            ("emotion", args.emotion),
        )
        if value is not None
    }
    if not set_fields and not args.clearKeys:
        raise ToolExecutionError(
            "nothing to do: set wordsPerLine/emphasis/emphasisScale/reveal/emotion, "
            "or name keys in `clearKeys`, or both"
        )

    overlap = sorted(set(set_fields) & set(args.clearKeys))
    if overlap:
        raise ToolExecutionError(f"cannot set and clear the same override key(s): {', '.join(overlap)}")

    try:
        override = AgentPresetOverridePatch(**set_fields, cleared=list(args.clearKeys))
    except ValueError as exc:
        raise ToolExecutionError(f"invalid preset override: {exc}") from exc

    patch = SetPresetOverrideAction(override=override)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return SetPresetOverrideResult(patch=patch)


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
        name="set_settings",
        description=(
            "Toggle the project-level caption layers: `emojis` shows/hides every emoji at once, "
            "`emotionLayer` turns the whole tone (angry/excited) styling on or off. Whichever you "
            "omit is left alone. 'stop making things red' is emotionLayer=false, not a per-word "
            "colour edit."
        ),
        input_model=SetSettingsArgs,
        output_model=SetSettingsResult,
        reads=False,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Produces a SET_SETTINGS patch, which merges per key in the frontend reducer.",
    ),
    set_settings,
)

default_registry.register(
    ToolSpec(
        name="add_overlay",
        description="Add a free-floating overlay caption/text box.",
        input_model=AddOverlayArgs,
        output_model=AddOverlayResult,
        reads=True,
        writes=True,
        status=ToolStatus.DISABLED,
        notes="DISABLED, not deleted — see this module's docstring. Nothing renders or persists an "
        "overlay today, so offering this tool would let the agent claim a change that appears "
        "nowhere; the model is not told it exists and must answer UNSUPPORTED instead. The handler "
        "below is real and still tested. reads=True: it bound-checks against project.durationMs.",
    ),
    add_overlay,
)


default_registry.register(
    ToolSpec(
        name="set_preset_override",
        description=(
            "Change the CONDITIONAL layers of the caption look, which no per-word style can "
            "express: `wordsPerLine` (how many words a caption line holds), `emphasis` (the face "
            "used for a word only WHEN IT IS EMPHASISED) with `emphasisScale` (its size as a "
            "multiple of the base size), `emotion` (what a tone does to the words in its run, e.g. "
            "angry shake or colour), and `reveal` ('none' | 'dim' | 'hidden', how words ahead of "
            "the playhead are drawn). Merges per key; `clearKeys` puts a key back to the preset's "
            "own value. Use this for 'fewer words per line', 'make the emphasised words bigger', "
            "'make angry words shake harder' and 'reveal the words one at a time'. IMPORTANT: "
            "'make every word Anton' is update_caption_style over all word ids; 'make the "
            "EMPHASISED words Anton' is this tool's `emphasis.fontFamily`. They are different."
        ),
        input_model=SetPresetOverrideArgs,
        output_model=SetPresetOverrideResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes=(
            "Project.presetOverride is a stored field (packages/shared/src/project.ts and "
            "app/schema.py, added together). Cleared keys travel as explicit JSON nulls."
        ),
    ),
    set_preset_override,
)
