"""Phase 1: request/response contracts for the AI agent.

These are the shapes crossing the boundary between apps/web and this agent
module — not the shared Project document itself. `app/schema.py` (lead-owned,
mirrors packages/shared/src/project.ts) is imported and reused, never
duplicated or modified here.

See .claude/audits/ai-agent/phase-01-agent-contracts.md for the reasoning
behind these shapes.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, SerializeAsAny, field_serializer, field_validator, model_serializer

from app.schema import LayerItem, Overlay, PresetId, PresetOverride, Signals, StylePatch, Project

# The sentinel a patch carries for "remove this key", for fields whose real
# type has no spare value to mean it (`single: bool | None`). `emoji` uses
# the empty string instead, because that is already the editor's own
# cleared value (apps/web/src/hooks/useWordPatch.ts `toWordPatch`: `emoji
# === '' ? null : emoji`), and mirroring it keeps one convention, not two.
#
# WHY A SENTINEL AT ALL, instead of just `None`. Both agent routes serialize
# with `response_model_exclude_none=True` (router.py), and
# `validation.apply_patch` merges with `exclude_none=True`, because an
# UNTOUCHED optional serializing as JSON null would blank a real field
# through the frontend reducer's `{ ...word, ...patch }` spread. But the
# style-override contract is the opposite for a field the caller DID name:
# "a value sets the key, an explicit null REMOVES it, an absent key leaves
# it untouched" (.claude/audits/15 §4; `_merge_style` in
# services/api/app/store/projects.py). Those two rules only coexist if
# "clear" is a value that is NOT `None` in Python but serializes TO `None` —
# exclusion is decided on the pre-serializer value, so a field serializer
# that maps the sentinel to `None` survives both exclude_none passes and
# lands on the wire as a real JSON `null`. Verified over HTTP in
# tests/test_router.py, against the raw response dict.
CLEAR = "__clear__"

_STYLE_KEYS = frozenset(StylePatch.model_fields)
_PRESET_OVERRIDE_KEYS = frozenset(PresetOverride.model_fields)


class AgentStylePatch(StylePatch):
    """A `StylePatch` that can also REMOVE style keys.

    `StylePatch` (app/schema.py, lead-owned) is subclassed, never modified:
    every field, type and range it declares is inherited untouched, and the
    only addition is `cleared`, a list of key names this patch removes.
    `cleared` is `exclude=True`, so it never appears on the wire itself —
    the wrap serializer below turns each named key into an explicit JSON
    `null`, which is exactly what the style-override contract removes a key
    on.
    """

    cleared: list[str] = Field(default_factory=list, exclude=True)

    @field_validator("cleared")
    @classmethod
    def _keys_must_be_real_style_fields(cls, value: list[str]) -> list[str]:
        unknown = [key for key in value if key not in _STYLE_KEYS]
        if unknown:
            raise ValueError(f"not style keys: {', '.join(sorted(unknown))}")
        return value

    @model_serializer(mode="wrap")
    def _serialize_with_explicit_nulls(self, handler) -> dict[str, Any]:
        data = handler(self)
        for key in self.cleared:
            data[key] = None
        return data


class AgentPresetOverridePatch(PresetOverride):
    """A `PresetOverride` that can also REMOVE override keys.

    Same relationship to `PresetOverride` that `AgentStylePatch` has to
    `StylePatch`, and for the same reason: the override merges per key, so
    "put the line length back to the preset's" is an explicit JSON `null`
    on that key, not an omitted key. `cleared` is `exclude=True` and never
    appears on the wire; the wrap serializer turns each named key into a
    real null, which survives `response_model_exclude_none=True` because it
    is written after exclusion runs.
    """

    cleared: list[str] = Field(default_factory=list, exclude=True)

    @field_validator("cleared")
    @classmethod
    def _keys_must_be_real_override_fields(cls, value: list[str]) -> list[str]:
        unknown = [key for key in value if key not in _PRESET_OVERRIDE_KEYS]
        if unknown:
            raise ValueError(f"not preset-override keys: {', '.join(sorted(unknown))}")
        return value

    @model_serializer(mode="wrap")
    def _serialize_with_explicit_nulls(self, handler) -> dict[str, Any]:
        data = handler(self)
        for key in self.cleared:
            data[key] = None
        return data


class SettingsPatch(BaseModel):
    """Partial `Settings` — the same relationship to Settings that
    StylePatch has to Style. Merges per key: an omitted key is untouched
    (audit 17 §3.4)."""

    emojis: bool | None = None
    emotionLayer: bool | None = None


class WordPatch(BaseModel):
    """Partial Word — the same relationship to Word that StylePatch already
    has to Style in app/schema.py. Mirrors the frontend's UPDATE_WORD action,
    whose `patch` argument is `Partial<Word>`
    (apps/web/src/state/project-reducer.ts).

    Lives here, not in app/schema.py: it is a contract of the agent's
    patches, not part of the shared Project document itself, so it does not
    require lead sign-off to define or change.
    """

    text: str | None = None
    startMs: int | None = Field(default=None, ge=0)
    endMs: int | None = Field(default=None, ge=0)
    emphasis: bool | None = None
    emotion: Literal["neutral", "angry", "excited"] | None = None
    stretch: float | None = Field(default=None, ge=1)
    # `CLEAR` removes the key (the word goes back to "not pulled out"); see
    # CLEAR's comment above for why a plain None cannot mean that.
    single: bool | Literal["__clear__"] | None = None
    # `""` removes the key — the editor's own cleared value for an emoji.
    emoji: str | None = None
    # SerializeAsAny so an `AgentStylePatch` assigned here serializes with
    # ITS serializer (the explicit-null one) rather than being flattened to
    # the declared `StylePatch`. A plain `StylePatch` still works unchanged.
    style: SerializeAsAny[StylePatch] | None = None
    signals: Signals | None = None

    @field_serializer("single")
    def _serialize_single(self, value: bool | str | None) -> bool | None:
        return None if value == CLEAR else value

    @field_serializer("emoji")
    def _serialize_emoji(self, value: str | None) -> str | None:
        return None if value == "" else value


class UpdateWordAction(BaseModel):
    """Mirrors apps/web's `{ type: 'UPDATE_WORD', wordId, patch }` action."""

    type: Literal["UPDATE_WORD"] = "UPDATE_WORD"
    wordId: str
    patch: WordPatch


class SetPresetAction(BaseModel):
    """Mirrors apps/web's `{ type: 'SET_PRESET', presetId }` action."""

    type: Literal["SET_PRESET"] = "SET_PRESET"
    presetId: PresetId


class SetSettingsAction(BaseModel):
    """Mirrors apps/web's `{ type: 'SET_SETTINGS', settings }` action
    (apps/web/src/state/project-reducer.ts), which already exists in the
    frontend reducer AND in its `AgentPatch` union — the reducer case
    `{ ...project, settings: { ...project.settings, ...patch.settings } }`
    merges per key, so a patch carrying only `emojis` leaves `emotionLayer`
    alone."""

    type: Literal["SET_SETTINGS"] = "SET_SETTINGS"
    settings: SettingsPatch


class SetPresetOverrideAction(BaseModel):
    """Mirrors apps/web's `{ type: 'SET_PRESET_OVERRIDE', override }` action.

    This is the ONLY way to reach the conditional layers — the emphasis
    face, per-emotion styling, reveal mode and words-per-line. They are not
    per-word `Style` keys (a word cannot say "when emphasised"), so
    "make the emphasised words bigger" and "fewer words per line" are this
    action, and are NOT expressible as a style write over every word. The
    distinction is real and must not be blurred (audit 17 §4).
    """

    type: Literal["SET_PRESET_OVERRIDE"] = "SET_PRESET_OVERRIDE"
    #: `None` means "clear every override, put it back to the preset" — the whole-object null the
    #: reducer's `mergePresetOverride(current, null)` has always understood. The contract simply
    #: could not say it until now, so "go back to the original preset" had no single expression.
    override: AgentPresetOverridePatch | None

    @model_serializer(mode="wrap")
    def _keep_a_whole_object_null(self, handler) -> dict[str, Any]:
        """Put `override: null` back after exclusion, the same trick `cleared` uses above.

        `response_model_exclude_none=True` would otherwise drop the key entirely, and an ABSENT
        override is not the same instruction as a null one: the reducer clears on `=== null` and
        would throw on `undefined`. Verified on the wire, not assumed — the first version of this
        shipped `{"type": "SET_PRESET_OVERRIDE"}` with the null silently stripped.
        """
        data = handler(self)
        if self.override is None:
            data["override"] = None
        return data


class AddOverlayAction(BaseModel):
    """Mirrors apps/web's `{ type: 'ADD_OVERLAY', overlay }` action."""

    type: Literal["ADD_OVERLAY"] = "ADD_OVERLAY"
    overlay: Overlay


# The agent only ever emits these five action shapes. SET_PROJECT, UNDO and
# REDO exist in the frontend reducer but are not agent outputs: SET_PROJECT
# is a full replace (not a patch), and UNDO/REDO are user history controls,
# not something a command produces.
#
# ADD_OVERLAY stays in the union (the shape is still valid and
# validation.py still applies it) even though `add_overlay` is no longer
# offered to the model — see tools/project_tools.py for why.
class SetLayersAction(BaseModel):
    """Mirrors apps/web's `{ type: 'SET_LAYERS', layers }` action: the media layers as the whole
    list they should now be. A split or a delete has no clean per-item expression, and the list is
    small (≤ MAX_LAYER_ITEMS), so every layer tool returns the finished list. `[]` removes them."""

    type: Literal["SET_LAYERS"] = "SET_LAYERS"
    layers: list[LayerItem]


AgentPatch = Union[
    UpdateWordAction,
    SetPresetAction,
    SetSettingsAction,
    SetPresetOverrideAction,
    AddOverlayAction,
    SetLayersAction,
]
DiscriminatedAgentPatch = Annotated[AgentPatch, Field(discriminator="type")]


class AgentLogEntry(BaseModel):
    """Matches apps/web's existing `AgentLogEntry` shape
    (apps/web/src/hooks/useAgentActivity.ts) field-for-field, so the frontend
    can eventually append these directly with no remapping."""

    id: str
    message: str
    timestamp: int  # epoch ms, same unit as the frontend's Date.now()


class SelectionContext(BaseModel):
    """Optional playhead/selection info.

    Not sent by the frontend today — apps/web's `useSelection` state
    (apps/web/src/hooks/useSelection.ts) is local-only and never leaves the
    browser. Accepted here as optional so the contract is forward-compatible
    once that frontend change happens (flagged in the Phase 1 audit as a
    cross-team integration point, not implemented by this phase).
    """

    selectedWordId: str | None = None
    # Multi/range selection. Supersedes `selectedWordId` when present and
    # non-empty; `selectedWordId` is kept for back-compat, never removed.
    selectedWordIds: list[str] | None = None
    playheadMs: int | None = Field(default=None, ge=0)
    # The caption block under the playhead, e.g. "b-w7". Carried for the
    # model's benefit as a LABEL only — audit 17 §2: blocks are derived, a
    # block id changes when the grouping changes, and block indices shift
    # as you edit. Never an addressing handle.
    activeBlockId: str | None = None
    # That block's word ids, resolved by the EDITOR (which owns
    # deriveBlocks). This is what "this line" means; the model works in
    # word ids only and is never asked to count or index.
    activeBlockWordIds: list[str] | None = None

    def resolved_word_ids(self) -> list[str]:
        """The word ids "this word"/"these words" refers to.

        `selectedWordIds` wins when present and non-empty; otherwise
        `selectedWordId` alone; otherwise empty. One helper, so the prompt
        text and any future caller cannot disagree about the precedence.
        """
        if self.selectedWordIds:
            return list(self.selectedWordIds)
        if self.selectedWordId:
            return [self.selectedWordId]
        return []

    def is_empty(self) -> bool:
        """True when the frontend sent nothing usable — there is then
        nothing to put in the conversation."""
        return not (
            self.resolved_word_ids()
            or self.playheadMs is not None
            or self.activeBlockId
            or self.activeBlockWordIds
        )


class ActivePreset(BaseModel):
    """What the active preset actually LOOKS like, resolved by the editor.

    The agent is otherwise blind to it. `Preset` lives only in TypeScript
    (packages/shared/src/presets.ts) and is deliberately not mirrored here, so
    without this the agent cannot know that Rangmanch draws emphasised words in
    #E2452A and angry words in #FF5C3A. That blindness had a visible cost: asked
    to "get rid of the red" it turned off the emotion layer, reported success,
    and left every emphasised word red — because it never knew they were red.

    The editor resolves this because the editor owns the resolver. Sent as data,
    inside the same untrusted envelope as everything else.
    """

    presetId: str | None = None
    name: str | None = None
    baseColor: str | None = None
    # The colour emphasised words are drawn in — a different source of "red" from the tone layer.
    emphasisColor: str | None = None
    emphasisFontFamily: str | None = None
    # tone -> the colour that tone paints, e.g. {"angry": "#FF5C3A"}.
    emotionColors: dict[str, str] = Field(default_factory=dict)
    wordsPerLine: int | None = None
    # The BASE caption size in px at 1080p. Needed by any tool that writes a per-word
    # fontSize — ramp_caption_size has to know what "bigger than normal" is a multiple OF,
    # and the preset's own size lives in TypeScript like the rest of `Preset`.
    baseFontSize: float | None = None


class AgentCommandRequest(BaseModel):
    """The full request body for POST /agent/command (route defined in
    router.py, not yet wired into app/main.py — see the Phase 1 audit)."""

    command: str = Field(min_length=1)
    project: Project
    selection: SelectionContext | None = None
    # What the active preset actually looks like, resolved by the editor.
    activePreset: ActivePreset | None = None
    # Earlier "command -> question" rounds of THIS conversation, oldest first.
    # Present only when the user is answering a question the agent asked.
    history: list[ClarificationTurn] = Field(default_factory=list)


AgentStatus = Literal["ok", "unsupported", "needs_input", "error", "not_implemented"]
"""
`needs_input` is the agent asking a question instead of guessing.

It is NOT a failure. A command like "put the captions where my hand is" is
perfectly sensible and perfectly unanswerable — the agent has no way to know
*when* — and the two ways to handle that badly are to pick a timestamp at
random or to refuse a request the product can actually fulfil. So the agent
returns the question, the editor shows it, and the user's reply comes back as
the next command with the exchange attached as `history`.

No patches ever accompany `needs_input`: a half-done turn the user has not
finished describing is worse than no turn.
"""


class ClarificationTurn(BaseModel):
    """One earlier round of "you asked / I asked back", replayed as DATA.

    The agent is stateless per request, so a follow-up answer would otherwise
    arrive with no idea what it is answering. Sending the exchange back is how
    the second turn knows what the first one meant — and it stays inside the
    same untrusted-data envelope as everything else, because a transcript
    quoted in a question must not become an instruction on the next turn.
    """

    command: str = Field(min_length=1)
    question: str = Field(min_length=1)


class AgentCommandResponse(BaseModel):
    """The full response body. `patches` apply cleanly, in order, through
    the frontend's existing project-reducer.ts actions with no reducer
    change required."""

    status: AgentStatus
    patches: list[DiscriminatedAgentPatch] = Field(default_factory=list)
    log: list[AgentLogEntry] = Field(default_factory=list)
    # Set only when status == "needs_input": the single question to put to the
    # user. One question, not a list — a turn that needs three answers should
    # ask for the one that blocks it most, then ask again.
    question: str | None = None


class AgentVoiceCommandRequest(BaseModel):
    """Phase 8: the request body for POST /agent/voice-command.

    Added alongside `AgentCommandRequest`, not in place of it — that class
    is unchanged. Carries an already-transcribed `transcript` (e.g. from a
    browser's own speech recognition), matching the `transcript=` path
    `app.agent.voice.run_agent_voice_command` already supports (Phase 7).
    Raw audio bytes are deliberately not accepted here: no STT provider is
    configured yet (Phase 7's `TranscriberNotConfiguredError`), and no wire
    format for audio upload has been decided — adding one now would be
    inventing a contract nobody asked for yet.
    """

    transcript: str = Field(min_length=1)
    project: Project
    selection: SelectionContext | None = None
    activePreset: ActivePreset | None = None
    history: list[ClarificationTurn] = Field(default_factory=list)
