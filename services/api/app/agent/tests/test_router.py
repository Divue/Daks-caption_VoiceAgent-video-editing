#!/usr/bin/env python3
"""Phase 1 verification: the router stub, over real HTTP (via a throwaway
FastAPI app — NOT app.main, which does not include this router — see
router.py's module docstring for why).

Run:
    cd services/api && python -m app.agent.tests.test_router

No AWS credentials, no network calls beyond an in-process ASGI test client.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agent.router import router  # noqa: E402
from app.schema import Project  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[5] / "packages" / "shared" / "fixtures"
DEMO_PROJECT = FIXTURES / "demo-project.json"

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def build_test_app() -> FastAPI:
    """A standalone app carrying only the agent router — this is not
    app.main.app, and this test does not assert anything about the real
    server's route table."""
    app = FastAPI()
    app.include_router(router)
    return app


def main() -> int:
    project = json.loads(DEMO_PROJECT.read_text(encoding="utf-8"))
    Project.model_validate(project)  # fail loudly here, not inside the request, if the fixture drifts

    client = TestClient(build_test_app())
    response = client.post(
        "/agent/command",
        json={"command": "Make the word insane yellow", "project": project},
    )

    check("POST /agent/command returns 200", response.status_code == 200)
    body = response.json()
    check("response status is 'not_implemented'", body.get("status") == "not_implemented")
    check("response has no patches (nothing pretends to have acted)", body.get("patches") == [])
    check("response includes a log entry explaining why", len(body.get("log", [])) == 1)

    bad_response = client.post("/agent/command", json={"command": "", "project": project})
    check("empty command is rejected with 422 (min_length=1)", bad_response.status_code == 422)

    missing_project_response = client.post("/agent/command", json={"command": "hi"})
    check("missing project is rejected with 422", missing_project_response.status_code == 422)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
