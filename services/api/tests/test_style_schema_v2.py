"""Schema v2: the caption style panel's `Style` additions, the preset rename and its migration.

Three things are pinned here, all of which were reachable bugs rather than theory:

1. A stored v1 project must survive the rename. `presetId: "kathmandu"` is not in the v2 enum, so
   without the migration every project written before this change fails validation on read.
2. `Style.uppercase` became `Style.textCase`. Same problem, one level deeper — inside every word's
   and overlay's optional style override.
3. Clearing a style override has to actually reach the store. The editor used to emit `undefined`
   for a removed key, `JSON.stringify` dropped it, and the removal never left the browser; the
   round trip below is what proves the explicit-null path works end to end.
"""
from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.schema import Project, StylePatch
from app.store import projects as store


def _seed(project_id: str, demo_doc: dict) -> str:
    """A stored, ready project under `project_id`. Returns the first word's id."""
    doc = json.loads(json.dumps(demo_doc))
    doc["id"] = project_id          # put_project refuses a doc whose id is not the row's id
    store.create(project_id, s3_key=None, preset_id="rangmanch")
    store.put_project(project_id, Project.model_validate(doc), expected_version=None,
                      manual_edit=False, seed=True)
    return doc["words"][0]["id"]


def test_v1_doc_migrates_preset_id_and_text_case(demo_doc):
    doc = json.loads(json.dumps(demo_doc))
    doc["presetId"] = "kathmandu"
    doc["words"][0]["style"] = {"uppercase": True, "color": "#FF0000"}
    doc["words"][1]["style"] = {"uppercase": False}
    doc["overlays"] = [{
        "id": "o1", "text": "hi", "startMs": 0, "endMs": 100, "x": 50, "y": 50,
        "style": {"uppercase": True},
    }]

    migrated = store.migrate(doc, 1)

    assert migrated["presetId"] == "rangmanch"
    assert migrated["words"][0]["style"] == {"textCase": "upper", "color": "#FF0000"}
    # `uppercase: false` carried no information an absent key does not, so the whole override goes.
    assert "style" not in migrated["words"][1]
    assert migrated["overlays"][0]["style"] == {"textCase": "upper"}
    # And the result is a valid v2 Project, which is the only thing that actually matters.
    Project.model_validate(migrated)


def test_migrate_is_a_no_op_for_a_doc_that_is_already_v2(demo_doc):
    doc = json.loads(json.dumps(demo_doc))
    doc["words"][0]["style"] = {"textCase": "lower"}
    assert store.migrate(json.loads(json.dumps(doc)), 2) == doc


def test_v1_row_in_dynamo_is_readable_after_the_rename(aws, demo_doc):
    """The end-to-end version of the first test: a row written before v2, read back through get()."""
    doc = json.loads(json.dumps(demo_doc))
    doc["presetId"] = "kathmandu"
    doc["words"][0]["style"] = {"uppercase": True}

    store.create("p-old", s3_key=None, preset_id="kathmandu")
    # Write the raw v1 item by hand — put_project would validate it against the v2 schema first.
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
    assert record.project is not None
    assert record.project.presetId == "rangmanch"
    assert record.project.words[0].style is not None
    assert record.project.words[0].style.textCase == "upper"


def test_new_style_fields_round_trip(aws, demo_doc):
    """Every field added for the style panel survives a PATCH and a re-read."""
    word_id = _seed("p1", demo_doc)

    style = {
        "letterSpacing": -0.053,
        "lineHeight": 0.9,
        "strokeWidth": 4,
        "strokeColor": "#000000",
        "glowColor": "#A0D83E",
        "glow": 100,
        "italic": True,
        "textCase": "lower",
        "gradientStops": [
            {"color": "#A0D83E", "at": 0},
            {"color": "#CAE993", "at": 50},
            {"color": "#A0D83E", "at": 100},
        ],
    }
    store.patch_word("p1", word_id, {"style": style}, expected_version=None)

    stored = store.get("p1").project
    assert stored is not None
    saved = stored.words[0].style
    assert saved is not None
    assert saved.letterSpacing == -0.053
    assert saved.lineHeight == 0.9
    assert saved.strokeWidth == 4
    assert saved.glowColor == "#A0D83E"
    assert saved.italic is True
    assert saved.textCase == "lower"
    assert saved.gradientStops is not None and len(saved.gradientStops) == 3
    assert saved.gradientStops[1].at == 50


def test_clearing_one_style_key_persists(aws, demo_doc):
    """Blocker 1: an explicit null removes exactly one key and leaves the rest alone."""
    word_id = _seed("p2", demo_doc)

    store.patch_word("p2", word_id, {"style": {"color": "#FF0000", "letterSpacing": -0.05}},
                     expected_version=None)
    store.patch_word("p2", word_id, {"style": {"letterSpacing": None}}, expected_version=None)

    saved = store.get("p2").project.words[0].style
    assert saved is not None
    assert saved.color == "#FF0000"
    assert saved.letterSpacing is None
    # The removal must be gone from the stored JSON, not merely None in the model — the editor
    # reloads from this document and `exclude_none` is what it is dumped with.
    raw = json.loads(store.get("p2").project.model_dump_json(exclude_none=True))
    assert "letterSpacing" not in raw["words"][0]["style"]


def test_clearing_the_last_style_key_drops_the_whole_override(aws, demo_doc):
    word_id = _seed("p3", demo_doc)

    store.patch_word("p3", word_id, {"style": {"color": "#FF0000"}}, expected_version=None)
    store.patch_word("p3", word_id, {"style": {"color": None}}, expected_version=None)

    assert store.get("p3").project.words[0].style is None


def test_old_preset_id_is_rejected_by_the_v2_schema(demo_doc):
    """If this ever starts passing, the migration has quietly become optional — it is not."""
    doc = json.loads(json.dumps(demo_doc))
    doc["presetId"] = "kathmandu"
    with pytest.raises(ValidationError):
        Project.model_validate(doc)


def test_uppercase_is_no_longer_accepted():
    """StylePatch is not extra=forbid, but `uppercase` must not silently round-trip as a real field."""
    patch = StylePatch.model_validate({"uppercase": True})
    assert not hasattr(patch, "uppercase")
    assert patch.textCase is None


@pytest.mark.parametrize("presetId", ["rangmanch", "chamak", "nazm", "dhamaka",
                                      "mrbeast", "minimal", "hinglish-bold"])
def test_every_preset_id_validates(demo_doc, presetId):
    doc = json.loads(json.dumps(demo_doc))
    doc["presetId"] = presetId
    assert Project.model_validate(doc).presetId == presetId
