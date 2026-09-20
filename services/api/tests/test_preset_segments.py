"""`Project.presetSegments` — stretches of video drawn with a preset other than the project's.

Optional and additive, like `layers` and `presetOverride` before it, so a stored v2 document
parses unchanged. That no-migration claim is asserted for real below, not assumed.

The field is written as a WHOLE LIST, not per item, because creating a segment carves the ones it
lands on: "apply Chamak from 4s to 7s" can trim, split or remove any number of existing segments,
and there is no per-item expression of that. Same shape, same reason as `layers`.

The sorted/disjoint rule is enforced by the Project model itself, so an overlapping list is a 422
and never a write — "which preset is this word in" has to have exactly one answer.
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


SEGMENTS = [
    {"id": "a", "startMs": 0, "endMs": 4000, "presetId": "chamak"},
    {"id": "b", "startMs": 4000, "endMs": 9000, "presetId": "nazm",
     "presetOverride": {"wordsPerLine": 2, "emphasisScale": 1.8}},
]


def test_absent_is_valid_and_needs_no_migration(demo_doc):
    """The fixture has no `presetSegments` key at all and must parse exactly as before."""
    assert "presetSegments" not in demo_doc
    project = Project.model_validate(demo_doc)
    assert project.presetSegments is None
    # Round-tripping must not invent the key either, or every stored row grows on next write.
    assert "presetSegments" not in project.model_dump(exclude_none=True)


def test_segments_parse_with_their_own_override(demo_doc):
    project = Project.model_validate({**demo_doc, "presetSegments": SEGMENTS})
    assert [s.presetId for s in project.presetSegments] == ["chamak", "nazm"]
    # A segment's override is the SAME shape as the project's — same merge, same allow-list.
    assert project.presetSegments[1].presetOverride.wordsPerLine == 2
    assert project.presetSegments[0].presetOverride is None


@pytest.mark.parametrize("bad, why", [
    ([{"id": "a", "startMs": 0, "endMs": 5000, "presetId": "chamak"},
      {"id": "b", "startMs": 3000, "endMs": 8000, "presetId": "nazm"}], "overlapping"),
    ([{"id": "b", "startMs": 5000, "endMs": 8000, "presetId": "nazm"},
      {"id": "a", "startMs": 0, "endMs": 3000, "presetId": "chamak"}], "out of order"),
    ([{"id": "a", "startMs": 1000, "endMs": 1000, "presetId": "chamak"}], "zero length"),
    ([{"id": "a", "startMs": 1000, "endMs": 900, "presetId": "chamak"}], "backwards"),
])
def test_a_list_with_no_single_answer_is_refused(demo_doc, bad, why):
    with pytest.raises(pydantic.ValidationError):
        Project.model_validate({**demo_doc, "presetSegments": bad})


def test_unknown_preset_id_is_refused(demo_doc):
    with pytest.raises(pydantic.ValidationError):
        Project.model_validate({**demo_doc, "presetSegments": [
            {"id": "a", "startMs": 0, "endMs": 1000, "presetId": "kathmandu"}]})


def test_patch_replaces_the_whole_list(aws, demo_doc):
    project = _seed(demo_doc)
    api = client()

    first = api.patch(f"/projects/{project.id}", json={"presetSegments": SEGMENTS})
    assert first.status_code == 200, first.text
    assert len(first.json()["project"]["presetSegments"]) == 2

    # Replacing, not merging: one segment in means one segment stored, not three.
    only = [{"id": "c", "startMs": 2000, "endMs": 3000, "presetId": "dhamaka"}]
    second = api.patch(
        f"/projects/{project.id}",
        json={"presetSegments": only, "version": first.json()["version"]},
    )
    assert second.status_code == 200, second.text
    assert second.json()["project"]["presetSegments"] == only


def test_empty_list_removes_the_key(aws, demo_doc):
    """`[]` and absent mean the same thing, so the stored document loses the key entirely."""
    project = _seed(demo_doc)
    api = client()
    seeded = api.patch(f"/projects/{project.id}", json={"presetSegments": SEGMENTS})
    cleared = api.patch(
        f"/projects/{project.id}",
        json={"presetSegments": [], "version": seeded.json()["version"]},
    )
    assert cleared.status_code == 200, cleared.text
    assert "presetSegments" not in cleared.json()["project"]
    assert store.get(project.id).project.presetSegments is None


def test_an_overlapping_patch_is_a_422_and_not_a_write(aws, demo_doc):
    project = _seed(demo_doc)
    api = client()
    before = store.get(project.id).version
    bad = api.patch(f"/projects/{project.id}", json={"presetSegments": [
        {"id": "a", "startMs": 0, "endMs": 5000, "presetId": "chamak"},
        {"id": "b", "startMs": 3000, "endMs": 8000, "presetId": "nazm"},
    ]})
    assert bad.status_code == 422, bad.text
    record = store.get(project.id)
    assert record.version == before, "a refused patch must not have bumped the version"
    assert record.project.presetSegments is None


def test_segments_survive_a_patch_of_another_field(aws, demo_doc):
    """A `presetId` write must not quietly drop the segments sitting next to it."""
    project = _seed(demo_doc)
    api = client()
    seeded = api.patch(f"/projects/{project.id}", json={"presetSegments": SEGMENTS})
    other = api.patch(
        f"/projects/{project.id}",
        json={"presetId": "mrbeast", "version": seeded.json()["version"]},
    )
    assert other.status_code == 200, other.text
    assert len(other.json()["project"]["presetSegments"]) == 2
