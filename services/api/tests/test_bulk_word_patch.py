"""PATCH /projects/{id}/words — many words, ONE version bump, all-or-nothing.

The single-word route is a click in the inspector. One agent turn is a sentence like "make every
swear word red", which on Real_reel is 94 words: 94 sequential round trips through one version
counter, each a read + full-Project validation + conditional write, with no way to undo the half
that landed before an error. This endpoint is the atomic version of that turn, so the tests below
pin the four things that make it atomic rather than just faster.
"""
from fastapi.testclient import TestClient

from app.schema import Project
from app.store import projects


def client():
    from app.main import app
    return TestClient(app)


def _seed(demo_doc) -> Project:
    project = Project.model_validate(demo_doc)
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    return project


def test_bulk_patch_is_one_version_bump(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    r = c.patch("/projects/demo-project/words", json={"version": 1, "words": [
        {"wordId": "w1", "emphasis": True, "style": {"color": "#ff2d55"}},
        {"wordId": "w2", "text": "bhai", "emotion": "angry"},
        {"wordId": "w3", "single": True},
    ]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"] == 2 and r.headers["X-Project-Version"] == "2"
    # Response mirrors the single-word route's shape, in request order, with no nulls.
    assert [w["id"] for w in body["words"]] == ["w1", "w2", "w3"]
    assert body["words"][0]["style"] == {"color": "#ff2d55"}
    assert "null" not in r.text

    stored = c.get("/projects/demo-project").json()["words"]
    assert stored[0]["emphasis"] is True and stored[0]["style"]["color"] == "#ff2d55"
    assert stored[1]["text"] == "bhai" and stored[1]["emotion"] == "angry"
    assert stored[2]["single"] is True
    # One write, one bump — not three.
    assert projects.get("demo-project").version == 2


def test_bulk_patch_every_word_in_the_fixture_costs_one_version(aws, demo_doc):
    """The demo case: restyle the whole transcript in a single turn."""
    project = _seed(demo_doc)
    ids = [w.id for w in project.words]
    r = client().patch("/projects/demo-project/words", json={
        "version": 1,
        "words": [{"wordId": wid, "style": {"fontSize": 60}} for wid in ids]})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2 and len(r.json()["words"]) == len(ids)
    stored = client().get("/projects/demo-project").json()["words"]
    assert all(w["style"]["fontSize"] == 60 for w in stored)


def test_one_unknown_word_id_rolls_back_the_whole_call(aws, demo_doc):
    """All-or-nothing: the good patches in the same body must NOT land."""
    _seed(demo_doc)
    c = client()
    r = c.patch("/projects/demo-project/words", json={"words": [
        {"wordId": "w1", "text": "changed"},
        {"wordId": "w999", "text": "nope"},
        {"wordId": "w2", "text": "also changed"},
    ]})
    assert r.status_code == 404 and r.json() == {"error": "word_not_found", "wordId": "w999"}
    words = c.get("/projects/demo-project").json()["words"]
    assert words[0]["text"] == "Hello" and words[1]["text"] == "bhai"
    assert projects.get("demo-project").version == 1     # nothing written at all


def test_one_invalid_field_rolls_back_the_whole_call(aws, demo_doc):
    """The same guarantee for a schema failure, which is caught by the ONE validation in _edit."""
    _seed(demo_doc)
    c = client()
    r = c.patch("/projects/demo-project/words", json={"words": [
        {"wordId": "w1", "text": "changed"},
        {"wordId": "w2", "stretch": 0.2},        # stretch >= 1
    ]})
    assert r.status_code == 422 and r.json()["error"] == "invalid_project"
    assert c.get("/projects/demo-project").json()["words"][0]["text"] == "Hello"
    assert projects.get("demo-project").version == 1


def test_stale_version_is_409_and_writes_nothing(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    assert c.patch("/projects/demo-project/words",
                   json={"version": 1, "words": [{"wordId": "w1", "text": "first"}]}).status_code == 200
    stale = c.patch("/projects/demo-project/words",
                    json={"version": 1, "words": [{"wordId": "w1", "text": "second"}]})
    assert stale.status_code == 409 and stale.json() == {"error": "stale_version", "currentVersion": 2}
    assert c.get("/projects/demo-project").json()["words"][0]["text"] == "first"


def test_style_merges_key_by_key_and_an_explicit_null_removes_one_key(aws, demo_doc):
    """The INDEX.md invariant, on the bulk path: null removes, undefined/absent leaves alone, and
    an override emptied of every key disappears rather than being stored as {}."""
    _seed(demo_doc)
    c = client()
    c.patch("/projects/demo-project/words", json={"words": [
        {"wordId": "w1", "style": {"color": "#fff", "shake": 3}},
        {"wordId": "w2", "style": {"color": "#000"}},
    ]})
    r = c.patch("/projects/demo-project/words", json={"words": [
        {"wordId": "w1", "style": {"shake": None}},          # remove one key, keep color
        {"wordId": "w2", "style": {"color": None}},          # remove the last key
    ]})
    assert r.status_code == 200, r.text
    assert r.json()["words"][0]["style"] == {"color": "#fff"}
    assert "style" not in r.json()["words"][1]
    body = c.get("/projects/demo-project")
    assert body.json()["words"][0]["style"] == {"color": "#fff"}
    assert "style" not in body.json()["words"][1]
    assert "null" not in body.text


def test_a_non_style_field_is_removed_by_an_explicit_null(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    c.patch("/projects/demo-project/words", json={"words": [{"wordId": "w1", "single": True}]})
    r = c.patch("/projects/demo-project/words", json={"words": [{"wordId": "w1", "single": None}]})
    assert r.status_code == 200 and "single" not in r.json()["words"][0]


def test_rejections(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    assert c.patch("/projects/demo-project/words", json={"words": []}).status_code == 400
    assert c.patch("/projects/demo-project/words", json={}).status_code == 400
    # An entry that sets no field at all is an empty patch, named so the caller can find it.
    empty = c.patch("/projects/demo-project/words", json={"words": [{"wordId": "w1"}]})
    assert empty.status_code == 400 and empty.json()["wordIds"] == ["w1"]
    # extra="forbid" is inherited from WordFields, exactly as on the single-word route.
    assert c.patch("/projects/demo-project/words",
                   json={"words": [{"wordId": "w1", "bogus": 1}]}).status_code == 422
    assert c.patch("/projects/demo-project/words", json={"words": [{"text": "x"}]}).status_code == 422
    assert c.patch("/projects/nope/words", json={"words": [{"wordId": "w1", "text": "x"}]}).status_code == 404
    assert projects.get("demo-project").version == 1


def test_repeated_word_id_applies_in_order(aws, demo_doc):
    """Documented semantics: the same word twice is not an error; later patches win per key and
    `style` keeps merging, because the agent may well emit two rules that overlap."""
    _seed(demo_doc)
    r = client().patch("/projects/demo-project/words", json={"words": [
        {"wordId": "w1", "text": "first", "style": {"color": "#111"}},
        {"wordId": "w1", "text": "second", "style": {"shake": 2}},
    ]})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2
    word = client().get("/projects/demo-project").json()["words"][0]
    assert word["text"] == "second" and word["style"] == {"color": "#111", "shake": 2}
