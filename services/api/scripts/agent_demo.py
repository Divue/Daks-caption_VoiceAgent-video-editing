#!/usr/bin/env python3
"""The hackathon demo script: graded commands, run against the REAL agent.

Run inside the API container (that is where the dependencies and AWS config live):

    docker compose exec api python scripts/agent_demo.py
    docker compose exec api python scripts/agent_demo.py --only 5      # one prompt
    docker compose exec api python scripts/agent_demo.py --list        # no Bedrock calls

Every prompt below has been run for real against Bedrock. Each carries an
`expect` describing what the agent must actually DO — not just that it answered
— so this doubles as the integration test for the tool surface. A prompt that
starts failing here is a regression a unit test cannot catch, because what is
being checked is the model's tool SELECTION, not a handler's behaviour.

The last prompt is deliberately impossible. A demo that only shows successes
does not show the thing that makes an agent trustworthy: it has to be able to
say no. Watch for `status=unsupported` there, not an error and not a fake.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.contracts import (
    AgentCommandRequest,
    AgentCommandResponse,
    ClarificationTurn,
    SelectionContext,
)
from app.agent.planner import run_agent_command
from app.schema import Project

FIXTURE = Path("/srv/fixtures/demo-project.json")
if not FIXTURE.exists():  # running from a host checkout instead of the container
    FIXTURE = Path(__file__).resolve().parents[3] / "packages/shared/fixtures/demo-project.json"


def load_project() -> Project:
    return Project.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))


# --- expectations -------------------------------------------------------------
def patches_of(response: AgentCommandResponse, type_: str) -> list:
    return [p for p in response.patches if p.type == type_]


def touched_words(response: AgentCommandResponse) -> set[str]:
    return {p.wordId for p in patches_of(response, "UPDATE_WORD")}


def styles_of(response: AgentCommandResponse) -> list[dict]:
    """Every style dict the turn sets, for asserting about colour/size/font/shake."""
    out = []
    for patch in patches_of(response, "UPDATE_WORD"):
        style = patch.patch.style
        if style is not None:
            out.append(style.model_dump(exclude_none=True))
    return out


CLIPS = Path("/srv/scripts/stt_bakeoff/clips")


def load_named_project(name: str) -> Project:
    """The fixture, with its bare `videoUrl` pointed at the real clip when we have one.

    Fixtures carry a filename ("Normal.mp4"), which `analyze_frame` rightly refuses — it
    needs something it can actually read. In the running app that field is a presigned URL;
    here the same clip is mounted in the container, so the demo uses the local file and the
    vision prompts exercise real ffmpeg and real Rekognition rather than being skipped.
    """
    path = FIXTURE.parent / f"{name}-project.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    clip = CLIPS / str(data.get("videoUrl", ""))
    if clip.is_file():
        data["videoUrl"] = str(clip)
    return Project.model_validate(data)


# How hard the command is for the AGENT, not for the user to say. The order is the demo
# order: each tier shows something the tier below it could not do.
GRADES = ("easy", "average", "asks", "hard")
GRADE_BLURB = {
    "easy": "one intent, one tool, no ambiguity",
    "average": "needs a lookup, a scope, or the right level to act at",
    "asks": "under-specified on purpose — the agent must ask, not guess",
    "hard": "several intents in one breath, or a distinction that is easy to get subtly wrong",
}


@dataclass
class Prompt:
    n: int
    grade: str
    title: str
    command: str
    why: str
    expect: Callable[[AgentCommandResponse, Project], tuple[bool, str]]
    selection: SelectionContext | None = None
    # Only for `asks`: what the user says once the agent has asked its question. The harness
    # replays it with the original command attached as history, exactly as the editor does.
    answer: str | None = None
    expect_after_answer: Callable[[AgentCommandResponse, Project], tuple[bool, str]] | None = None
    project: str = "demo"
    tags: list[str] = field(default_factory=list)


def expect_ok(fn: Callable[[AgentCommandResponse, Project], tuple[bool, str]]):
    def wrapped(r: AgentCommandResponse, p: Project) -> tuple[bool, str]:
        if r.status != "ok":
            return False, f"status={r.status}, expected ok"
        return fn(r, p)

    return wrapped


ANGRY_WORDS = {"w16", "w17", "w18", "w19", "w20", "w41", "w42"}  # normal-project, tone -> red


def addressed_red(response: AgentCommandResponse) -> bool:
    """Did the turn actually deal with "stop using red"?

    Three legitimate answers, and the agent may pick any of them: restyle the words that
    render red, retune what the angry tone DOES, or turn the tone layer off. What would be
    wrong is doing nothing and saying it did.
    """
    if patches_of(response, "SET_PRESET_OVERRIDE") or patches_of(response, "SET_SETTINGS"):
        return True
    return any(
        patch.wordId in ANGRY_WORDS and patch.patch.style is not None
        for patch in patches_of(response, "UPDATE_WORD")
    )


PROMPTS: list[Prompt] = [
    # ---- easy -----------------------------------------------------------------
    Prompt(
        1, "easy", "Restyle everything",
        "make all the captions yellow",
        "The simplest possible win, and it proves the plural tool surface: every word changes "
        "in ONE tool call and ONE bulk write, not N round trips.",
        expect_ok(lambda r, p: (
            len(touched_words(r)) == len(p.words),
            f"{len(touched_words(r))} of {len(p.words)} words restyled",
        )),
    ),
    Prompt(
        2, "easy", "Switch the look",
        "switch to the Chamak preset",
        "One project-level patch; the whole caption look changes at once.",
        expect_ok(lambda r, p: (
            any(x.presetId == "chamak" for x in patches_of(r, "SET_PRESET")),
            f"preset patches: {[x.presetId for x in patches_of(r, 'SET_PRESET')]}",
        )),
    ),
    Prompt(
        3, "easy", "Find a word by what it says",
        "make the word bekaar red",
        "The agent resolves text to a word id with find_words — it never guesses or counts.",
        expect_ok(lambda r, p: (
            touched_words(r) == {"w11"},
            f"touched {sorted(touched_words(r))}, expected just w11 (bekaar)",
        )),
    ),
    Prompt(
        4, "easy", "Emoji on a word",
        "put a fire emoji on the word bekaar",
        "A per-word field that is not style, and the first thing a creator asks for.",
        expect_ok(lambda r, p: (
            any(x.patch.emoji for x in patches_of(r, "UPDATE_WORD")),
            f"emojis set: {[x.patch.emoji for x in patches_of(r, 'UPDATE_WORD')]}",
        )),
    ),

    # ---- average --------------------------------------------------------------
    Prompt(
        5, "average", "Deixis — 'that line'",
        "make that line angry",
        "THE voice moment. 'That line' means nothing without context, so the editor sends the "
        "block under the playhead already resolved to word ids. The agent never counts lines — "
        "they re-split the moment a tone changes.",
        expect_ok(lambda r, p: (
            touched_words(r) == {"w6", "w7", "w8", "w9"}
            and all(x.patch.emotion == "angry" for x in patches_of(r, "UPDATE_WORD")),
            f"touched {sorted(touched_words(r))} with "
            f"{[x.patch.emotion for x in patches_of(r, 'UPDATE_WORD')]}",
        )),
        selection=SelectionContext(
            playheadMs=3000, activeBlockId="b-w6", activeBlockWordIds=["w6", "w7", "w8", "w9"],
        ),
    ),
    Prompt(
        6, "average", "Fix the sync",
        "the captions are running early, push them 200 milliseconds later",
        "Timing across the whole transcript — a real complaint about real reels. One call "
        "moves every word without touching their durations.",
        expect_ok(lambda r, p: (
            len(touched_words(r)) == len(p.words)
            and all(
                x.patch.startMs == next(w.startMs for w in p.words if w.id == x.wordId) + 200
                for x in patches_of(r, "UPDATE_WORD")
            ),
            f"{len(touched_words(r))} words shifted",
        )),
    ),
    Prompt(
        7, "average", "Turn a layer off",
        "stop making things red",
        "The right answer is the emotion LAYER toggle, not repainting words one by one.",
        expect_ok(lambda r, p: (
            any(x.settings.emotionLayer is False for x in patches_of(r, "SET_SETTINGS")),
            f"settings: {[x.settings.model_dump(exclude_none=True) for x in patches_of(r, 'SET_SETTINGS')]}",
        )),
    ),
    Prompt(
        8, "average", "Reason about the audio",
        "emphasise the loudest word in every line",
        "Uses the prosody the pipeline measured (loudness, pitch, duration) with the same "
        "stress formula the renderer uses. On this fixture the pipeline already emphasised "
        "every peak, so the honest answer is to say so rather than emit no-op patches.",
        lambda r, p: (
            r.status == "ok",
            f"status={r.status}, patches={len(r.patches)} (0 is correct here)",
        ),
    ),
    Prompt(
        9, "average", "Reshape the captions",
        "fewer words per line — show three at a time",
        "wordsPerLine is a PRESET field, not a word field. One integer that changes the whole "
        "shape of the output.",
        expect_ok(lambda r, p: (
            any(x.override.wordsPerLine == 3 for x in patches_of(r, "SET_PRESET_OVERRIDE")),
            f"overrides: {[x.override.model_dump(exclude_none=True) for x in patches_of(r, 'SET_PRESET_OVERRIDE')]}",
        )),
    ),

    # ---- asks -----------------------------------------------------------------
    # These are the ones worth showing a judge. The agent is not being clever; it is
    # refusing to guess when guessing would produce the wrong video.
    Prompt(
        10, "asks", "No timestamp given",
        "put the captions to my right, where my hand is",
        "Perfectly sensible, completely unanswerable: WHEN? A hand is somewhere different in "
        "every frame. The agent asks instead of picking a moment at random, then does the job "
        "once told.",
        lambda r, p: (
            r.status == "needs_input" and not r.patches,
            f"status={r.status}, question={r.question!r}",
        ),
        answer="around 22 seconds in",
        expect_after_answer=lambda r, p: (
            r.status in ("ok", "unsupported"),
            f"after the answer: status={r.status}, patches={len(r.patches)}",
        ),
        project="normal",
    ),
    Prompt(
        11, "asks", "No target given",
        "make it bigger",
        "Bigger WHAT? Nothing is selected and nothing was named. Asking costs a second; "
        "resizing the wrong thing costs the user their edit.",
        lambda r, p: (
            r.status == "needs_input" and not r.patches,
            f"status={r.status}, question={r.question!r}",
        ),
        answer="the word pagal",
        expect_after_answer=lambda r, p: (
            r.status == "ok" and any(
                (x.patch.style.fontSize if x.patch.style else None) for x in patches_of(r, "UPDATE_WORD")
            ),
            f"after the answer: touched {sorted(touched_words(r))}",
        ),
        project="normal",
    ),
    Prompt(
        12, "asks", "Ambiguous reference",
        "change that word to blue",
        "'That word' with no selection and no playhead. The editor sent nothing to resolve it "
        "with, so there is no honest way to pick one.",
        lambda r, p: (
            r.status == "needs_input" and not r.patches,
            f"status={r.status}, question={r.question!r}",
        ),
        answer="the word hello at the start",
        expect_after_answer=lambda r, p: (
            r.status == "ok" and len(touched_words(r)) >= 1,
            f"after the answer: touched {sorted(touched_words(r))}",
        ),
        project="normal",
    ),

    # ---- hard -----------------------------------------------------------------
    Prompt(
        13, "hard", "The distinction that matters",
        "make the emphasised words bigger and put them in Anton",
        "'Make EVERY word Anton' is a per-word style write. 'Make the EMPHASISED words Anton' "
        "is a conditional rule that also applies to words that are not emphasised yet. Getting "
        "this wrong looks right on screen and is wrong on the next word the pipeline promotes.",
        expect_ok(lambda r, p: (
            bool(patches_of(r, "SET_PRESET_OVERRIDE")) and not patches_of(r, "UPDATE_WORD"),
            f"{len(patches_of(r, 'SET_PRESET_OVERRIDE'))} override patch(es), "
            f"{len(patches_of(r, 'UPDATE_WORD'))} per-word (per-word would be WRONG)",
        )),
    ),
    Prompt(
        14, "hard", "Four intents in one breath",
        "make the first line yellow, and in general use blue more than red — I don't like red, "
        "swap the red ones for something else. Also the word pagal around 9 seconds: make just "
        "that one bigger, give it a shake, and put it in a funky font.",
        "How people actually talk. Four unrelated intents, one of them scoped to a single word "
        "and three properties at once. Nothing here is ambiguous, so the agent must NOT ask — "
        "it must just do all of it.",
        expect_ok(lambda r, p: (
            addressed_red(r)
            and any(
                x.wordId == "w16" and x.patch.style is not None
                and x.patch.style.fontSize is not None
                and x.patch.style.shake is not None
                and x.patch.style.fontFamily is not None
                for x in patches_of(r, "UPDATE_WORD")
            ),
            f"red addressed={addressed_red(r)}; "
            f"pagal(w16) style="
            f"{[x.patch.style.model_dump(exclude_none=True) for x in patches_of(r, 'UPDATE_WORD') if x.wordId == 'w16' and x.patch.style]}",
        )),
        project="normal",
    ),
    Prompt(
        15, "hard", "Scoped exception",
        "make every angry word blue, but leave the excited ones exactly as they are",
        "A scope with a carve-out. The easy failure is restyling everything, or restyling the "
        "excited words too because they were in the same lookup. TWO answers are correct here: "
        "recolour exactly the angry words, or retune what the angry TONE does — the second is "
        "arguably better, since it also covers words that become angry later. This expectation "
        "originally demanded the first and failed the agent for choosing the second.",
        expect_ok(lambda r, p: (
            (
                bool(touched_words(r))
                and touched_words(r) <= {w.id for w in p.words if w.emotion == "angry"}
            )
            or any(
                x.override.emotion and "angry" in x.override.emotion
                for x in patches_of(r, "SET_PRESET_OVERRIDE")
            ),
            f"touched {sorted(touched_words(r))}; overrides="
            f"{[x.override.model_dump(exclude_none=True) for x in patches_of(r, 'SET_PRESET_OVERRIDE')]}; "
            f"angry set is {sorted(w.id for w in p.words if w.emotion == 'angry')}",
        )),
        project="normal",
    ),
    Prompt(
        16, "hard", "Saying no",
        "cut the first two seconds of the video and add a whoosh transition",
        "Cutting and transitions are out of scope. The agent must refuse rather than "
        "approximate it with a tool that does something else. A demo without this hides the "
        "failure mode.",
        lambda r, p: (
            r.status == "unsupported",
            f"status={r.status} (want unsupported), patches={len(r.patches)}",
        ),
    ),
]


def run_one(prompt: Prompt) -> bool:
    project = load_named_project(prompt.project)
    print(f"\n\033[1m{prompt.n:2d}. [{prompt.grade}] {prompt.title}\033[0m")
    print(f'    say: "{prompt.command}"')
    if prompt.selection:
        print(f"    context: {prompt.selection.model_dump(exclude_none=True)}")

    try:
        response = run_agent_command(
            AgentCommandRequest(command=prompt.command, project=project, selection=prompt.selection)
        )
    except Exception as exc:  # a crash is a failure, not an exception to the harness
        print(f"    \033[31mCRASHED\033[0m {exc}")
        return False

    ok, detail = prompt.expect(response, project)
    mark = "\033[32mPASS\033[0m" if ok else "\033[31mFAIL\033[0m"
    print(f"    status={response.status}  patches={len(response.patches)}")
    print(f"    {mark}  {detail}")
    if response.question:
        print(f"    \033[36magent asks:\033[0m {response.question}")
    elif response.log:
        print(f"    agent: {response.log[-1].message[:150]}")

    if prompt.answer is None:
        return ok
    if not ok:
        return False  # it never asked, so there is nothing to answer

    # Round two: the user answers. The editor replays the ORIGINAL command as history, which is
    # the whole point — "around 22 seconds in" means nothing on its own.
    print(f'    reply: "{prompt.answer}"')
    try:
        second = run_agent_command(
            AgentCommandRequest(
                command=prompt.answer,
                project=project,
                selection=prompt.selection,
                history=[ClarificationTurn(command=prompt.command, question=response.question or "?")],
            )
        )
    except Exception as exc:
        print(f"    \033[31mCRASHED on the answer\033[0m {exc}")
        return False

    assert prompt.expect_after_answer is not None
    ok2, detail2 = prompt.expect_after_answer(second, project)
    mark2 = "\033[32mPASS\033[0m" if ok2 else "\033[31mFAIL\033[0m"
    print(f"    status={second.status}  patches={len(second.patches)}")
    print(f"    {mark2}  {detail2}")
    if second.log:
        print(f"    agent: {second.log[-1].message[:150]}")
    return ok2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, help="run a single prompt by number")
    parser.add_argument("--grade", choices=GRADES, help="run one difficulty tier")
    parser.add_argument("--list", action="store_true", help="print the prompts without calling Bedrock")
    args = parser.parse_args()

    prompts = [
        p
        for p in PROMPTS
        if (args.only is None or p.n == args.only) and (args.grade is None or p.grade == args.grade)
    ]

    if args.list:
        for grade in GRADES:
            tier = [p for p in prompts if p.grade == grade]
            if not tier:
                continue
            print(f"\n\033[1m{grade.upper()}\033[0m — {GRADE_BLURB[grade]}")
            for p in tier:
                print(f"  {p.n:2d}. {p.title:26s} \"{p.command}\"")
                if p.answer:
                    print(f"      then reply: \"{p.answer}\"")
                print(f"      {p.why}")
        return 0

    results = [(p, run_one(p)) for p in prompts]
    passed = sum(1 for _, ok in results if ok)

    print(f"\n{'=' * 70}")
    for grade in GRADES:
        tier = [(p, ok) for p, ok in results if p.grade == grade]
        if tier:
            print(f"  {grade:8s} {sum(1 for _, ok in tier if ok)}/{len(tier)}")
    print(f"{passed}/{len(results)} prompts behaved as expected")
    for p, ok in results:
        if not ok:
            print(f"  FAILED  {p.n}. [{p.grade}] {p.title}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
