"""The one place a tool turns `wordIds` into validated UPDATE_WORD patches.

Every mutating tool takes `wordIds: list[str]`, so every mutating tool needs
the identical three properties, and they live here rather than being
re-implemented per tool:

1. **Every id is checked against the real Project.** An unknown id is a
   `ToolExecutionError` naming it — never a silent no-op, never a partially
   applied batch. (The message keeps `apply_patch`'s own wording, "no word
   with id 'x'", so the planner's log reads the same whichever layer caught
   it.)
2. **Duplicates collapse.** The same id twice would otherwise produce two
   identical patches, and the frontend's undo stack would take two presses
   to undo one spoken sentence.
3. **The WHOLE resulting sequence is validated together**, through Phase 1's
   `apply_patches` — all-or-nothing, against a Project that is never
   mutated. A tool either returns a fully valid patch list or raises before
   returning anything.

Nothing here decides WHAT to change; a caller passes a factory that builds
one `WordPatch` per word. That keeps "which words" (here, once) separate
from "what change" (each tool, trivially).
"""
from __future__ import annotations

from typing import Callable

from app.schema import Project, Word

from ..contracts import UpdateWordAction, WordPatch
from ..validation import apply_patches
from .errors import ToolExecutionError


def resolve_words(project: Project, word_ids: list[str]) -> list[Word]:
    """The real `Word` objects for `word_ids`, in the order given, with
    duplicates collapsed.

    Raises ToolExecutionError on the FIRST unknown id, having built nothing
    — an id the model invented or mis-transcribed must fail loudly, so the
    planner can feed the real reason back to the model instead of the user
    being told a change was made that wasn't.
    """
    by_id = {word.id: word for word in project.words}
    resolved: list[Word] = []
    seen: set[str] = set()
    for word_id in word_ids:
        if word_id in seen:
            continue
        seen.add(word_id)
        word = by_id.get(word_id)
        if word is None:
            raise ToolExecutionError(f"no word with id {word_id!r}")
        resolved.append(word)
    return resolved


def build_word_patches(
    project: Project,
    word_ids: list[str],
    make_patch: Callable[[Word], WordPatch],
) -> list[UpdateWordAction]:
    """N `UpdateWordAction`s, one per resolved word, validated as a set.

    `make_patch` receives the word itself, not just its id, so a tool whose
    new value depends on the current one (`shift_timing`) needs no second
    lookup and no second code path.

    `apply_patches` (Phase 1, unmodified) replays the whole list against a
    plain-dict copy and re-validates the complete Project after each step;
    its resulting Project is deliberately discarded — the agent is stateless
    and returns patches, never a mutated document.
    """
    patches = [UpdateWordAction(wordId=word.id, patch=make_patch(word)) for word in resolve_words(project, word_ids)]
    _, error = apply_patches(project, patches)
    if error is not None:
        raise ToolExecutionError(error)
    return patches
