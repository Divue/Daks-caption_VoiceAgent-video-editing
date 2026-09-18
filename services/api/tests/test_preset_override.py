"""`Project.presetOverride` — the small, enumerated set of preset properties that PERSIST.

Before this, `Preset` was code-only (presets.ts's header, INDEX.md's invariants) so "fewer words
per line" or "make emphasised words bigger" had nowhere to be stored and the editor had to badge
them "session only" (audit 15 §5). The field is deliberately NOT `Partial<Preset>`: `Preset` stays
un-mirrored so it can keep growing for free, and only these keys cost a schema.py mirror.

It is optional and additive, so a stored v2 document parses unchanged — the no-migration claim is
asserted for real below, not assumed.
"""
import json

import pydantic
import pytest
from fastapi.testclient import TestClient

from app.schema import Project
from app.store import projects as store


def client():
    from app.main import app
    return TestClient(app)


def _seed(demo_doc) -> Project:
    project = Project.model_validate(demo_doc)
    store.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    return project


OVERRIDE = {
    "wordsPerLine": 3,
    "emphasis": {"color": "#E2452A", "textCase": "upper"},
    "emphasisScale": 2.93,
    "reveal": "hidden",
    "emotion": {"angry": {"style": {"shake": 4}, "scale": 1.15}},
}


def test_absent_is_the_default_and_never_serialised(aws, demo_doc):
    """No migration is needed BECAUSE of this: a v2 document with no `presetOverride` key is valid,
    and one without an override never grows a `null` that the zod .optional() would reject."""
    assert "presetOverride" not in demo_doc
    project = _seed(demo_doc)
    assert project.presetOverride is None
    r = client().get("/projects/demo-project")
    assert r.status_code == 200 and "presetOverride" not in r.json()
    assert "null" not in r.text


def test_round_trips_through_dynamo_unchanged(aws, demo_doc):
    project = Project.model_validate({**demo_doc, "presetOverride": OVERRIDE})
    store.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    got = store.get("demo-project").project
    assert got == project
    assert json.loads(got.model_dump_json(exclude_none=True))["presetOverride"] == OVERRIDE
    assert got.presetOverride.emotion["angry"].scale == 1.15
    assert got.presetOverride.emotion["angry"].style.shake == 4


def test_patch_project_sets_and_merges_key_by_key(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    r = c.patch("/projects/demo-project", json={"presetOverride": {"wordsPerLine": 3}, "version": 1})
    assert r.status_code == 200, r.text
    assert r.json()["project"]["presetOverride"] == {"wordsPerLine": 3}

    # A second write must not replace the whole object, exactly like `settings`.
    r = c.patch("/projects/demo-project", json={"presetOverride": {"reveal": "dim"}, "version": 2})
    assert r.json()["project"]["presetOverride"] == {"wordsPerLine": 3, "reveal": "dim"}
    assert c.get("/projects/demo-project").json()["presetOverride"] == {"wordsPerLine": 3, "reveal": "dim"}


def test_a_null_key_removes_one_override_and_a_null_object_clears_them_all(aws, demo_doc):
    _seed(demo_doc)
    c = client()
    c.patch("/projects/demo-project", json={"presetOverride": OVERRIDE})
    r = c.patch("/projects/demo-project", json={"presetOverride": {"reveal": None, "emotion": None}})
    assert r.status_code == 200, r.text
    override = r.json()["project"]["presetOverride"]
    assert "reveal" not in override and "emotion" not in override
    assert override["wordsPerLine"] == 3

    cleared = c.patch("/projects/demo-project", json={"presetOverride": None})
    assert cleared.status_code == 200, cleared.text
    assert "presetOverride" not in cleared.json()["project"]
    body = c.get("/projects/demo-project")
    assert "presetOverride" not in body.json() and "null" not in body.text


def test_removing_the_last_key_drops_the_whole_object(aws, demo_doc):
    """Mirrors `_merge_style`: an emptied override is absent, never stored as `{}`."""
    _seed(demo_doc)
    c = client()
    c.patch("/projects/demo-project", json={"presetOverride": {"wordsPerLine": 4}})
    r = c.patch("/projects/demo-project", json={"presetOverride": {"wordsPerLine": None}})
    assert r.status_code == 200 and "presetOverride" not in r.json()["project"]
    assert store.get("demo-project").project.presetOverride is None


def test_other_project_fields_are_untouched_by_a_preset_override_patch(aws, demo_doc):
    _seed(demo_doc)
    r = client().patch("/projects/demo-project", json={
        "presetId": "chamak", "settings": {"emojis": False}, "presetOverride": {"wordsPerLine": 2}})
    body = r.json()["project"]
    assert body["presetId"] == "chamak" and body["settings"] == {"emojis": False, "emotionLayer": True}
    assert body["presetOverride"] == {"wordsPerLine": 2}


@pytest.mark.parametrize("bad", [
    {"wordsPerLine": 0},                       # min 1
    {"wordsPerLine": 9},                       # max 8
    {"wordsPerLine": 2.5},                     # int
    {"emphasisScale": 0},                      # positive
    {"reveal": "fade"},                        # not a RevealMode
    {"emotion": {"furious": {"style": {}}}},   # not an Emotion
    {"emotion": {"angry": {"scale": 1.2}}},    # `style` is required, like the zod object
    {"emphasis": {"x": 150}},                  # Style bounds still apply inside the partial
])
def test_invalid_overrides_are_rejected(aws, demo_doc, bad):
    _seed(demo_doc)
    assert client().patch("/projects/demo-project", json={"presetOverride": bad}).status_code == 422
    with pytest.raises(pydantic.ValidationError):
        Project.model_validate({**demo_doc, "presetOverride": bad})
    assert store.get("demo-project").version == 1


def test_a_partial_emotion_map_is_accepted(aws, demo_doc):
    """One emotion, not all three. zod v4's `z.record(enum, …)` is EXHAUSTIVE, which is why the
    TypeScript side uses `z.partialRecord` — this asserts the Python mirror agrees."""
    project = Project.model_validate({**demo_doc, "presetOverride": {"emotion": {
        "excited": {"style": {"color": "#FFD400"}}}}})
    assert set(project.presetOverride.emotion) == {"excited"}


def test_a_stored_v1_row_still_migrates_and_needs_no_new_step(aws, demo_doc):
    """The no-migration claim, end to end: SCHEMA_VERSION stays 2 and the v1 -> v2 step is
    untouched, so an old row reads back fine and simply has no override."""
    assert store.SCHEMA_VERSION == 2
    assert [(src, dst) for src, dst, _ in store.MIGRATIONS] == [(1, 2)]

    doc = json.loads(json.dumps(demo_doc))
    doc["presetId"] = "kathmandu"
    doc["words"][0]["style"] = {"uppercase": True}
    store.create("p-old", s3_key=None, preset_id="kathmandu")
    from app.store import dynamo
    from app.store.dynamo import N, S
    dynamo.client().update_item(
        TableName=dynamo.table(), Key={"pk": S(dynamo.project_pk("p-old")), "sk": S("PROJECT")},
        UpdateExpression="SET #doc = :doc, #sv = :sv, #v = :v, #st = :st",
        ExpressionAttributeNames={"#doc": "doc", "#sv": "schemaVersion", "#v": "version", "#st": "status"},
        ExpressionAttributeValues={
            ":doc": S(json.dumps(doc)), ":sv": N(1), ":v": N(1), ":st": S("ready")},
    )
    record = store.get("p-old")
    assert record.project.presetId == "rangmanch" and record.project.presetOverride is None
    assert record.project.words[0].style.textCase == "upper"


def test_a_stored_v2_row_written_before_this_field_parses_unchanged(aws, demo_doc):
    """The actual no-migration assertion: a v2 doc with no `presetOverride` key, read at v2."""
    assert store.migrate(json.loads(json.dumps(demo_doc)), 2) == demo_doc
    assert Project.model_validate(demo_doc).presetOverride is None
