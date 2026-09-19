"""Export: the API side of the render (POST /projects/{id}/render and its polling route).

The Remotion render server is replaced by a small REAL http server on a random local port, so the API's
HTTP handling (start, poll, fetch the finished file, delete it) is exercised for real; only the
rendering itself is faked. AWS is moto, as everywhere else in this suite.
"""
from __future__ import annotations

import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import boto3
import pytest
from fastapi.testclient import TestClient

from app.routers import render
from app.schema import Project
from app.store import projects

RID = "abcdef012345"
VIDEO = b"\x00\x00\x00\x18ftypmp42 pretend this is an mp4"


class FakeRenderServer:
    """Just enough of remotion/server/index.mjs's HTTP contract."""

    def __init__(self) -> None:
        self.posts: list[dict] = []
        self.status_calls = 0
        self.deleted: list[str] = []
        self.state = {"state": "rendering", "progress": 0.4, "error": None, "projectId": "demo-project"}
        self.start_response: tuple[int, dict] = (202, {"renderId": RID, "state": "queued"})
        self.lost = False
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:  # keep test output clean
                pass

            def _json(self, status: int, body: dict) -> None:
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self) -> None:
                length = int(self.headers.get("content-length", 0))
                fake.posts.append(json.loads(self.rfile.read(length)))
                self._json(*fake.start_response)

            def do_GET(self) -> None:
                if self.path.endswith("/file"):
                    self.send_response(200)
                    self.send_header("content-type", "video/mp4")
                    self.send_header("content-length", str(len(VIDEO)))
                    self.end_headers()
                    self.wfile.write(VIDEO)
                    return
                fake.status_calls += 1
                if fake.lost:
                    return self._json(404, {"error": "not_found"})
                self._json(200, {"renderId": RID, **fake.state})

            def do_DELETE(self) -> None:
                fake.deleted.append(self.path)
                self._json(200, {"renderId": RID})

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def fake(monkeypatch):
    server = FakeRenderServer()
    monkeypatch.setenv("RENDER_SERVICE_URL", server.url)
    monkeypatch.setattr(render, "probe_fps", lambda url: 25.0)  # the presigned URL points at moto, not a real file
    yield server
    server.close()


def client() -> TestClient:
    from app.main import app
    return TestClient(app)


def seed(demo_doc: dict, *, s3_key: str | None = "t1/projects/demo-project/source.mp4") -> None:
    project = Project.model_validate(demo_doc)
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True, s3_key=s3_key)


# --- starting ---------------------------------------------------------------------------------------

def test_start_sends_the_saved_project_and_the_sources_real_frame_rate(aws, demo_doc, fake):
    seed(demo_doc)
    response = client().post("/projects/demo-project/render")
    assert response.status_code == 202
    assert response.json() == {"renderId": RID, "state": "queued"}
    sent = fake.posts[0]
    assert sent["projectId"] == "demo-project"
    assert sent["fps"] == 25.0, "a 25 fps clip must be exported at 25 fps, not resampled to 30"
    assert len(sent["project"]["words"]) == len(demo_doc["words"])
    assert sent["videoUrl"].startswith("https://"), "the renderer needs a fetchable link, never s3://"
    assert "X-Amz-Signature" in sent["videoUrl"]


def test_start_unknown_project_is_404(aws, fake):
    assert client().post("/projects/nope/render").status_code == 404


def test_start_before_processing_is_409_not_ready(aws, fake):
    projects.create("fresh", s3_key="t1/projects/fresh/source.mp4", preset_id="rangmanch")
    body = client().post("/projects/fresh/render").json()
    assert body["error"] == "not_ready"


def test_a_project_without_an_uploaded_video_cannot_be_exported(aws, demo_doc, fake):
    seed(demo_doc, s3_key=None)  # the seeded demo fixture has no source video
    response = client().post("/projects/demo-project/render")
    assert response.status_code == 409 and response.json()["error"] == "no_video"
    assert fake.posts == [], "nothing may be sent to the renderer for a project with no video"


def test_a_rejected_request_from_the_render_server_is_a_422(aws, demo_doc, fake):
    seed(demo_doc)
    fake.start_response = (400, {"error": "invalid_request", "detail": "project needs positive width"})
    response = client().post("/projects/demo-project/render")
    assert response.status_code == 422 and "width" in response.json()["detail"]


def test_render_server_down_is_a_clear_503_that_says_how_to_start_it(aws, demo_doc, monkeypatch):
    seed(demo_doc)
    monkeypatch.setenv("RENDER_SERVICE_URL", "http://127.0.0.1:9")  # nothing listens on the discard port
    monkeypatch.setattr(render, "probe_fps", lambda url: 30.0)
    response = client().post("/projects/demo-project/render")
    assert response.status_code == 503
    body = response.json()
    assert body["error"] == "render_unavailable" and "npm run render-server" in body["detail"]


# --- polling ----------------------------------------------------------------------------------------

def test_status_reports_progress_without_a_link_until_done(aws, demo_doc, fake):
    seed(demo_doc)
    body = client().get(f"/projects/demo-project/render/{RID}").json()
    assert body == {"renderId": RID, "state": "rendering", "progress": 0.4, "outputUrl": None, "error": None}


def test_done_moves_the_file_to_s3_and_returns_a_download_link(aws, demo_doc, fake):
    seed(demo_doc)
    fake.state = {"state": "done", "progress": 1, "error": None, "projectId": "demo-project"}
    body = client().get(f"/projects/demo-project/render/{RID}").json()

    assert body["state"] == "done" and body["progress"] == 1.0
    # A save-as link, not a play-in-a-tab link: S3 itself must send Content-Disposition: attachment.
    assert "response-content-disposition=attachment" in body["outputUrl"]
    assert "demo-project-captioned.mp4" in body["outputUrl"]
    stored = boto3.client("s3", region_name="ap-south-1").get_object(
        Bucket="test-bucket", Key=f"t1/projects/demo-project/renders/{RID}.mp4")["Body"].read()
    assert stored == VIDEO, "the exact bytes the renderer produced must land on S3"
    assert fake.deleted == [f"/renders/{RID}"], "the render server's disk copy is freed once delivered"


def test_polling_again_after_done_does_not_touch_the_render_server(aws, demo_doc, fake):
    seed(demo_doc)
    fake.state = {"state": "done", "progress": 1, "error": None, "projectId": "demo-project"}
    c = client()
    c.get(f"/projects/demo-project/render/{RID}")
    calls = fake.status_calls
    again = c.get(f"/projects/demo-project/render/{RID}").json()
    assert again["state"] == "done" and again["outputUrl"]
    assert fake.status_calls == calls, "a delivered render is answered from S3, so a render-server restart cannot break it"


def test_a_failed_render_reports_its_error(aws, demo_doc, fake):
    seed(demo_doc)
    fake.state = {"state": "failed", "progress": 0.3, "error": "Render took longer than 15 minutes", "projectId": "demo-project"}
    body = client().get(f"/projects/demo-project/render/{RID}").json()
    assert body["state"] == "failed" and "15 minutes" in body["error"] and body["outputUrl"] is None


def test_a_render_the_server_no_longer_knows_is_reported_lost_not_500(aws, demo_doc, fake):
    seed(demo_doc)
    fake.lost = True  # the render server was restarted
    body = client().get(f"/projects/demo-project/render/{RID}").json()
    assert body["state"] == "failed" and "export again" in body["error"].lower()


def test_another_projects_render_is_not_readable_through_this_one(aws, demo_doc, fake):
    seed(demo_doc)
    fake.state = {"state": "done", "progress": 1, "error": None, "projectId": "some-other-project"}
    assert client().get(f"/projects/demo-project/render/{RID}").status_code == 404


def test_a_render_with_no_project_cannot_be_claimed_by_one(aws, demo_doc, fake):
    """The render server does not require a projectId. Treating a missing one as "mine" let such a
    render be claimed by ANY project id — and `_deliver` would then copy its MP4 into that
    project's S3 prefix. The match has to be exact."""
    seed(demo_doc)
    fake.state = {"state": "done", "progress": 1, "error": None}
    assert client().get(f"/projects/demo-project/render/{RID}").status_code == 404


@pytest.mark.parametrize("bad", ["x", "ABCDEF012345", "abcdef01234", "abcdef0123456", "../../etc/passwd", "abcdef01234g"])
def test_a_malformed_render_id_never_reaches_the_render_server(aws, demo_doc, fake, bad):
    seed(demo_doc)
    response = client().get(f"/projects/demo-project/render/{bad}")
    assert response.status_code == 404
    assert fake.status_calls == 0


def test_status_of_an_unknown_project_is_404(aws, fake):
    assert client().get(f"/projects/nope/render/{RID}").status_code == 404


# --- pure helpers -----------------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("30000/1001", 29.97), ("25/1", 25.0), ("60/1", 60.0), ("24", 24.0),
    ("0/0", None), ("abc", None), ("", None), ("500/1", None), ("0/1", None),
])
def test_parse_frame_rate(text, expected):
    assert render.parse_frame_rate(text) == expected


def test_probe_fps_reads_ffprobe_output(monkeypatch):
    monkeypatch.setattr(render.subprocess, "run", lambda *a, **k: SimpleNamespace(stdout="30000/1001,30000/1001\n"))
    assert render.probe_fps("https://example/x.mp4") == 29.97


def test_probe_fps_skips_an_unusable_first_value(monkeypatch):
    monkeypatch.setattr(render.subprocess, "run", lambda *a, **k: SimpleNamespace(stdout="0/0,25/1\n"))
    assert render.probe_fps("https://example/x.mp4") == 25.0


def test_probe_fps_falls_back_to_30_when_ffprobe_fails(monkeypatch):
    def boom(*a, **k):
        raise subprocess.TimeoutExpired("ffprobe", 30)
    monkeypatch.setattr(render.subprocess, "run", boom)
    assert render.probe_fps("https://example/x.mp4") == render.DEFAULT_FPS


def test_download_filename_is_sanitised(aws):
    from app import s3
    url = s3.presigned_download("t1/x.mp4", 'evil"; name=../../etc.mp4')
    assert "evil%22" not in url and "%22%3B" not in url and "attachment" in url
