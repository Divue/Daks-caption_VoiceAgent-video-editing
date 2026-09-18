import json

import pydantic
import pytest

from app.schema import Project
from app.store import projects


def seed(doc: dict) -> Project:
    project = Project.model_validate(doc)
    projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    return project


def test_fixture_round_trips_unchanged(aws, demo_doc):
    """The failure the JSON-string storage exists to prevent: float/Decimal damage."""
    original = seed(demo_doc)
    got = projects.get("demo-project").project
    assert got == original
    assert got.model_dump() == Project.model_validate(demo_doc).model_dump()
    # every float survives as a float, bit-for-bit (stretch 2.6, signals, style x/y ...)
    assert json.loads(got.model_dump_json()) == json.loads(original.model_dump_json())
    assert isinstance(got.words[0].stretch, float) and got.words[0].stretch == demo_doc["words"][0]["stretch"]


def test_seed_is_version_one_and_status_ready(aws, demo_doc):
    seed(demo_doc)
    record = projects.get("demo-project")
    assert (record.version, record.status, record.has_manual_edits) == (1, "ready", False)


def test_patch_word_bumps_version_and_marks_edit(aws, demo_doc):
    seed(demo_doc)
    word, version = projects.patch_word("demo-project", "w2", {"text": "bhai", "style": {"color": "#ff2d55"}}, 1)
    assert (word.text, word.style.color, version) == ("bhai", "#ff2d55", 2)
    record = projects.get("demo-project")
    assert record.has_manual_edits and record.project.words[1].text == "bhai"


def test_patch_word_style_merges_and_null_removes(aws, demo_doc):
    seed(demo_doc)
    projects.patch_word("demo-project", "w2", {"style": {"color": "#fff", "shake": 3}}, None)
    word, _ = projects.patch_word("demo-project", "w2", {"style": {"shake": None}}, None)
    assert word.style.color == "#fff" and word.style.shake is None


def test_stale_version_is_409_not_overwrite(aws, demo_doc):
    seed(demo_doc)
    projects.patch_word("demo-project", "w1", {"text": "first"}, 1)
    with pytest.raises(projects.StaleVersion) as err:
        projects.patch_word("demo-project", "w1", {"text": "second"}, 1)
    assert err.value.current_version == 2
    assert projects.get("demo-project").project.words[0].text == "first"


def test_invalid_patch_writes_nothing(aws, demo_doc):
    seed(demo_doc)
    with pytest.raises(pydantic.ValidationError):
        projects.patch_word("demo-project", "w1", {"stretch": 0.5}, None)   # stretch >= 1
    assert projects.get("demo-project").version == 1


def test_unknown_word(aws, demo_doc):
    seed(demo_doc)
    with pytest.raises(projects.WordNotFound):
        projects.patch_word("demo-project", "w999", {"text": "x"}, None)


def test_patch_project_preset_and_settings(aws, demo_doc):
    seed(demo_doc)
    project, version = projects.patch_project("demo-project", {"presetId": "mrbeast", "settings": {"emojis": False}}, 1)
    assert project.presetId == "mrbeast" and project.settings.emojis is False
    assert project.settings.emotionLayer is True and version == 2
    assert projects.get("demo-project").preset_id == "mrbeast"


def test_oversized_project_rejected_before_write(aws, demo_doc):
    word = demo_doc["words"][0]
    demo_doc["words"] = [{**word, "id": f"w{i}", "text": "x" * 200} for i in range(2000)]
    with pytest.raises(projects.TooLarge):
        seed(demo_doc)


def test_create_then_get_has_no_project(aws):
    projects.create("abc", s3_key="t1/projects/abc/source.mp4", preset_id="minimal")
    record = projects.get("abc")
    assert record.project is None and record.status == "awaiting_upload" and record.preset_id == "minimal"
    with pytest.raises(Exception):
        projects.create("abc", s3_key=None, preset_id="minimal")   # no duplicate ids


def test_list_only_own_prefix(aws, demo_doc):
    seed(demo_doc)
    projects.create("abc", s3_key=None, preset_id="minimal")
    ids = {p["projectId"] for p in projects.list_projects()}
    assert ids == {"demo-project", "abc"}


def test_migrate_applies_steps_in_order(monkeypatch):
    monkeypatch.setattr(projects, "SCHEMA_VERSION", 3)
    monkeypatch.setattr(projects, "MIGRATIONS", [
        (1, 2, lambda d: {**d, "a": 1}), (2, 3, lambda d: {**d, "b": d["a"] + 1})])
    assert projects.migrate({}, 1) == {"a": 1, "b": 2}
    assert projects.migrate({"x": 0}, 3) == {"x": 0}
    with pytest.raises(ValueError):
        projects.migrate({}, 0)
