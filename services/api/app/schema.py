"""Python mirror of packages/shared/src/project.ts. Change both together (lead only)."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Emotion = Literal["neutral", "angry", "excited"]
# Renamed "kathmandu" -> "rangmanch" in schema v2; stored rows are migrated on read
# (store/projects.py MIGRATIONS). Mirrors PresetId in packages/shared/src/project.ts.
PresetId = Literal[
    "rangmanch", "chamak", "nazm", "dhamaka", "mrbeast", "minimal", "hinglish-bold",
]
TextCase = Literal["none", "upper", "lower"]


class GradientStop(BaseModel):
    color: str
    at: float = Field(ge=0, le=100)


class StylePatch(BaseModel):
    """Partial Style: every field optional (used for overrides, overlays and agent patches)."""
    fontFamily: Optional[str] = None
    fontSize: Optional[float] = Field(default=None, gt=0)
    color: Optional[str] = None
    gradient: Optional[tuple[str, str]] = None
    # More than two stops; wins over `gradient` when both are set.
    gradientStops: Optional[list[GradientStop]] = Field(default=None, min_length=2)
    weight: Optional[int] = Field(default=None, ge=100, le=900)
    italic: Optional[bool] = None
    # Replaced `uppercase: Optional[bool]` in schema v2 (one preset forces lowercase).
    textCase: Optional[TextCase] = None
    glow: Optional[float] = Field(default=None, ge=0)
    glowColor: Optional[str] = None
    strokeWidth: Optional[float] = Field(default=None, ge=0)
    strokeColor: Optional[str] = None
    # em-relative, not px: it must survive the renderer's frame scaling.
    letterSpacing: Optional[float] = None
    lineHeight: Optional[float] = Field(default=None, gt=0)
    shake: Optional[float] = Field(default=None, ge=0)
    x: Optional[float] = Field(default=None, ge=0, le=100)
    y: Optional[float] = Field(default=None, ge=0, le=100)


class Signals(BaseModel):
    loudnessZ: float
    pitchZ: float
    durationRatio: float
    extraMs: float = 0.0


class Word(BaseModel):
    id: str
    text: str
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    emphasis: bool
    emotion: Emotion
    stretch: float = Field(ge=1)
    # Show this word on its own instead of inside its caption block. Grouping, not style:
    # packages/shared/src/blocks.ts reads it (rule 4). The pipeline never sets it; only an
    # editor or agent edit does. Optional, like `emoji` — absent == false.
    single: Optional[bool] = None
    emoji: Optional[str] = None
    style: Optional[StylePatch] = None
    signals: Optional[Signals] = None


class Overlay(BaseModel):
    id: str
    text: str
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    style: StylePatch


class Settings(BaseModel):
    emojis: bool
    emotionLayer: bool


# Mirrors RevealMode in packages/shared/src/presets.ts, inlined in PresetOverride there too.
RevealMode = Literal["none", "dim", "hidden"]


class EmotionOverride(BaseModel):
    """One emotion's persisted contribution. `scale` is a multiplier, never a px size."""
    style: StylePatch
    scale: Optional[float] = Field(default=None, gt=0)


class PresetOverride(BaseModel):
    """Mirror of packages/shared/src/project.ts's PresetOverride."""

    """Persisted tweaks to the active preset's CONDITIONAL layers. Mirrors PresetOverride in
    packages/shared/src/project.ts — an explicit allow-list, deliberately NOT a partial Preset.

    `Preset` is code-only so it can grow with no mirror and no migration; a property only moves
    here when a user/agent command has to survive a reload. `emotion` is a PARTIAL map (the zod
    side needs `z.partialRecord`, because zod v4's `z.record(enum, …)` demands every key).
    """
    # See project.ts: 'bigger' must move the BASE size, never every word's own size,
    # or the emphasis hierarchy collapses.
    baseFontSize: Optional[float] = Field(default=None, gt=0)
    wordsPerLine: Optional[int] = Field(default=None, ge=1, le=8)
    emphasis: Optional[StylePatch] = None
    emphasisScale: Optional[float] = Field(default=None, gt=0)
    reveal: Optional[RevealMode] = None
    emotion: Optional[dict[Emotion, EmotionOverride]] = None


class Project(BaseModel):
    id: str
    videoUrl: str
    durationMs: int = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    presetId: PresetId
    # Optional and additive: stored v2 documents parse unchanged, so no migration and no
    # SCHEMA_VERSION bump (store/projects.py MIGRATIONS).
    presetOverride: Optional[PresetOverride] = None
    words: list[Word]
    overlays: list[Overlay]
    settings: Settings
