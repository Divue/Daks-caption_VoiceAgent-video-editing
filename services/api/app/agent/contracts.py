"""Phase 1: request/response contracts for the AI agent.

These are the shapes crossing the boundary between apps/web and this agent
module — not the shared Project document itself. `app/schema.py` (lead-owned,
mirrors packages/shared/src/project.ts) is imported and reused, never
duplicated or modified here.

See .claude/audits/ai-agent/phase-01-agent-contracts.md for the reasoning
behind these shapes.
"""
from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.schema import Overlay, PresetId, Signals, StylePatch, Project


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
    emoji: str | None = None
    style: StylePatch | None = None
    signals: Signals | None = None


class UpdateWordAction(BaseModel):
    """Mirrors apps/web's `{ type: 'UPDATE_WORD', wordId, patch }` action."""

    type: Literal["UPDATE_WORD"] = "UPDATE_WORD"
    wordId: str
    patch: WordPatch


class SetPresetAction(BaseModel):
    """Mirrors apps/web's `{ type: 'SET_PRESET', presetId }` action."""

    type: Literal["SET_PRESET"] = "SET_PRESET"
    presetId: PresetId


class AddOverlayAction(BaseModel):
    """Mirrors apps/web's `{ type: 'ADD_OVERLAY', overlay }` action."""

    type: Literal["ADD_OVERLAY"] = "ADD_OVERLAY"
    overlay: Overlay


# The agent only ever emits these three action shapes. SET_PROJECT, UNDO and
# REDO exist in the frontend reducer but are not agent outputs: SET_PROJECT
# is a full replace (not a patch), and UNDO/REDO are user history controls,
# not something a command produces.
AgentPatch = Union[UpdateWordAction, SetPresetAction, AddOverlayAction]
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
    playheadMs: int | None = Field(default=None, ge=0)


class AgentCommandRequest(BaseModel):
    """The full request body for POST /agent/command (route defined in
    router.py, not yet wired into app/main.py — see the Phase 1 audit)."""

    command: str = Field(min_length=1)
    project: Project
    selection: SelectionContext | None = None


AgentStatus = Literal["ok", "unsupported", "error", "not_implemented"]


class AgentCommandResponse(BaseModel):
    """The full response body. `patches` apply cleanly, in order, through
    the frontend's existing project-reducer.ts actions with no reducer
    change required."""

    status: AgentStatus
    patches: list[DiscriminatedAgentPatch] = Field(default_factory=list)
    log: list[AgentLogEntry] = Field(default_factory=list)
