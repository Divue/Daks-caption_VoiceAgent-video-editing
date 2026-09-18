from fastapi.testclient import TestClient

from app.schema import Project
from app.store import projects


def client():
    from app.main import app
    return TestClient(app)


def test_create_returns_capped_presigned_post(aws):
    r = client().post("/projects", json={"filename": "Reel.MP4", "contentType": "video/mp4", "presetId": "mrbeast"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["upload"]["url"].startswith("https://test-bucket.s3.ap-south-1.amazonaws.com")
    assert body["upload"]["fields"]["key"] == f"t1/projects/{body['projectId']}/source.mp4"
    import base64, json
    policy = json.loads(base64.b64decode(body["upload"]["fields"]["policy"]))
    assert ["content-length-range", 1, 200 * 1024 * 1024] in policy["conditions"]
    assert projects.get(body["projectId"]).preset_id == "mrbeast"


def test_create_rejects_non_video(aws):
    r = client().post("/projects", json={"filename": "x.exe", "contentType": "application/x-msdownload"})
    assert r.status_code == 422


def test_get_before_processing_is_409_not_ready(aws):
    pid = client().post("/projects", json={"filename": "a.mp4", "contentType": "video/mp4"}).json()["projectId"]
    r = client().get(f"/projects/{pid}")
    assert r.status_code == 409 and r.json()["status"] == "awaiting_upload"


def test_get_unknown_is_404(aws):
    assert client().get("/projects/nope").status_code == 404


def test_get_seeded_fixture_validates_and_has_no_nulls(aws, demo_doc):
    project = Project.model_validate(demo_doc)
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    r = client().get("/projects/demo-project")
    assert r.status_code == 200 and r.headers["X-Project-Version"] == "1"
    assert Project.model_validate(r.json()) == project
    assert "null" not in r.text          # zod .optional() rejects null
    assert r.json()["videoUrl"] == "demo.mp4"   # no s3Key: passed through


def test_get_rewrites_video_url_to_presigned(aws, demo_doc):
    project = Project.model_validate({**demo_doc, "videoUrl": "s3://test-bucket/t1/projects/demo-project/source.mp4"})
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True,
                         s3_key="t1/projects/demo-project/source.mp4")
    url = client().get("/projects/demo-project").json()["videoUrl"]
    assert url.startswith("https://test-bucket.s3.ap-south-1.amazonaws.com/t1/projects/demo-project/source.mp4?")
    assert "X-Amz-Signature" in url
