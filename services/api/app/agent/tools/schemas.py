"""Phase 2: argument/result SHAPES for the planned tools — data only, no
behavior. Each model declares what a future phase's handler will accept and
return; none of them are attached to logic yet (see catalog.py, where every
tool using these is registered as ToolStatus.PLANNED with no handler).

Built from app/schema.py types (StylePatch, PresetId, Settings) and Phase
1's contracts.py action shapes (UpdateWordAction, SetPresetAction,
AddOverlayAction) so a tool's result is always expressed as "the patch it
would produce" — never a separate, parallel representation of a project
mutation.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schema import Emotion, EmotionOverride, PresetId, Settings, StylePatch

from ..contracts import (
    AddOverlayAction,
    SetLayersAction,
    SetPresetAction,
    SetPresetOverrideAction,
    SetSettingsAction,
    UpdateWordAction,
)

# Every mutating tool takes `wordIds`, never a single `wordId`: one call
# must be able to restyle a whole line or the whole transcript, and a
# single id is just the degenerate case. Fewer round trips also means
# fewer chances for the model to miscount — audit 17 §2, "never let the
# model count."
WordIds = Annotated[list[str], Field(min_length=1)]


class WordPatchesResult(BaseModel):
    """What every per-word mutation tool returns: one UPDATE_WORD patch per
    targeted word, in the order the ids were given (duplicates collapsed).
    `patches`, not `patch`, is what the planner accumulates into
    AgentCommandResponse.patches."""

    patches: list[UpdateWordAction]


class TimelineWord(BaseModel):
    """A word as returned by a read-only context tool: enough to TARGET a later
    mutation, including targeting by how it looks.

    This used to omit emphasis and emotion on the theory that "a targeting step
    doesn't need" them. It does. "Make the WHITE words bigger" and "change the
    red ones" select by rendered appearance, and a word's colour comes from its
    own override, the preset's emphasis face if it is emphasised, and the tone
    tint if it is angry or excited. Without these fields the agent could not
    tell which words were white: asked to resize "the white font from 10 to
    12 s" it resized all six words in range, three of which render red.

    Still deliberately not the full Word — no `signals`, no full `style`.
    Combine these with <active_preset> to work out what a word looks like.
    """

    wordId: str
    text: str
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    emphasis: bool = False
    emotion: str = "neutral"
    # The word's OWN colour override, if it has one. Absent means it takes its
    # colour from the preset (base, emphasis face, or tone tint).
    colorOverride: str | None = None
    fontSizeOverride: float | None = None


# --- get_project_context ---------------------------------------------------
class GetProjectContextArgs(BaseModel):
    """No arguments: this tool summarizes the Project already in scope."""


class GetProjectContextResult(BaseModel):
    durationMs: int
    width: int
    height: int
    presetId: PresetId
    settings: Settings
    wordCount: int


# --- get_timeline ------------------------------------------------------------
class GetTimelineArgs(BaseModel):
    fromMs: int | None = Field(default=None, ge=0)
    toMs: int | None = Field(default=None, ge=0)


class GetTimelineResult(BaseModel):
    words: list[TimelineWord]


# --- find_words --------------------------------------------------------------
class FindWordsArgs(BaseModel):
    """`fuzzy` exists because every command may arrive through a speech recogniser. Hinglish
    words and names are mangled constantly ("birthday" came back as "but the two"), so a target
    that is not in the transcript verbatim usually means it was MISHEARD, not that the user meant
    something else."""

    query: str = Field(min_length=1)
    matchType: Literal["exact", "contains", "fuzzy"] = "contains"


class FindWordsResult(BaseModel):
    matches: list[TimelineWord]


# --- update_caption_style -----------------------------------------------------
class UpdateCaptionStyleArgs(BaseModel):
    """`patch` SETS style keys; `clearKeys` REMOVES them. They are two
    different operations and cannot be expressed by one argument: a key
    given as null inside `patch` is indistinguishable from a key that was
    simply not mentioned, which is exactly the bug the style-override
    contract (audit 15 §4) exists to prevent."""

    wordIds: WordIds
    patch: StylePatch = Field(default_factory=StylePatch)
    clearKeys: list[str] = Field(default_factory=list)


class UpdateCaptionStyleResult(WordPatchesResult):
    pass


# --- set_position --------------------------------------------------------------
class SetPositionArgs(BaseModel):
    wordIds: WordIds
    position: Literal["top", "middle", "bottom"]


class SetPositionResult(WordPatchesResult):
    pass


# --- set_text ------------------------------------------------------------------
class SetTextArgs(BaseModel):
    wordIds: WordIds
    text: str = Field(min_length=1)


class SetTextResult(WordPatchesResult):
    pass


# --- set_emphasis ---------------------------------------------------------------
class SetEmphasisArgs(BaseModel):
    wordIds: WordIds
    emphasis: bool


class SetEmphasisResult(WordPatchesResult):
    pass


# --- set_emotion ----------------------------------------------------------------
class SetEmotionArgs(BaseModel):
    wordIds: WordIds
    emotion: Emotion


class SetEmotionResult(WordPatchesResult):
    pass


# --- set_stretch ----------------------------------------------------------------
class SetStretchArgs(BaseModel):
    wordIds: WordIds
    stretch: float = Field(ge=1)


class SetStretchResult(WordPatchesResult):
    pass


# --- set_single -----------------------------------------------------------------
class SetSingleArgs(BaseModel):
    wordIds: WordIds
    single: bool | None = None


class SetSingleResult(WordPatchesResult):
    pass


# --- set_emoji ------------------------------------------------------------------
class SetEmojiArgs(BaseModel):
    wordIds: WordIds
    emoji: str


class SetEmojiResult(WordPatchesResult):
    pass


# --- shift_timing ---------------------------------------------------------------
class ShiftTimingArgs(BaseModel):
    wordIds: WordIds
    deltaMs: int


class ShiftTimingResult(WordPatchesResult):
    pass


# --- emphasise_peaks -------------------------------------------------------------
class EmphasisePeaksArgs(BaseModel):
    scope: Literal["all", "selection"] = "all"
    fromMs: int | None = Field(default=None, ge=0)
    toMs: int | None = Field(default=None, ge=0)


class EmphasisePeaksResult(WordPatchesResult):
    lineCount: int
    peakWordIds: list[str]
    alreadyEmphasisedWordIds: list[str]


# --- apply_preset -----------------------------------------------------------
class ApplyPresetArgs(BaseModel):
    presetId: PresetId


class ApplyPresetResult(BaseModel):
    patch: SetPresetAction


# --- set_settings -------------------------------------------------------------
class SetSettingsArgs(BaseModel):
    """Project-level toggles, merged per key: an omitted key is untouched.
    At least one must be given (checked by the handler — "no arguments at
    all" is individually valid per field but means nothing)."""

    emojis: bool | None = None
    emotionLayer: bool | None = None


class SetSettingsResult(BaseModel):
    patch: SetSettingsAction


# --- set_preset_override -----------------------------------------------------
class SetPresetOverrideArgs(BaseModel):
    """The CONDITIONAL layers of the look, which no per-word style key can
    express because `Style` cannot say "when emphasised" or "when angry".

    Merged per key over any existing override; `clearKeys` puts a key back
    to the preset's own value. At least one of the two must do something.
    """

    baseFontSize: Annotated[
        float | None,
        Field(default=None, gt=0, description="The BASE caption size in px at 1080p."),
    ]
    base: Annotated[
        StylePatch | None,
        Field(
            default=None,
            description=(
                "The BASE face every word starts from: colour, font, weight, position, stroke, "
                "glow. Emphasised and toned words keep their own layers on top of it."
            ),
        ),
    ]
    wordsPerLine: Annotated[int | None, Field(default=None, ge=1, le=8)]
    emphasis: Annotated[
        StylePatch | None,
        Field(default=None, description="The face used for a word WHEN IT IS EMPHASISED."),
    ]
    emphasisScale: Annotated[
        float | None,
        Field(default=None, gt=0, description="Emphasis size as a multiple of the base size."),
    ]
    reveal: Annotated[
        Literal["none", "dim", "hidden"] | None,
        Field(default=None, description="How words ahead of the playhead are drawn."),
    ]
    emotion: Annotated[
        dict[Emotion, EmotionOverride] | None,
        Field(default=None, description="What a tone does to the words in its run."),
    ]
    clearKeys: Annotated[
        list[str],
        Field(default_factory=list, description="Override keys to remove, back to the preset."),
    ]


class SetPresetOverrideResult(BaseModel):
    patch: SetPresetOverrideAction


# --- reset_styling -----------------------------------------------------------
class ResetStylingArgs(BaseModel):
    """Put the look back to the preset as it ships.

    Two independent layers can hold edits, and "go back to the original" almost always means
    both: the preset OVERRIDE (the conditional layers) and every per-word style override.
    Clearing them one key and one word at a time is possible but takes many calls and is easy to
    leave half-done, which is worse than not offering it.
    """

    scope: Literal["preset_tweaks", "word_styles", "everything"] = "everything"
    #: Limit the word half to these words ("put THAT word back to normal"). Empty means all of them.
    wordIds: list[str] = Field(default_factory=list)


class ResetStylingResult(BaseModel):
    #: Spelled out rather than reusing `AgentPatch`: this module deliberately imports the concrete
    #: action types, and a forward reference to the union would leave the model undefined here.
    patches: list[SetPresetOverrideAction | UpdateWordAction]


# --- add_overlay -------------------------------------------------------------
class AddOverlayArgs(BaseModel):
    text: str
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    style: StylePatch


class AddOverlayResult(BaseModel):
    patch: AddOverlayAction


# --- analyze_frame -----------------------------------------------------------
class AnalyzeFrameArgs(BaseModel):
    atMs: int = Field(ge=0)
    target: Literal["person", "face", "hand"] = "person"


class BoundingBox(BaseModel):
    """Normalized 0-100 x/y/width/height — same units as Style.x/y, so a
    box can feed straight into update_caption_style's `patch` without unit
    conversion."""

    label: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0, le=100)
    height: float = Field(ge=0, le=100)


class AnalyzeFrameResult(BaseModel):
    found: bool
    boxes: list[BoundingBox] = Field(default_factory=list)


# --- select_word_range ---------------------------------------------------------
class SelectWordRangeArgs(BaseModel):
    """"From the word X to the word Y" — a contiguous run of words.

    This exists because the alternative is the model COUNTING, which the system prompt
    forbids and which fails on a real transcript: two find_words calls give the endpoints,
    and everything between them would have to be enumerated by eye from a 132-word timeline.
    One call resolves both ends and returns every id in between, in playback order.

    `fromNearMs`/`toNearMs` disambiguate a repeated word. "The word 'like' near 27 seconds"
    is a real request on a real transcript where 'like' occurs four times; without the hint
    the first occurrence wins, which is usually not the one meant.
    """

    fromText: str = Field(min_length=1, description="The text of the FIRST word in the range.")
    toText: str = Field(min_length=1, description="The text of the LAST word in the range (inclusive).")
    fromNearMs: int | None = Field(
        default=None, ge=0, description="Roughly when the first word is said, if the user said so."
    )
    toNearMs: int | None = Field(
        default=None, ge=0, description="Roughly when the last word is said, if the user said so."
    )


class SelectWordRangeResult(BaseModel):
    wordIds: list[str]
    words: list[TimelineWord]
    fromWordId: str
    toWordId: str


# --- ramp_caption_size ---------------------------------------------------------
class RampCaptionSizeArgs(BaseModel):
    """A size that CHANGES across a run of words — "each word bigger than the last".

    update_caption_style cannot express this: its `patch` is one value applied to every id.
    Sizes are px at 1080p, the same unit as Style.fontSize and the preset's baseFontSize
    (which <active_preset> gives you). The ramp is linear across `wordIds` in the order
    given, first word exactly `startFontSize`, last exactly `endFontSize`.
    """

    wordIds: WordIds
    startFontSize: float = Field(gt=0, le=400, description="Size of the FIRST word, px at 1080p.")
    endFontSize: float = Field(gt=0, le=400, description="Size of the LAST word, px at 1080p.")


class RampCaptionSizeResult(WordPatchesResult):
    #: What each word ended up at, so the planner can report it honestly rather than guess.
    fontSizes: list[float]


# --- place_sticker -------------------------------------------------------------
class PlaceStickerArgs(BaseModel):
    """Put a built-in emoji sticker onto something in the video, over a time range.

    The sticker FOLLOWS the target: the frame is analysed once per `everyMs` and one layer
    item is produced per sample, each positioned and sized on that sample's box. Five
    seconds at the default step is five items, which is how a static-transform layer
    approximates tracking without the schema growing keyframes.
    """

    emoji: str = Field(min_length=1, description="Which sticker, by name or the emoji character.")
    fromMs: int = Field(ge=0)
    toMs: int = Field(ge=0)
    target: Literal["face", "person", "hand"] = "face"
    everyMs: int = Field(default=1000, ge=200, le=5000, description="How often to re-find the target.")
    scale: float = Field(
        default=1.0, gt=0, le=4, description="Size relative to the detected box (1 = cover it)."
    )


class StickerSample(BaseModel):
    """One analysed moment — reported so the planner can say what it actually found."""

    atMs: int
    found: bool
    x: float | None = None
    y: float | None = None
    width: float | None = None


class PlaceStickerResult(BaseModel):
    patch: SetLayersAction
    emoji: str
    samples: list[StickerSample]
    placed: int


# --- fit_captions_to_region -----------------------------------------------------
class FitCaptionsToRegionArgs(BaseModel):
    """Move and resize the captions in a time range so they sit inside something in the
    frame — "put the captions on my hand and make them fit".

    Per-word, because that is the only thing that can be written: a caption line's anchor
    comes from its first word, so every word in range is given the same x/y (whichever word
    leads a line then carries the right anchor) and a fontSize computed to fit the box.
    """

    fromMs: int = Field(ge=0)
    toMs: int = Field(ge=0)
    target: Literal["face", "person", "hand"] = "hand"
    everyMs: int = Field(default=1000, ge=200, le=5000)
    wordsPerLine: int = Field(
        default=3, ge=1, le=8,
        description="The preset's words per line — <active_preset> carries it. Decides how wide a line is.",
    )
    fillRatio: float = Field(
        default=0.9, gt=0, le=1, description="How much of the box's width the text should use."
    )


class FitCaptionsToRegionResult(WordPatchesResult):
    samples: list[StickerSample]
    #: wordId -> the px size it was given, for an honest summary.
    fontSizes: dict[str, float]

