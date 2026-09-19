from fastapi.testclient import TestClient

from app import costs
from app.schema import Project
from app.store import projects


def client():
    from app.main import app
    return TestClient(app)


def _seed(demo_doc):
    project = Project.model_validate(demo_doc)
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)


def test_real_agent_router_is_mounted(aws):
    """The 501 stub at POST /projects/{id}/agent is GONE; app/agent/router.py is mounted instead.

    Only the wiring is asserted here: that the routes exist, that the app imports with no
    LIVEKIT_* variable set, and that a malformed body is rejected by the agent's own contracts.
    The agent's behaviour is P4's, tested in their own suite.
    """
    from app.main import app
    paths = app.openapi()["paths"]
    assert {"/agent/command", "/agent/voice-command", "/agent/livekit-token"} <= set(paths)
    assert "post" in paths["/agent/command"]
    assert "/projects/{project_id}/agent" not in paths
    assert client().post("/agent/command", json={}).status_code == 422


def test_render_routes_are_real_not_a_501_stub(aws, demo_doc):
    """The P2 render seam used to answer 501 for everything. It is implemented now (see test_render.py for
    the behaviour); this only pins that the stub is gone and the routes are still mounted."""
    _seed(demo_doc)
    c = client()
    # the seeded demo has no uploaded video, so it is refused for that reason — not "not implemented"
    refused = c.post("/projects/demo-project/render")
    assert refused.status_code == 409 and refused.json()["error"] == "no_video"
    assert c.get("/projects/demo-project/render/abcdef012345").status_code != 501
    assert c.post("/projects/nope/render").status_code == 404


def test_cost_routes(aws, demo_doc):
    _seed(demo_doc)
    with costs.cost_event(stage="tag", service="bedrock", model_id="global.anthropic.claude-sonnet-4-6",
                          project_id="demo-project") as ev:
        ev.tokens(1000, 100)
    c = client()
    body = c.get("/projects/demo-project/cost").json()
    assert body["totalUsd"] == 0.0045 and body["durationMs"] == 12000 and len(body["events"]) == 1
    assert c.get("/costs").json()["projectCount"] == 1
    assert c.get("/costs?from=2026-09-20&to=2026-09-18").status_code == 400
    assert c.get("/projects/nope/cost").status_code == 404
