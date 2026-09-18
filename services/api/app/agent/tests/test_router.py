#!/usr/bin/env python3
"""Phase 8 Step 1 verification: the router wired to the real Phase 6
planner and Phase 7 voice functions, over real HTTP (via a throwaway
FastAPI app — NOT app.main, which does not include this router — see
router.py's module docstring for why).

Run:
    cd services/api && python -m app.agent.tests.test_router

No AWS credentials, no network calls beyond an in-process ASGI test
client. The Bedrock client is injected via FastAPI's own dependency
override mechanism (`app.dependency_overrides[_default_bedrock_client]`)
— the external-I/O boundary is the only thing ever replaced; every
successful tool call in these tests runs the real tool registry, real
Pydantic validation, and real handlers against the real fixture, exactly
as in test_planner.py and test_voice.py.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agent.planner import MAX_TOOL_ITERATIONS  # noqa: E402
from app.agent.router import _default_bedrock_client, router  # noqa: E402
from app.schema import Project  # noqa: E402

from app.agent.tests._fixtures import fixtures_dir  # noqa: E402

FIXTURES = fixtures_dir()
DEMO_PROJECT = FIXTURES / "demo-project.json"

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def ensure_model_id_configured() -> None:
    os.environ.setdefault("BEDROCK_MODEL_ID", "test-only-placeholder-not-a-real-model")


def load_raw_project() -> dict:
    return json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))


def build_test_app(fake_client=None) -> FastAPI:
    """A standalone app carrying only the agent router — this is not
    app.main.app, and this test does not assert anything about the real
    server's route table. `fake_client`, if given, is injected via
    dependency override; otherwise the route falls back to a real (never
    actually called, in these tests) Bedrock client."""
    app = FastAPI()
    app.include_router(router)
    if fake_client is not None:
        app.dependency_overrides[_default_bedrock_client] = lambda: fake_client
    return app


class FakeBedrockClient:
    def __init__(self, responses: list[dict]) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []

    def converse(self, **kwargs) -> dict:
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("FakeBedrockClient ran out of scripted responses")
        return self._responses.pop(0)


def assistant_message(*, text: str | None = None, tool_use: dict | None = None) -> dict:
    content = []
    if text is not None:
        content.append({"text": text})
    if tool_use is not None:
        content.append({"toolUse": tool_use})
    return {"role": "assistant", "content": content}


def tool_use_response(name: str, tool_input: dict, *, tool_use_id: str = "t1") -> dict:
    return {"stopReason": "tool_use", "output": {"message": assistant_message(tool_use={"toolUseId": tool_use_id, "name": name, "input": tool_input})}}


def end_turn_response(text: str) -> dict:
    return {"stopReason": "end_turn", "output": {"message": assistant_message(text=text)}}


class RaisingClient:
    """Simulates a totally unexpected failure (e.g. a Bedrock network/API
    error) — not one of Phase 6's already-handled error paths."""

    def converse(self, **kwargs) -> dict:
        raise RuntimeError("simulated Bedrock API failure")


# --- valid text command reaches the real planner, serialized correctly ------
def test_valid_text_command_reaches_the_real_planner() -> None:
    project = load_raw_project()
    word_id = project["words"][0]["id"]
    fake_client = FakeBedrockClient(
        [tool_use_response("update_caption_style", {"wordIds": [word_id], "patch": {"x": 10, "y": 90}}), end_turn_response("Moved it.")]
    )
    client = TestClient(build_test_app(fake_client))

    response = client.post("/agent/command", json={"command": "move it", "project": project})

    check("POST /agent/command returns 200 for a valid command", response.status_code == 200)
    body = response.json()
    check("status is 'ok'", body.get("status") == "ok")
    check("exactly one patch is returned", len(body.get("patches", [])) == 1)
    check("the patch targets the requested word", body["patches"][0].get("wordId") == word_id)
    check("the fake client actually received two converse() calls (real loop ran)", len(fake_client.calls) == 2)


def test_optional_patch_fields_are_omitted_not_serialized_as_null() -> None:
    """The concrete correctness fix this step makes: response_model_exclude_none=True.
    Inspects the RAW response JSON dict (not a re-parsed Pydantic model,
    which would hide the difference) to confirm untouched StylePatch
    fields are absent entirely, not present as null."""
    project = load_raw_project()
    word_id = project["words"][0]["id"]
    fake_client = FakeBedrockClient(
        [tool_use_response("update_caption_style", {"wordIds": [word_id], "patch": {"x": 10, "y": 90}}), end_turn_response("Moved it.")]
    )
    client = TestClient(build_test_app(fake_client))

    response = client.post("/agent/command", json={"command": "move it", "project": project})
    style = response.json()["patches"][0]["patch"]["style"]

    check("only x and y appear in the style patch", set(style.keys()) == {"x", "y"})
    check("no untouched style field (e.g. fontSize) appears as null", "fontSize" not in style)
    check("no untouched style field (e.g. color) appears as null", "color" not in style)
    check("the top-level patch has no null 'text'/'emphasis'/etc. fields either", set(response.json()["patches"][0]["patch"].keys()) == {"style"})


# --- planner/tool errors are handled honestly, over HTTP --------------------
def test_iteration_cap_error_returns_200_with_honest_status() -> None:
    project = load_raw_project()
    responses = [tool_use_response("get_project_context", {}) for _ in range(MAX_TOOL_ITERATIONS + 2)]
    fake_client = FakeBedrockClient(responses)
    client = TestClient(build_test_app(fake_client))

    response = client.post("/agent/command", json={"command": "loop forever", "project": project})

    check("an internal planner error (iteration cap) still returns HTTP 200", response.status_code == 200)
    body = response.json()
    check("status is 'error', not a fabricated success", body.get("status") == "error")
    check("no patches are returned", body.get("patches") == [])


def test_unknown_tool_request_is_rejected_honestly() -> None:
    project = load_raw_project()
    fake_client = FakeBedrockClient([tool_use_response("delete_everything", {}), end_turn_response("UNSUPPORTED: can't do that.")])
    client = TestClient(build_test_app(fake_client))

    response = client.post("/agent/command", json={"command": "delete everything", "project": project})

    check("an unknown-tool request returns HTTP 200", response.status_code == 200)
    body = response.json()
    check("status is 'unsupported'", body.get("status") == "unsupported")
    check("no patches for an unsupported request", body.get("patches") == [])


def test_unexpected_exception_is_caught_by_the_router_safety_net() -> None:
    """A totally unhandled exception (not one of Phase 6's own error
    paths) must not become a raw HTTP 500 — the router's own try/except
    turns it into an honest status="error" response."""
    project = load_raw_project()
    client = TestClient(build_test_app(RaisingClient()))

    response = client.post("/agent/command", json={"command": "anything", "project": project})

    check("an unexpected exception does not produce an HTTP 500", response.status_code == 200)
    body = response.json()
    check("status is 'error' for the unexpected failure", body.get("status") == "error")
    check("the failure is logged honestly, not silently swallowed", any("failed unexpectedly" in entry["message"] for entry in body.get("log", [])))


def test_missing_model_configuration_returns_200_with_error_status() -> None:
    project = load_raw_project()
    original = os.environ.pop("BEDROCK_MODEL_ID", None)
    fake_client = FakeBedrockClient([end_turn_response("should never be reached")])
    client = TestClient(build_test_app(fake_client))
    try:
        response = client.post("/agent/command", json={"command": "anything", "project": project})
    finally:
        if original is not None:
            os.environ["BEDROCK_MODEL_ID"] = original

    check("a misconfigured agent returns HTTP 200, not an error page", response.status_code == 200)
    check("status is 'error' when no model is configured", response.json().get("status") == "error")
    check("Bedrock is never called when misconfigured", fake_client.calls == [])


# --- invalid requests remain rejected -----------------------------------------
def test_invalid_text_command_requests_are_rejected() -> None:
    project = load_raw_project()
    client = TestClient(build_test_app())

    empty_command = client.post("/agent/command", json={"command": "", "project": project})
    check("empty command is rejected with 422 (min_length=1)", empty_command.status_code == 422)

    missing_project = client.post("/agent/command", json={"command": "hi"})
    check("missing project is rejected with 422", missing_project.status_code == 422)


def test_invalid_voice_command_requests_are_rejected() -> None:
    project = load_raw_project()
    client = TestClient(build_test_app())

    empty_transcript = client.post("/agent/voice-command", json={"transcript": "", "project": project})
    check("empty transcript is rejected with 422 (min_length=1)", empty_transcript.status_code == 422)

    missing_project = client.post("/agent/voice-command", json={"transcript": "hi"})
    check("missing project is rejected with 422 for the voice route too", missing_project.status_code == 422)


# --- voice path reaches the SAME planner interface ---------------------------
def test_voice_command_reaches_the_same_planner_as_text() -> None:
    project = load_raw_project()
    word_id = project["words"][0]["id"]
    fake_client = FakeBedrockClient(
        [tool_use_response("update_caption_style", {"wordIds": [word_id], "patch": {"x": 5, "y": 5}}), end_turn_response("Moved it.")]
    )
    client = TestClient(build_test_app(fake_client))

    response = client.post(
        "/agent/voice-command",
        json={"transcript": "move this caption to the corner", "project": project},
    )

    check("POST /agent/voice-command returns 200", response.status_code == 200)
    body = response.json()
    check("status is 'ok', matching the shape a text command would return", body.get("status") == "ok")
    check("the patch is a normal, fully-formed UPDATE_WORD patch", body["patches"][0]["type"] == "UPDATE_WORD" and body["patches"][0]["wordId"] == word_id)
    check(
        "the transcript reached Bedrock wrapped exactly like a typed command",
        "move this caption to the corner" in fake_client.calls[0]["messages"][0]["content"][0]["text"],
    )


def test_voice_command_gets_identical_validation_as_text() -> None:
    """Same out-of-range-argument scenario as the text-command validation
    tests, run through /agent/voice-command instead — proves the HTTP
    voice route gets the same real validation, not a relaxed one."""
    project = load_raw_project()
    word_id = project["words"][0]["id"]
    fake_client = FakeBedrockClient(
        [tool_use_response("update_caption_style", {"wordIds": [word_id], "patch": {"x": 500, "y": 50}}), end_turn_response("Done.")]
    )
    client = TestClient(build_test_app(fake_client))

    response = client.post("/agent/voice-command", json={"transcript": "move it off screen", "project": project})

    check("out-of-range arguments from a voice command produce no patch over HTTP", response.json().get("patches") == [])


def main() -> int:
    ensure_model_id_configured()
    project = load_raw_project()
    Project.model_validate(project)  # fail loudly here, not inside a request, if the fixture drifts

    test_valid_text_command_reaches_the_real_planner()
    test_optional_patch_fields_are_omitted_not_serialized_as_null()
    test_iteration_cap_error_returns_200_with_honest_status()
    test_unknown_tool_request_is_rejected_honestly()
    test_unexpected_exception_is_caught_by_the_router_safety_net()
    test_missing_model_configuration_returns_200_with_error_status()
    test_invalid_text_command_requests_are_rejected()
    test_invalid_voice_command_requests_are_rejected()
    test_voice_command_reaches_the_same_planner_as_text()
    test_voice_command_gets_identical_validation_as_text()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
