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
    """A word as returned by a read-only context tool — enough to target a
    later mutation tool, not the full Word (which also carries emphasis,
    emotion, stretch, style, signals that a targeting step doesn't need)."""

    wordId: str
    text: str
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)


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
    query: str = Field(min_length=1)
    matchType: Literal["exact", "contains"] = "contains"


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
    target: Literal["person", "face"] = "person"


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
