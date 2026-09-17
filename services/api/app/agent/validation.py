"""Phase 1: the validation boundary between agent patches and the shared
Project schema.

Architectural rule (approved plan, §10 / §6): every mutation the agent
proposes must be validated against app/schema.py before it is ever returned,
and a failed validation must leave the input Project completely untouched —
the same "commit-or-nothing" behavior as apps/web's project-reducer.ts.

No tool logic lives here yet (Phase 4). This module only answers: "given a
patch, what would the resulting Project look like, and is it still valid?"
"""
from __future__ import annotations

from pydantic import ValidationError

from app.schema import Project

from .contracts import AddOverlayAction, AgentPatch, SetPresetAction, UpdateWordAction


class PatchError(Exception):
    """Raised when a patch cannot be safely applied.

    Callers must treat this as "no change happened" — apply_patch never
    mutates its `project` argument, whether it succeeds or raises.
    """


def apply_patch(project: Project, patch: AgentPatch) -> Project:
    """Return a NEW, schema-valid Project with `patch` applied.

    Works on a plain-dict copy of `project` and re-validates the whole
    result through Project.model_validate — never partially applied, and
    the original `project` object is never written to (dict() copies out;
    nothing here calls a mutating method on `project` itself).

    Raises PatchError, and touches nothing, if:
    - an UPDATE_WORD patch names a wordId that doesn't exist
    - the resulting document fails schema validation for any reason
      (out-of-range values, wrong types, a combination that class-level
      field validators alone wouldn't catch)
    """
    data = project.model_dump(mode="json")

    if isinstance(patch, UpdateWordAction):
        index = next((i for i, w in enumerate(data["words"]) if w["id"] == patch.wordId), None)
        if index is None:
            raise PatchError(f"no word with id {patch.wordId!r}")
        word_patch = patch.patch.model_dump(mode="json", exclude_none=True)
        data["words"][index] = {**data["words"][index], **word_patch}

    elif isinstance(patch, SetPresetAction):
        data["presetId"] = patch.presetId

    elif isinstance(patch, AddOverlayAction):
        data["overlays"].append(patch.overlay.model_dump(mode="json"))

    else:  # pragma: no cover - the AgentPatch union is exhaustive today
        raise PatchError(f"unknown patch type: {patch!r}")

    try:
        return Project.model_validate(data)
    except ValidationError as exc:
        raise PatchError(f"resulting project failed schema validation: {exc}") from exc


def apply_patches(project: Project, patches: list[AgentPatch]) -> tuple[Project, str | None]:
    """Replay a whole patch list against `project`, in order.

    All-or-nothing: if any patch in the list fails, the ORIGINAL `project`
    is returned unchanged, together with the error that stopped it. This is
    what the planner (Phase 6) will call before ever returning patches to
    the frontend — matching the approved plan's "validate the sequence of
    resulting patches ... before returning any patches at all."
    """
    current = project
    for patch in patches:
        try:
            current = apply_patch(current, patch)
        except PatchError as exc:
            return project, str(exc)
    return current, None
