"""The media-layer tools, against the SAME numeric cases as apps/web/scripts/check-layers.ts.

The editor and the agent implement the layer arithmetic twice (TypeScript and Python). These are
the cases that pin them together: if one side changes a rule, one of the two suites fails.

Run:  python -m app.agent.tests.test_layer_tools
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from app.agent.tests._fixtures import fixtures_dir  # noqa: E402
from app.agent.tools import default_registry  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.layer_tools import (  # noqa: E402
    DuplicateLayerItemArgs,
    GetLayersArgs,
    RemoveLayerItemsArgs,
    RetimeLayerItemArgs,
    SetLayerTrackArgs,
    SplitLayerItemArgs,
    UpdateLayerItemsArgs,
    duplicate_layer_item,
    get_layers,
    move_item_to,
    remove_layer_items,
    retime_layer_item,
    set_layer_track,
    split_item,
    split_layer_item,
    trim_item_end,
    trim_item_start,
    update_layer_items,
)
from app.schema import LayerItem, Project  # noqa: E402

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{'  — ' + detail if detail and not ok else ''}")
    if not ok:
        FAILURES.append(name)


def raises(fn) -> bool:
    try:
        fn()
    except ToolExecutionError:
        return True
    return False


BASE = LayerItem(
    id="L1", track=1, kind="video", mediaId="0123456789ab.mp4", startMs=2000, endMs=6000,
    trimStartMs=1000, sourceDurationMs=10_000, x=50, y=50, width=40, aspect=16 / 9,
    rotation=0, opacity=1, muted=True,
)
IMAGE = BASE.model_copy(update={"id": "L2", "kind": "image", "mediaId": "0123456789ab.png",
                                "trimStartMs": 0, "sourceDurationMs": None, "aspect": 1, "name": "logo.png"})


def project_with(*items: LayerItem) -> Project:
    doc = json.loads((fixtures_dir() / "demo-project.json").read_text())
    doc["durationMs"] = 20_000
    doc["layers"] = [item.model_dump(mode="json", exclude_none=True) for item in items]
    return Project.model_validate(doc)


def after(result) -> list[LayerItem]:
    return list(result.patch.layers)


def main() -> int:
    # --- the arithmetic, the same cases as check-layers.ts --------------------------------------
    moved = move_item_to(BASE, 9000, 20_000)
    check("moving keeps length AND trim", (moved.startMs, moved.endMs, moved.trimStartMs) == (9000, 13000, 1000))
    check("moving cannot run past the end", move_item_to(BASE, 19_000, 20_000).endMs == 20_000)
    trimmed = trim_item_start(BASE, 3000)
    check("left edge in advances the in-point equally", (trimmed.startMs, trimmed.trimStartMs, trimmed.endMs) == (3000, 2000, 6000))
    check("left edge cannot pull in source before the file", (trim_item_start(BASE, 0).startMs, trim_item_start(BASE, 0).trimStartMs) == (1000, 0))
    check("an image's trim never moves", trim_item_start(IMAGE, 3000).trimStartMs == 0)
    check("right edge cannot pass the source end", trim_item_end(BASE, 30_000, 60_000).endMs == 11_000)
    halves = split_item(BASE, 3500, "L9")
    check("split meets exactly at the cut", halves is not None and halves[0].endMs == 3500 and halves[1].startMs == 3500)
    check("second half's trim advances by the first half's length", halves is not None and halves[1].trimStartMs == 2500)
    check("a split at the edge is refused", split_item(BASE, 2050, "L9") is None and split_item(BASE, 6000, "L9") is None)

    # --- the tools ------------------------------------------------------------------------------
    project = project_with(BASE, IMAGE)
    listed = get_layers(GetLayersArgs(), project)
    check("get_layers lists every item with its name", [i.id for i in listed.items] == ["L1", "L2"] and listed.items[1].name == "logo.png")

    out = after(update_layer_items(UpdateLayerItemsArgs(itemIds=["L2"], position="top-right", scaleBy=1.5), project))
    logo = next(i for i in out if i.id == "L2")
    check("'top right, bigger' → the anchor and 1.5x the width", (logo.x, logo.y, logo.width) == (80, 15, 60))
    check("…and the other item is untouched", next(i for i in out if i.id == "L1") == BASE)
    check("sizes are clamped into the schema's range", next(
        i for i in after(update_layer_items(UpdateLayerItemsArgs(itemIds=["L2"], scaleBy=100), project)) if i.id == "L2").width == 400)
    check("an unknown id names the real items", raises(lambda: update_layer_items(UpdateLayerItemsArgs(itemIds=["L7"], x=5), project)))
    check("a call that changes nothing is refused", raises(lambda: update_layer_items(UpdateLayerItemsArgs(itemIds=["L2"]), project)))

    out = after(retime_layer_item(RetimeLayerItemArgs(itemId="L1", endMs=5000), project))
    check("'until 5 seconds' trims the end", next(i for i in out if i.id == "L1").endMs == 5000)
    out = after(retime_layer_item(RetimeLayerItemArgs(itemId="L1", moveToMs=10_000), project))
    check("'move it to 10 s' slides it, length kept", (next(i for i in out if i.id == "L1").startMs, next(i for i in out if i.id == "L1").endMs) == (10_000, 14_000))
    check("an image has no trimStartMs", raises(lambda: retime_layer_item(RetimeLayerItemArgs(itemId="L2", trimStartMs=500), project)))

    out = after(split_layer_item(SplitLayerItemArgs(itemId="L1", atMs=4000), project))
    check("split_layer_item puts both halves where the original was, new id L3", [i.id for i in out] == ["L1", "L3", "L2"] and out[1].trimStartMs == 3000)
    check("a cut outside the item explains why", raises(lambda: split_layer_item(SplitLayerItemArgs(itemId="L1", atMs=15_000), project)))

    out = after(set_layer_track(SetLayerTrackArgs(itemIds=["L2"], track=2), project))
    check("'bring the logo to the front' = track 2", next(i for i in out if i.id == "L2").track == 2)

    out = after(duplicate_layer_item(DuplicateLayerItemArgs(itemId="L2", startMs=12_000), project))
    copy = out[-1]
    check("duplicate keeps the look, new time, new id", copy.id == "L3" and copy.startMs == 12_000 and (copy.x, copy.width) == (IMAGE.x, IMAGE.width))

    out = after(remove_layer_items(RemoveLayerItemsArgs(itemIds=["L1", "L2"]), project))
    check("removing everything returns an empty list", out == [])

    # --- registration --------------------------------------------------------------------------
    names = {spec.name for spec in default_registry.list_specs()}
    check("all seven layer tools are registered", {"get_layers", "update_layer_items", "retime_layer_item", "split_layer_item",
                                                    "set_layer_track", "duplicate_layer_item", "remove_layer_items"} <= names)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
