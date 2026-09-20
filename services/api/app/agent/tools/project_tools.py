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

from app.schema import Overlay, PresetSegment, Project

from ..preset_catalog import describe_for_tool

from . import preset_segments

from ..contracts import (
    AddOverlayAction,
    AgentPresetOverridePatch,
    AgentStylePatch,
    SetPresetAction,
    SetPresetOverrideAction,
    SetPresetSegmentsAction,
    SetSettingsAction,
    SettingsPatch,
    UpdateWordAction,
    WordPatch,
    _STYLE_KEYS,
)
from ..validation import PatchError, apply_patch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    AddOverlayArgs,
    AddOverlayResult,
    ApplyPresetArgs,
    ApplyPresetResult,
    ResetStylingArgs,
    ResetStylingResult,
    SetPresetOverrideArgs,
    SetPresetOverrideResult,
    SetSettingsArgs,
    SetSettingsResult,
)


def apply_preset(args: ApplyPresetArgs, project: Project) -> ApplyPresetResult:
    """Set the caption look — for the whole video, or for one stretch of it.

    With no range this sets `project.presetId`: the base look, which is what a bare "make it
    Chamak" means. With a range it writes a preset SEGMENT instead, carving the segments it lands
    on (`preset_segments.set_segment` — the mirror of apps/web/src/lib/preset-segments.ts) and
    leaving `presetId` alone, so the rest of the video keeps the look it had.

    `args.presetId` is already a closed PresetId enum (rejected at ApplyPresetArgs construction if
    unknown), so the only way the whole-video form can fail here is if some other part of the
    resulting document were somehow left invalid — kept as a real check, not decorative, via the
    same apply_patch validation boundary every other mutation tool uses.

    A range covering NO WORDS is an error, not a write. The segment would be perfectly valid and
    would change nothing visible, and the turn would report a successful edit for a look the user
    will never see — the honest-failure rule in CLAUDE.md. The same goes for a range that is
    backwards or entirely past the end of the video.
    """
    if (args.startMs is None) != (args.endMs is None):
        raise ToolExecutionError(
            "give both startMs and endMs, or neither: half a range has no meaning"
        )

    if args.startMs is None:
        patch: SetPresetAction | SetPresetSegmentsAction = SetPresetAction(presetId=args.presetId)
        word_ids = [word.id for word in project.words]
    else:
        start, end = args.startMs, args.endMs
        if end <= start:
            raise ToolExecutionError(f"endMs ({end}) must be after startMs ({start})")
        if start >= project.durationMs:
            raise ToolExecutionError(
                f"startMs ({start}) is past the end of the video ({project.durationMs} ms)"
            )
        # A word belongs to the segment containing its START — the same rule the renderer uses
        # (packages/shared/src/project.ts, PresetSegment), so this list is exactly the words that
        # will change on screen.
        word_ids = [word.id for word in project.words if start <= word.startMs < end]
        if not word_ids:
            raise ToolExecutionError(
                f"no words fall between {start} ms and {end} ms, so this would change nothing on "
                "screen — ask which part of the video they mean"
            )
        segment = PresetSegment(
            id=preset_segments.new_segment_id(),
            startMs=start,
            endMs=end,
            presetId=args.presetId,
        )
        patch = SetPresetSegmentsAction(
            presetSegments=preset_segments.set_segment(
                list(project.presetSegments or []), segment, project.durationMs
            )
        )

    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return ApplyPresetResult(patch=patch, wordIds=word_ids)


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

      "make the captions bigger"         -> baseFontSize
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
            ("baseFontSize", args.baseFontSize),
            ("base", args.base),
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
            "nothing to do: set baseFontSize/base/wordsPerLine/emphasis/emphasisScale/reveal/emotion, "
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


def reset_styling(args: ResetStylingArgs, project: Project) -> ResetStylingResult:
    """Put the look back to the preset as it ships.

    "Go back to the original preset" means two different layers, and a creator saying it means
    both: the preset OVERRIDE (emphasis face, emotion styling, reveal, words per line, base size)
    and every per-word style override. They are cleared by two different mechanisms — a whole-object
    null for the first, an explicit null per style key for the second — which is why this exists as
    one tool instead of asking the model to orchestrate it.

    It does NOT change which preset is selected: switching preset is `apply_preset`, and someone
    who says "back to normal" almost never means "and also change the preset".
    """
    patches: list = []

    if args.scope in ("preset_tweaks", "everything"):
        # A whole-object null. `mergePresetOverride` in the reducer reads it as "drop everything".
        patches.append(SetPresetOverrideAction(override=None))

    if args.scope in ("word_styles", "everything"):
        wanted = set(args.wordIds)
        targets = [w for w in project.words if not wanted or w.id in wanted]
        if wanted:
            missing = sorted(wanted - {w.id for w in targets})
            if missing:
                raise ToolExecutionError(f"no such word id(s): {', '.join(missing)}")
        # Only words that actually carry an override — clearing the rest would be a no-op write
        # per word, and on a 94-word reel that is 94 pointless patches in the undo step.
        styled = [w for w in targets if w.style and w.style.model_dump(exclude_none=True)]
        cleared = AgentStylePatch(cleared=sorted(_STYLE_KEYS))
        patches.extend(
            UpdateWordAction(wordId=w.id, patch=WordPatch(style=cleared)) for w in styled
        )

    if not patches:
        raise ToolExecutionError("nothing to reset: the captions are already the preset's own look")

    for patch in patches:
        try:
            apply_patch(project, patch)
        except PatchError as exc:
            raise ToolExecutionError(str(exc)) from exc
    return ResetStylingResult(patches=patches)


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
        description=(
            "Set the caption look. Match the user's vibe words ('trendy', 'subtle', 'loud', "
            "'classy') to a preset using the <presets> catalogue in your instructions, which "
            "describes what each one looks like. With no startMs/endMs this changes the WHOLE "
            "video. Give both to restyle only one stretch of it ('make the intro loud', 'switch "
            "to something calmer after the hook') — the rest keeps the look it has. Times are in "
            "ms; use get_timeline or the transcript to find them. A range covering no words is "
            "refused rather than silently doing nothing."
            + describe_for_tool()
        ),
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
            "own value. `baseFontSize` is the BASE caption size in px at 1080p — this is what "
            "'make the captions bigger/smaller' means. Do NOT answer that by writing fontSize "
            "onto every word: a per-word size is final and overrides the emphasis scale, so it "
            "shrinks the emphasised words and flattens the hierarchy. `base` is the same rule for "
            "every other key — 'make the captions blue/white', 'use Poppins for the captions', "
            "'put the captions at the top', 'add an outline to the captions' all go in `base`. "
            "Writing that colour onto every word with update_caption_style instead turns the "
            "emphasised and angry words that colour too, erasing the preset's hierarchy. Use "
            "update_caption_style only for SPECIFIC words. "
            "Use this for 'fewer words per line', 'make the emphasised words bigger', "
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


default_registry.register(
    ToolSpec(
        name="reset_styling",
        description=(
            "Put the captions back to the preset's own look, undoing styling edits. Use it for "
            "'go back to the original preset', 'reset the captions', 'undo all my styling', "
            "'remove everything I changed', 'back to normal'. `scope` picks how much: "
            "'everything' (the default — both layers, which is what people mean), "
            "'preset_tweaks' (only the conditional layers: emphasis face, emotion styling, "
            "reveal, words per line, base size), or 'word_styles' (only per-word style "
            "overrides). Pass `wordIds` to reset just those words ('put that word back to "
            "normal'); leave it empty for all of them. This does NOT change which preset is "
            "selected — use apply_preset for that. It is a normal edit, so one Ctrl+Z undoes it."
        ),
        input_model=ResetStylingArgs,
        output_model=ResetStylingResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes=(
            "Emits SET_PRESET_OVERRIDE with a whole-object null (the reducer's "
            "`mergePresetOverride(current, null)` clears everything) plus one UPDATE_WORD per "
            "word that actually carries a style override, each clearing every style key."
        ),
    ),
    reset_styling,
)
