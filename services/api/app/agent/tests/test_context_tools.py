#!/usr/bin/env python3
"""Phase 3 verification: the three real, read-only context tool handlers.

Run:
    cd services/api && python -m app.agent.tests.test_context_tools

No AWS credentials, no network calls — every handler here only reads a
Project already validated from a local fixture.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from app.agent.tools import ToolNotImplementedError, ToolStatus, default_registry  # noqa: E402
from app.agent.tools.context_tools import find_words, get_project_context, get_timeline  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.schemas import FindWordsArgs, GetProjectContextArgs, GetTimelineArgs  # noqa: E402
from app.schema import Project, StylePatch  # noqa: E402

from app.agent.tests._fixtures import fixtures_dir  # noqa: E402

FIXTURES = fixtures_dir()
DEMO_PROJECT = FIXTURES / "demo-project.json"

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def raises(exc_type: type[Exception], fn) -> bool:
    try:
        fn()
    except exc_type:
        return True
    except Exception:
        return False
    return False


def load_demo_project() -> Project:
    raw = json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))
    return Project.model_validate(raw)


# --- get_project_context -----------------------------------------------------
def test_get_project_context_normal(project: Project) -> None:
    result = get_project_context(GetProjectContextArgs(), project)
    check("get_project_context returns real durationMs", result.durationMs == project.durationMs)
    check("get_project_context returns real width/height", (result.width, result.height) == (project.width, project.height))
    check("get_project_context returns real presetId", result.presetId == project.presetId)
    check("get_project_context returns real settings", result.settings == project.settings)
    check("get_project_context wordCount matches actual word count", result.wordCount == len(project.words))


# --- get_timeline ------------------------------------------------------------
def test_get_timeline_normal_no_window(project: Project) -> None:
    result = get_timeline(GetTimelineArgs(), project)
    check("get_timeline with no window returns every word", len(result.words) == len(project.words))
    check(
        "get_timeline preserves word order/ids",
        [w.wordId for w in result.words] == [w.id for w in project.words],
    )


def test_get_timeline_windowed(project: Project) -> None:
    if len(project.words) < 2:
        check("get_timeline windowed test skipped: fixture has < 2 words", True)
        return
    mid_word = project.words[len(project.words) // 2]
    result = get_timeline(GetTimelineArgs(fromMs=mid_word.startMs, toMs=mid_word.endMs), project)
    check("windowed get_timeline includes the word whose span matches the window", any(w.wordId == mid_word.id for w in result.words))

    result_none = get_timeline(GetTimelineArgs(fromMs=project.durationMs + 10_000, toMs=project.durationMs + 20_000), project)
    check("a window entirely after the project's end returns no words (not an error)", result_none.words == [])


def test_get_timeline_invalid_range_raises(project: Project) -> None:
    check(
        "get_timeline raises ToolExecutionError when fromMs > toMs",
        raises(ToolExecutionError, lambda: get_timeline(GetTimelineArgs(fromMs=5000, toMs=1000), project)),
    )


def test_get_timeline_empty_project() -> None:
    raw = json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))
    raw["words"] = []
    empty_project = Project.model_validate(raw)
    result = get_timeline(GetTimelineArgs(), empty_project)
    check("get_timeline on a project with zero words returns an empty list, not an error", result.words == [])


# --- find_words --------------------------------------------------------------
def test_find_words_contains_match(project: Project) -> None:
    target = project.words[0]
    # search using a lowercase substring of the target word's text, regardless of its own casing
    substring = target.text.lower()[: max(1, len(target.text) // 2)] or target.text.lower()
    result = find_words(FindWordsArgs(query=substring, matchType="contains"), project)
    check("find_words (contains) finds a word by a lowercase substring of itself", any(m.wordId == target.id for m in result.matches))


def test_find_words_is_case_insensitive(project: Project) -> None:
    target = project.words[0]
    result = find_words(FindWordsArgs(query=target.text.upper(), matchType="exact"), project)
    check("find_words (exact) matches regardless of case", any(m.wordId == target.id for m in result.matches))


def test_find_words_exact_does_not_partial_match(project: Project) -> None:
    target = project.words[0]
    if len(target.text) < 2:
        check("find_words exact-vs-partial test skipped: shortest word has < 2 chars", True)
        return
    partial = target.text[:-1]
    result = find_words(FindWordsArgs(query=partial, matchType="exact"), project)
    check("find_words (exact) does not match on a partial substring", not any(m.wordId == target.id for m in result.matches))


def test_find_words_zero_matches_is_not_an_error(project: Project) -> None:
    result = find_words(FindWordsArgs(query="zzzznonexistentzzzz", matchType="contains"), project)
    check("find_words with no matches returns an empty list, not an exception", result.matches == [])


def test_find_words_blank_query_raises(project: Project) -> None:
    check(
        "find_words raises ToolExecutionError for a whitespace-only query",
        raises(ToolExecutionError, lambda: find_words(FindWordsArgs(query="   "), project)),
    )


# --- registry integration -----------------------------------------------------
def test_timeline_exposes_what_decides_appearance(project: Project) -> None:
    """Targeting by look ("the white words", "the red ones") needs these. Without them the
    agent resized every word in a time range, including ones that render red."""
    words = get_timeline(GetTimelineArgs(), project).words
    by_id = {w.id: w for w in project.words}
    check("every timeline word carries emphasis", all(t.emphasis == by_id[t.wordId].emphasis for t in words))
    check("every timeline word carries emotion", all(t.emotion == by_id[t.wordId].emotion for t in words))

    styled = project.model_copy(update={"words": [
        project.words[0].model_copy(update={"style": StylePatch(color="#00FF00", fontSize=90)}),
        *project.words[1:],
    ]})
    first = get_timeline(GetTimelineArgs(), styled).words[0]
    check("a word's own colour override is exposed", first.colorOverride == "#00FF00")
    check("a word's own size override is exposed", first.fontSizeOverride == 90)
    check("a word with no override reports none", get_timeline(GetTimelineArgs(), styled).words[1].colorOverride is None)

    matches = find_words(FindWordsArgs(query=project.words[0].text), project).matches
    check("find_words results carry the same appearance fields", all(hasattr(m, "emotion") for m in matches))


def test_tools_are_registered_as_available() -> None:
    for name in ("get_project_context", "get_timeline", "find_words"):
        spec = default_registry.get_spec(name)
        check(f"{name} is registered as AVAILABLE", spec.status is ToolStatus.AVAILABLE)
        handler_ok = True
        try:
            default_registry.get_handler(name)
        except ToolNotImplementedError:
            handler_ok = False
        check(f"{name}'s handler is retrievable without ToolNotImplementedError", handler_ok)


def main() -> int:
    project = load_demo_project()

    test_get_project_context_normal(project)
    test_get_timeline_normal_no_window(project)
    test_get_timeline_windowed(project)
    test_get_timeline_invalid_range_raises(project)
    test_get_timeline_empty_project()
    test_find_words_contains_match(project)
    test_find_words_is_case_insensitive(project)
    test_find_words_exact_does_not_partial_match(project)
    test_find_words_zero_matches_is_not_an_error(project)
    test_find_words_blank_query_raises(project)
    test_timeline_exposes_what_decides_appearance(project)
    test_tools_are_registered_as_available()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
