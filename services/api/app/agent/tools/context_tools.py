"""Phase 3: real handlers for the three read-only context tools.

Every handler here operates only on the `Project` already in scope (the one
sent with the request, per Phase 1's `AgentCommandRequest`) — no network
calls, no AWS, no LLM, no fabricated data. Each is registered as
`ToolStatus.AVAILABLE` at the bottom of this module, replacing the
`ToolStatus.PLANNED` placeholder Phase 2 registered for the same name (see
catalog.py, which no longer lists these three — see the Phase 3 audit for
why they moved here instead of being "flipped in place").
"""
from __future__ import annotations

from app.schema import Project

from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    FindWordsArgs,
    FindWordsResult,
    GetProjectContextArgs,
    GetProjectContextResult,
    GetTimelineArgs,
    GetTimelineResult,
    TimelineWord,
)



def _timeline_word(w) -> TimelineWord:
    """One word as the agent sees it — including what decides how it looks."""
    style = w.style
    return TimelineWord(
        wordId=w.id,
        text=w.text,
        startMs=w.startMs,
        endMs=w.endMs,
        emphasis=w.emphasis,
        emotion=w.emotion,
        colorOverride=style.color if style is not None else None,
        fontSizeOverride=style.fontSize if style is not None else None,
    )

def get_project_context(args: GetProjectContextArgs, project: Project) -> GetProjectContextResult:
    """Summarize the project: duration, dimensions, preset, settings, word count."""
    return GetProjectContextResult(
        durationMs=project.durationMs,
        width=project.width,
        height=project.height,
        presetId=project.presetId,
        settings=project.settings,
        wordCount=len(project.words),
    )


def get_timeline(args: GetTimelineArgs, project: Project) -> GetTimelineResult:
    """List words in timeline order, optionally windowed to [fromMs, toMs].

    A word is included if its span OVERLAPS the window at all
    (`endMs > fromMs` and `startMs < toMs`), not only if it starts inside
    it — a word that started just before `fromMs` but is still being said
    at `fromMs` is still relevant to "what's on screen in this range."

    Raises ToolExecutionError if both bounds are given and fromMs > toMs —
    Pydantic already checked each bound is individually >= 0 (schemas.py),
    but not that the pair makes sense together.
    """
    if args.fromMs is not None and args.toMs is not None and args.fromMs > args.toMs:
        raise ToolExecutionError(f"fromMs ({args.fromMs}) is after toMs ({args.toMs})")

    words = project.words
    if args.fromMs is not None:
        words = [w for w in words if w.endMs > args.fromMs]
    if args.toMs is not None:
        words = [w for w in words if w.startMs < args.toMs]

    return GetTimelineResult(
        words=[_timeline_word(w) for w in words]
    )


def find_words(args: FindWordsArgs, project: Project) -> FindWordsResult:
    """Locate word(s) by text.

    Case-insensitive, matching apps/web's own transcript search convention
    (TranscriptPanel.tsx does a `.toLowerCase()` substring match) rather
    than inventing a stricter rule here.

    Zero matches is a normal RESULT, not an error — per the approved plan's
    prompt-analysis rules (§5: "Zero words match find_words -> Report 'no
    word found...' -- no tool call to a mutation tool"), it is the future
    planner's job to decide what to do about zero matches, not this tool's.

    Raises ToolExecutionError if the query is blank after trimming —
    Pydantic's `min_length=1` (schemas.py) only rejects an empty string, not
    one that's all whitespace, and a blank "contains" query would otherwise
    match every word.
    """
    query = args.query.strip().lower()
    if not query:
        raise ToolExecutionError("query must not be blank")

    if args.matchType == "exact":
        matched = [w for w in project.words if w.text.lower() == query]
    else:
        matched = [w for w in project.words if query in w.text.lower()]

    return FindWordsResult(
        matches=[_timeline_word(w) for w in matched]
    )


default_registry.register(
    ToolSpec(
        name="get_project_context",
        description="Summarize the current project: duration, dimensions, preset, settings, word count.",
        input_model=GetProjectContextArgs,
        output_model=GetProjectContextResult,
        reads=True,
        writes=False,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 3.",
    ),
    get_project_context,
)

default_registry.register(
    ToolSpec(
        name="get_timeline",
        description="List words (optionally windowed by time range) in timeline order.",
        input_model=GetTimelineArgs,
        output_model=GetTimelineResult,
        reads=True,
        writes=False,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 3.",
    ),
    get_timeline,
)

default_registry.register(
    ToolSpec(
        name="find_words",
        description="Locate word(s) by text (exact or substring match).",
        input_model=FindWordsArgs,
        output_model=FindWordsResult,
        reads=True,
        writes=False,
        status=ToolStatus.AVAILABLE,
        notes="Implemented in Phase 3.",
    ),
    find_words,
)
