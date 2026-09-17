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

from typing import Literal

from pydantic import BaseModel, Field

from app.schema import PresetId, Settings, StylePatch

from ..contracts import AddOverlayAction, SetPresetAction, UpdateWordAction


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
    wordId: str
    patch: StylePatch


class UpdateCaptionStyleResult(BaseModel):
    patch: UpdateWordAction


# --- move_caption --------------------------------------------------------------
class MoveCaptionArgs(BaseModel):
    wordId: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class MoveCaptionResult(BaseModel):
    patch: UpdateWordAction


# --- scale_caption --------------------------------------------------------------
class ScaleCaptionArgs(BaseModel):
    wordId: str
    fontSize: float = Field(gt=0)


class ScaleCaptionResult(BaseModel):
    patch: UpdateWordAction


# --- apply_preset -----------------------------------------------------------
class ApplyPresetArgs(BaseModel):
    presetId: PresetId


class ApplyPresetResult(BaseModel):
    patch: SetPresetAction


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
    box can feed directly into move_caption without unit conversion."""

    label: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0, le=100)
    height: float = Field(ge=0, le=100)


class AnalyzeFrameResult(BaseModel):
    found: bool
    boxes: list[BoundingBox] = Field(default_factory=list)
