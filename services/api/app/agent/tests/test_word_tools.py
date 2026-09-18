#!/usr/bin/env python3
"""The eight per-word edit tools, plus emphasise_peaks.

Run:
    cd services/api && python -m app.agent.tests.test_word_tools

These are the tools the product is actually about — emphasis, tone, text,
stretch, emoji, own-line, timing — and until they existed the agent could
restyle a caption but could not make one angry. They all take `wordIds` as a
LIST so a whole line is one tool call against a 6-iteration budget.

No AWS credentials and no network: every handler only reads and validates
against a fixture Project, and must never mutate it (checked on both the
success and the failure paths).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from pydantic import ValidationError  # noqa: E402

from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.schemas import (  # noqa: E402
    EmphasisePeaksArgs,
    SetEmojiArgs,
    SetEmotionArgs,
    SetEmphasisArgs,
    SetSingleArgs,
    SetStretchArgs,
    SetTextArgs,
    ShiftTimingArgs,
)
from app.agent.tools.word_tools import (  # noqa: E402
    emphasise_peaks,
    set_emoji,
    set_emotion,
    set_emphasis,
    set_single,
    set_stretch,
    set_text,
    shift_timing,
    stress_score,
)
from app.schema import Project  # noqa: E402

from app.agent.tests._fixtures import fixtures_dir  # noqa: E402

DEMO_PROJECT = fixtures_dir() / "demo-project.json"

failures: list[str] = []


def check(label: str, ok: bool) -> None:
    if ok:
        print(f"[PASS] {label}")
    else:
        failures.append(label)
        print(f"[FAIL] {label}")


def raises(exc_type, fn) -> bool:
    try:
        fn()
    except exc_type:
        return True
    except Exception:
        return False
    return False


def load_demo_project() -> Project:
    return Project.model_validate(json.loads(DEMO_PROJECT.read_text(encoding="utf-8")))


def snapshot(project: Project) -> dict:
    return project.model_dump(mode="json")


def wire(patch) -> dict:
    """What actually reaches the frontend — the only place a null is meaningful."""
    return patch.model_dump(mode="json")


# --- the plural contract, checked once on a representative tool ---------------
def test_every_mutating_tool_takes_a_list(project: Project) -> None:
    ids = [w.id for w in project.words[:4]]
    result = set_emotion(SetEmotionArgs(wordIds=ids, emotion="angry"), project)
    check("one call changes four words", [p.wordId for p in result.patches] == ids)
    check("every patch carries the change", all(p.patch.emotion == "angry" for p in result.patches))
    check("a single id is just a list of one",
          len(set_emotion(SetEmotionArgs(wordIds=[ids[0]], emotion="angry"), project).patches) == 1)


def test_duplicate_ids_collapse(project: Project) -> None:
    """Two identical patches would cost two Ctrl+Z presses to undo one sentence."""
    wid = project.words[0].id
    result = set_emphasis(SetEmphasisArgs(wordIds=[wid, wid, wid], emphasis=True), project)
    check("a repeated id produces exactly one patch", len(result.patches) == 1)


def test_unknown_id_fails_loudly_and_changes_nothing(project: Project) -> None:
    before = snapshot(project)
    good = project.words[0].id
    check(
        "an unknown id raises rather than silently skipping",
        raises(ToolExecutionError, lambda: set_emphasis(SetEmphasisArgs(wordIds=[good, "nope"], emphasis=True), project)),
    )
    check("no partial batch is returned; the project is untouched", snapshot(project) == before)


# --- set_text -----------------------------------------------------------------
def test_set_text(project: Project) -> None:
    wid = project.words[0].id
    result = set_text(SetTextArgs(wordIds=[wid], text="bro"), project)
    check("set_text sets the word's text", result.patches[0].patch.text == "bro")
    check("set_text does not touch timing", result.patches[0].patch.startMs is None)


def test_set_text_rejects_empty(project: Project) -> None:
    wid = project.words[0].id
    check(
        "an empty replacement is rejected (a word with no text is not a caption)",
        raises((ToolExecutionError, ValidationError), lambda: set_text(SetTextArgs(wordIds=[wid], text=""), project)),
    )


# --- set_emphasis / set_emotion -----------------------------------------------
def test_set_emphasis_both_ways(project: Project) -> None:
    wid = project.words[0].id
    check("emphasis can be turned on", set_emphasis(SetEmphasisArgs(wordIds=[wid], emphasis=True), project).patches[0].patch.emphasis is True)
    check("emphasis can be turned off", set_emphasis(SetEmphasisArgs(wordIds=[wid], emphasis=False), project).patches[0].patch.emphasis is False)


def test_set_emotion_rejects_an_unknown_tone(project: Project) -> None:
    check(
        "a tone outside neutral/angry/excited is rejected at construction",
        raises(ValidationError, lambda: SetEmotionArgs(wordIds=["w1"], emotion="furious")),
    )


# --- set_stretch --------------------------------------------------------------
def test_set_stretch(project: Project) -> None:
    wid = project.words[0].id
    check("stretch is set", set_stretch(SetStretchArgs(wordIds=[wid], stretch=2.5), project).patches[0].patch.stretch == 2.5)


def test_set_stretch_rejects_below_one(project: Project) -> None:
    check(
        "stretch < 1 is rejected (1 means no stretch; there is no negative stretch)",
        raises((ValidationError, ToolExecutionError), lambda: set_stretch(SetStretchArgs(wordIds=["w1"], stretch=0.5), load_demo_project())),
    )


# --- set_single ---------------------------------------------------------------
def test_set_single_true_and_clear(project: Project) -> None:
    wid = project.words[0].id
    on = set_single(SetSingleArgs(wordIds=[wid], single=True), project)
    check("single=true puts the word on its own line", on.patches[0].patch.single is True)

    cleared = set_single(SetSingleArgs(wordIds=[wid], single=None), project)
    body = wire(cleared.patches[0])
    check("single=null reaches the wire as an explicit null, not an omitted key",
          "single" in body["patch"] and body["patch"]["single"] is None)


# --- set_emoji ----------------------------------------------------------------
def test_set_emoji_set_and_remove(project: Project) -> None:
    wid = project.words[0].id
    check("an emoji is set", set_emoji(SetEmojiArgs(wordIds=[wid], emoji="🔥"), project).patches[0].patch.emoji == "🔥")

    removed = wire(set_emoji(SetEmojiArgs(wordIds=[wid], emoji=""), project).patches[0])
    check("an empty string reaches the wire as a null, which is what removes it",
          "emoji" in removed["patch"] and removed["patch"]["emoji"] is None)


# --- shift_timing -------------------------------------------------------------
def test_shift_timing_moves_both_ends(project: Project) -> None:
    word = project.words[0]
    result = shift_timing(ShiftTimingArgs(wordIds=[word.id], deltaMs=200), project)
    patch = result.patches[0].patch
    check("startMs moves by the delta", patch.startMs == word.startMs + 200)
    check("endMs moves by the same delta", patch.endMs == word.endMs + 200)
    check("the word's duration is preserved", patch.endMs - patch.startMs == word.endMs - word.startMs)


def test_shift_timing_clamps_at_zero_but_never_inverts(project: Project) -> None:
    word = project.words[0]
    huge = -(word.endMs + 10_000)
    check(
        "a shift that would collapse a word's span is refused, not clamped into nonsense",
        raises(ToolExecutionError, lambda: shift_timing(ShiftTimingArgs(wordIds=[word.id], deltaMs=huge), project)),
    )


def test_shift_timing_rejects_zero(project: Project) -> None:
    check(
        "a zero shift is refused rather than reported as an edit",
        raises(ToolExecutionError, lambda: shift_timing(ShiftTimingArgs(wordIds=[project.words[0].id], deltaMs=0), project)),
    )


# --- emphasise_peaks ----------------------------------------------------------
def test_stress_score_matches_the_shared_formula(project: Project) -> None:
    """The formula is duplicated from packages/shared/src/emphasis.ts. If the two
    drift, the agent emphasises a different word than the renderer would have
    promoted, which looks like a bug in the pipeline rather than in the agent."""
    word = next((w for w in project.words if w.signals is not None), None)
    if word is None:
        check("fixture has a word with signals to score", False)
        return
    s = word.signals
    expected = s.loudnessZ + s.pitchZ + max(0.0, s.durationRatio - 1) * 0.5 + len(word.text) / 100
    check("stress_score reproduces emphasis.ts's stressScore exactly", abs(stress_score(word) - expected) < 1e-9)


def test_stress_score_falls_back_without_signals(project: Project) -> None:
    word = project.words[0].model_copy(update={"signals": None})
    check("a word with no signals scores on text length alone",
          abs(stress_score(word) - len(word.text) / 100) < 1e-9)


def test_emphasise_peaks_picks_one_word_per_line(project: Project) -> None:
    """On a transcript with nothing emphasised yet, every multi-word line gets
    exactly one winner. Built by stripping emphasis from the fixture rather than
    using it as-is: the demo fixture's peaks are ALREADY the emphasised words
    (the pipeline found them), which is the no-op case covered separately below."""
    plain = project.model_copy(
        update={"words": [w.model_copy(update={"emphasis": False}) for w in project.words]}
    )
    result = emphasise_peaks(EmphasisePeaksArgs(scope="all"), plain)
    check("it emphasises at least one word", len(result.patches) >= 1)
    check("every patch sets emphasis true", all(p.patch.emphasis is True for p in result.patches))
    check("no word is emphasised twice", len({p.wordId for p in result.patches}) == len(result.patches))
    check("it does not emphasise everything", len(result.patches) < len(plain.words))

    # One per multi-word line: single-word lines are skipped, because emphasising
    # the only word in a line is just a bigger line.
    from app.agent.tools.word_tools import group_into_lines

    multi = [line for line in group_into_lines(plain.words) if len(line) >= 2]
    check("exactly one winner per multi-word line", len(result.patches) == len(multi))


def test_emphasise_peaks_reports_rather_than_emitting_no_op_patches(project: Project) -> None:
    """The demo fixture's peaks are already emphasised. The tool must say so
    instead of emitting patches that change nothing — an identical no-op patch
    still costs the user a Ctrl+Z press."""
    result = emphasise_peaks(EmphasisePeaksArgs(scope="all"), project)
    check("no no-op patches are produced for already-emphasised peaks", result.patches == [])
    check("they are reported instead", len(result.alreadyEmphasisedWordIds) >= 1)


def test_emphasise_peaks_rejects_a_backwards_range(project: Project) -> None:
    check(
        "fromMs after toMs is refused",
        raises(ToolExecutionError, lambda: emphasise_peaks(EmphasisePeaksArgs(scope="selection", fromMs=5000, toMs=1000), project)),
    )


def test_emphasise_peaks_selection_needs_a_range(project: Project) -> None:
    check(
        'scope="selection" with no range is refused rather than silently meaning "all"',
        raises(ToolExecutionError, lambda: emphasise_peaks(EmphasisePeaksArgs(scope="selection"), project)),
    )


def test_no_tool_mutates_the_project(project: Project) -> None:
    before = snapshot(project)
    wid = project.words[0].id
    set_text(SetTextArgs(wordIds=[wid], text="x"), project)
    set_emphasis(SetEmphasisArgs(wordIds=[wid], emphasis=True), project)
    set_emotion(SetEmotionArgs(wordIds=[wid], emotion="angry"), project)
    set_stretch(SetStretchArgs(wordIds=[wid], stretch=2), project)
    set_single(SetSingleArgs(wordIds=[wid], single=True), project)
    set_emoji(SetEmojiArgs(wordIds=[wid], emoji="🔥"), project)
    shift_timing(ShiftTimingArgs(wordIds=[wid], deltaMs=50), project)
    emphasise_peaks(EmphasisePeaksArgs(scope="all"), project)
    check("eight successful tool calls left the input Project untouched", snapshot(project) == before)


def main() -> int:
    project = load_demo_project()

    test_every_mutating_tool_takes_a_list(project)
    test_duplicate_ids_collapse(project)
    test_unknown_id_fails_loudly_and_changes_nothing(project)

    test_set_text(project)
    test_set_text_rejects_empty(project)
    test_set_emphasis_both_ways(project)
    test_set_emotion_rejects_an_unknown_tone(project)
    test_set_stretch(project)
    test_set_stretch_rejects_below_one(project)
    test_set_single_true_and_clear(project)
    test_set_emoji_set_and_remove(project)
    test_shift_timing_moves_both_ends(project)
    test_shift_timing_clamps_at_zero_but_never_inverts(project)
    test_shift_timing_rejects_zero(project)

    test_stress_score_matches_the_shared_formula(project)
    test_stress_score_falls_back_without_signals(project)
    test_emphasise_peaks_picks_one_word_per_line(project)
    test_emphasise_peaks_reports_rather_than_emitting_no_op_patches(project)
    test_emphasise_peaks_rejects_a_backwards_range(project)
    test_emphasise_peaks_selection_needs_a_range(project)

    test_no_tool_mutates_the_project(project)

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {failures}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
