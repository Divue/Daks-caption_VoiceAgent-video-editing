#!/usr/bin/env python3
"""The hackathon demo script: ten commands, easiest first, run against the REAL agent.

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

from app.agent.contracts import AgentCommandResponse, AgentCommandRequest, SelectionContext
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


@dataclass
class Prompt:
    n: int
    title: str
    command: str
    why: str
    expect: Callable[[AgentCommandResponse, Project], tuple[bool, str]]
    selection: SelectionContext | None = None
    tags: list[str] = field(default_factory=list)


def expect_ok(fn: Callable[[AgentCommandResponse, Project], tuple[bool, str]]):
    def wrapped(r: AgentCommandResponse, p: Project) -> tuple[bool, str]:
        if r.status != "ok":
            return False, f"status={r.status}, expected ok"
        return fn(r, p)

    return wrapped


PROMPTS: list[Prompt] = [
    Prompt(
        1,
        "Restyle everything",
        "make all the captions yellow",
        "The simplest possible win, and it proves the plural tool surface: 16 words "
        "change in ONE tool call and ONE bulk write, not 16 round trips.",
        expect_ok(lambda r, p: (
            len(touched_words(r)) == len(p.words),
            f"{len(touched_words(r))} of {len(p.words)} words restyled",
        )),
        tags=["style", "bulk"],
    ),
    Prompt(
        2,
        "Switch the look",
        "switch to the Chamak preset",
        "One project-level patch. Shows the whole caption look changing at once.",
        expect_ok(lambda r, p: (
            any(x.presetId == "chamak" for x in patches_of(r, "SET_PRESET")),
            f"preset patches: {[x.presetId for x in patches_of(r, 'SET_PRESET')]}",
        )),
        tags=["preset"],
    ),
    Prompt(
        3,
        "Find a word by what it says",
        "make the word bekaar red",
        "The agent has to resolve text to a word id with find_words — it is never "
        "allowed to guess or count. Exactly one word should change.",
        expect_ok(lambda r, p: (
            touched_words(r) == {"w11"},
            f"touched {sorted(touched_words(r))}, expected just w11 (bekaar)",
        )),
        tags=["resolve"],
    ),
    Prompt(
        4,
        "Emoji on a word",
        "put a fire emoji on the word bekaar",
        "A per-word field that is not style. Also the first thing a creator asks for.",
        expect_ok(lambda r, p: (
            any(x.patch.emoji for x in patches_of(r, "UPDATE_WORD")),
            f"emojis set: {[x.patch.emoji for x in patches_of(r, 'UPDATE_WORD')]}",
        )),
        tags=["emoji"],
    ),
    Prompt(
        5,
        "Deixis — 'that line'",
        "make that line angry",
        "THE voice moment. 'That line' means nothing without context, so the editor "
        "sends the block under the playhead already resolved to word ids. The agent "
        "never counts lines — they re-split as soon as a tone changes.",
        expect_ok(lambda r, p: (
            touched_words(r) == {"w6", "w7", "w8", "w9"}
            and all(x.patch.emotion == "angry" for x in patches_of(r, "UPDATE_WORD")),
            f"touched {sorted(touched_words(r))} with "
            f"{[x.patch.emotion for x in patches_of(r, 'UPDATE_WORD')]}",
        )),
        selection=SelectionContext(
            playheadMs=3000,
            activeBlockId="b-w6",
            activeBlockWordIds=["w6", "w7", "w8", "w9"],
        ),
        tags=["deixis", "emotion"],
    ),
    Prompt(
        6,
        "Fix the sync",
        "the captions are running early, push them 200 milliseconds later",
        "Timing across the whole transcript. A real complaint about real reels, and "
        "one tool call moves every word without touching their durations.",
        expect_ok(lambda r, p: (
            len(touched_words(r)) == len(p.words)
            and all(
                x.patch.startMs == next(w.startMs for w in p.words if w.id == x.wordId) + 200
                for x in patches_of(r, "UPDATE_WORD")
            ),
            f"{len(touched_words(r))} words shifted",
        )),
        tags=["timing"],
    ),
    Prompt(
        7,
        "Turn a layer off",
        "stop making things red",
        "The right answer is the emotion LAYER toggle, not repainting words one by "
        "one. Tests whether the agent reaches for the project-level switch.",
        expect_ok(lambda r, p: (
            any(x.settings.emotionLayer is False for x in patches_of(r, "SET_SETTINGS")),
            f"settings patches: {[x.settings.model_dump(exclude_none=True) for x in patches_of(r, 'SET_SETTINGS')]}",
        )),
        tags=["settings"],
    ),
    Prompt(
        8,
        "Reason about the audio",
        "emphasise the loudest word in every line",
        "Uses the prosody signals the pipeline measured (loudness, pitch, duration), "
        "with the same stress formula the renderer uses. Note: on this fixture the "
        "pipeline already emphasised every peak, so the honest answer is to say so "
        "rather than emit patches that change nothing.",
        lambda r, p: (
            r.status == "ok",
            f"status={r.status}, patches={len(r.patches)} "
            f"(0 is correct here — the peaks are already emphasised)",
        ),
        tags=["prosody"],
    ),
    Prompt(
        9,
        "Reshape the captions",
        "fewer words per line — show three at a time",
        "wordsPerLine is a PRESET field, not a word field. Impossible until we stored "
        "preset overrides on the Project; one integer that changes the whole shape of "
        "the output.",
        expect_ok(lambda r, p: (
            any(x.override.wordsPerLine == 3 for x in patches_of(r, "SET_PRESET_OVERRIDE")),
            f"override patches: {[x.override.model_dump(exclude_none=True) for x in patches_of(r, 'SET_PRESET_OVERRIDE')]}",
        )),
        tags=["preset-override"],
    ),
    Prompt(
        10,
        "The distinction that matters",
        "make the emphasised words bigger and put them in Anton",
        "The hardest one. 'Make EVERY word Anton' is a per-word style write; 'make the "
        "EMPHASISED words Anton' is a conditional rule that also applies to words that "
        "are not emphasised yet. Getting this wrong looks right on screen and is wrong "
        "on the next word the pipeline promotes.",
        expect_ok(lambda r, p: (
            bool(patches_of(r, "SET_PRESET_OVERRIDE")) and not patches_of(r, "UPDATE_WORD"),
            f"{len(patches_of(r, 'SET_PRESET_OVERRIDE'))} override patch(es), "
            f"{len(patches_of(r, 'UPDATE_WORD'))} per-word patches (per-word would be WRONG)",
        )),
        tags=["preset-override", "hard"],
    ),
    Prompt(
        11,
        "Saying no",
        "cut the first two seconds of the video and add a whoosh transition",
        "Cutting and transitions are out of scope. The agent must refuse rather than "
        "approximate it with a tool that does something else. A demo without this is "
        "a demo that hides the failure mode.",
        lambda r, p: (
            r.status == "unsupported",
            f"status={r.status} (want unsupported), patches={len(r.patches)}",
        ),
        tags=["honesty"],
    ),
]


def run_one(prompt: Prompt, project: Project) -> bool:
    print(f"\n\033[1m{prompt.n:2d}. {prompt.title}\033[0m")
    print(f'    say: "{prompt.command}"')
    if prompt.selection:
        sel = prompt.selection.model_dump(exclude_none=True)
        print(f"    context: {sel}")
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
    final = response.log[-1].message if response.log else ""
    if final:
        print(f"    agent: {final[:160]}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, help="run a single prompt by number")
    parser.add_argument("--list", action="store_true", help="print the prompts without calling Bedrock")
    args = parser.parse_args()

    if args.list:
        for p in PROMPTS:
            print(f"{p.n:2d}. {p.title:28s} \"{p.command}\"")
            print(f"    {p.why}\n")
        return 0

    project = load_project()
    prompts = [p for p in PROMPTS if args.only is None or p.n == args.only]

    results = [(p, run_one(p, project)) for p in prompts]
    passed = sum(1 for _, ok in results if ok)

    print(f"\n{'=' * 70}")
    print(f"{passed}/{len(results)} prompts behaved as expected")
    for p, ok in results:
        if not ok:
            print(f"  FAILED  {p.n}. {p.title}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
