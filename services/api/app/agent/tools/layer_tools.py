"""The agent's hands on the media layers: images and clips the user placed over the video.

What the agent can do here is exactly what the editor's own controls do, by the same rules, so a
voice command and a drag produce the same document:

    get_layers            what is there: ids, names, times, position, size
    update_layer_items    move / resize / rotate / fade / mute one or many items (named anchors too)
    retime_layer_item     slide it in time, or trim its start or end
    split_layer_item      cut one item in two at a moment
    set_layer_track       put items on layer 1 or 2 (2 draws on top)
    duplicate_layer_item  the same media again, at another time
    remove_layer_items    delete items

The arithmetic mirrors apps/web/src/lib/layers.ts rule for rule (tested against the same cases in
tests/test_layer_tools.py): PLACEMENT is output time (startMs..endMs), SOURCE TRIM is trimStartMs,
and the TRANSFORM is the item's centre and width as a percentage of the frame. Every tool returns
ONE `SetLayersAction` carrying the finished list, validated through `apply_patch` before it is
returned — never a half-applied change.

The agent cannot ADD new media: that needs a file, and the user has the file. It says so
(UNSUPPORTED) and points at the Add media button, rather than inventing an image.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schema import MAX_LAYER_ITEMS, LayerItem, Project

from ..contracts import SetLayersAction
from ..validation import PatchError, apply_patch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry

MIN_ITEM_MS = 100

#: The nine anchors people name, as the item's CENTRE in % of the frame. The editor's Layers panel
#: offers the same nine, at the same coordinates.
ANCHORS: dict[str, tuple[float, float]] = {
    "top-left": (20, 15), "top": (50, 15), "top-right": (80, 15),
    "left": (20, 50), "center": (50, 50), "right": (80, 50),
    "bottom-left": (20, 85), "bottom": (50, 85), "bottom-right": (80, 85),
}
Anchor = Literal[
    "top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right",
]

ItemIds = Annotated[list[str], Field(min_length=1)]


# --- shared arithmetic (mirrors apps/web/src/lib/layers.ts) --------------------------------------

def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def clamp_transform(item: LayerItem) -> LayerItem:
    return item.model_copy(update={
        "x": _clamp(item.x, -50, 150),
        "y": _clamp(item.y, -50, 150),
        "width": _clamp(item.width, 1, 400),
        "rotation": _clamp(item.rotation, -360, 360),
        "opacity": _clamp(item.opacity, 0, 1),
    })


def move_item_to(item: LayerItem, start_ms: float, project_ms: int) -> LayerItem:
    """Slide in time. Length and trim are untouched — moving never changes which part plays."""
    length = item.endMs - item.startMs
    start = round(_clamp(start_ms, 0, max(0, project_ms - length)))
    return item.model_copy(update={"startMs": start, "endMs": start + length})


def trim_item_start(item: LayerItem, start_ms: float) -> LayerItem:
    """Left edge. For a clip the source in-point moves by the same amount and never below 0."""
    start = round(_clamp(start_ms, 0, item.endMs - MIN_ITEM_MS))
    if item.kind == "video":
        start = max(start, item.startMs - item.trimStartMs)
    delta = start - item.startMs
    trim = item.trimStartMs + delta if item.kind == "video" else item.trimStartMs
    return item.model_copy(update={"startMs": start, "trimStartMs": trim})


def trim_item_end(item: LayerItem, end_ms: float, project_ms: int) -> LayerItem:
    """Right edge. A clip cannot run past the end of its own source."""
    limit = float(project_ms)
    if item.kind == "video" and item.sourceDurationMs is not None:
        limit = min(limit, item.startMs + (item.sourceDurationMs - item.trimStartMs))
    return item.model_copy(update={"endMs": round(_clamp(end_ms, item.startMs + MIN_ITEM_MS, limit))})


def split_item(item: LayerItem, at_ms: float, new_id: str) -> tuple[LayerItem, LayerItem] | None:
    at = round(at_ms)
    if at - item.startMs < MIN_ITEM_MS or item.endMs - at < MIN_ITEM_MS:
        return None
    first = item.model_copy(update={"endMs": at})
    second = item.model_copy(update={
        "id": new_id,
        "startMs": at,
        "trimStartMs": item.trimStartMs + (at - item.startMs) if item.kind == "video" else item.trimStartMs,
    })
    return first, second


def next_layer_id(items: list[LayerItem]) -> str:
    used = [int(item.id[1:]) for item in items if item.id[:1] == "L" and item.id[1:].isdigit()]
    return f"L{max([0, *used]) + 1}"


# --- helpers --------------------------------------------------------------------------------------

def _layers(project: Project) -> list[LayerItem]:
    return list(project.layers or [])


def _find(items: list[LayerItem], item_id: str) -> LayerItem:
    for item in items:
        if item.id == item_id:
            return item
    known = ", ".join(f"{i.id} ({i.name or i.kind})" for i in items) or "none"
    raise ToolExecutionError(f"no layer item {item_id!r}; the items are: {known}")


def _finish(project: Project, items: list[LayerItem]) -> "LayerPatchResult":
    patch = SetLayersAction(layers=items)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc
    return LayerPatchResult(patch=patch)


class LayerPatchResult(BaseModel):
    patch: SetLayersAction


# --- get_layers -----------------------------------------------------------------------------------

class GetLayersArgs(BaseModel):
    pass


class LayerSummary(BaseModel):
    id: str
    track: int
    kind: str
    name: str | None
    startMs: int
    endMs: int
    trimStartMs: int
    sourceDurationMs: int | None
    x: float
    y: float
    width: float
    rotation: float
    opacity: float
    muted: bool


class GetLayersResult(BaseModel):
    projectDurationMs: int
    maxItems: int
    items: list[LayerSummary]


def get_layers(args: GetLayersArgs, project: Project) -> GetLayersResult:
    return GetLayersResult(
        projectDurationMs=project.durationMs,
        maxItems=MAX_LAYER_ITEMS,
        items=[LayerSummary(**item.model_dump(include=set(LayerSummary.model_fields))) for item in _layers(project)],
    )


# --- update_layer_items ---------------------------------------------------------------------------

class UpdateLayerItemsArgs(BaseModel):
    itemIds: ItemIds
    position: Anchor | None = Field(default=None, description="A named spot; sets x and y.")
    x: float | None = Field(default=None, description="Centre, % of frame width (-50..150).")
    y: float | None = Field(default=None, description="Centre, % of frame height (-50..150).")
    width: float | None = Field(default=None, gt=0, description="Size as % of the frame's width.")
    scaleBy: float | None = Field(default=None, gt=0, description="Multiply the current size: 1.3 = 30% bigger.")
    rotation: float | None = Field(default=None, description="Degrees.")
    opacity: float | None = Field(default=None, ge=0, le=1)
    muted: bool | None = Field(default=None, description="Clips only.")


def update_layer_items(args: UpdateLayerItemsArgs, project: Project) -> LayerPatchResult:
    if all(v is None for v in (args.position, args.x, args.y, args.width, args.scaleBy, args.rotation,
                               args.opacity, args.muted)):
        raise ToolExecutionError("nothing to change: give a position, x/y, width or scaleBy, rotation, opacity or muted")
    if args.width is not None and args.scaleBy is not None:
        raise ToolExecutionError("give width OR scaleBy, not both")
    items = _layers(project)
    targets = {item_id: _find(items, item_id) for item_id in dict.fromkeys(args.itemIds)}
    changed = []
    for item in items:
        if item.id not in targets:
            changed.append(item)
            continue
        update: dict = {}
        if args.position:
            update["x"], update["y"] = ANCHORS[args.position]
        if args.x is not None:
            update["x"] = args.x
        if args.y is not None:
            update["y"] = args.y
        if args.width is not None:
            update["width"] = args.width
        if args.scaleBy is not None:
            update["width"] = item.width * args.scaleBy
        if args.rotation is not None:
            update["rotation"] = args.rotation
        if args.opacity is not None:
            update["opacity"] = args.opacity
        if args.muted is not None:
            update["muted"] = args.muted
        changed.append(clamp_transform(item.model_copy(update=update)))
    return _finish(project, changed)


# --- retime_layer_item ----------------------------------------------------------------------------

class RetimeLayerItemArgs(BaseModel):
    itemId: str
    moveToMs: int | None = Field(default=None, ge=0, description="Slide it so it STARTS here; length and trim kept.")
    startMs: int | None = Field(default=None, ge=0, description="Trim its START edge to here (a clip's in-point moves too).")
    endMs: int | None = Field(default=None, ge=0, description="Trim its END edge to here.")
    trimStartMs: int | None = Field(default=None, ge=0, description="Clips: which moment of the source it opens on.")


def retime_layer_item(args: RetimeLayerItemArgs, project: Project) -> LayerPatchResult:
    if args.moveToMs is not None and (args.startMs is not None or args.endMs is not None):
        raise ToolExecutionError("moveToMs slides the whole item; do not combine it with startMs/endMs")
    items = _layers(project)
    item = _find(items, args.itemId)
    if all(v is None for v in (args.moveToMs, args.startMs, args.endMs, args.trimStartMs)):
        raise ToolExecutionError("nothing to change: give moveToMs, startMs, endMs or trimStartMs")
    if args.moveToMs is not None:
        item = move_item_to(item, args.moveToMs, project.durationMs)
    if args.startMs is not None:
        item = trim_item_start(item, args.startMs)
    if args.endMs is not None:
        item = trim_item_end(item, args.endMs, project.durationMs)
    if args.trimStartMs is not None:
        if item.kind != "video":
            raise ToolExecutionError("trimStartMs only applies to clips; an image has no source time")
        room = (item.sourceDurationMs or 10**9) - (item.endMs - item.startMs)
        item = item.model_copy(update={"trimStartMs": int(_clamp(args.trimStartMs, 0, max(0, room)))})
    return _finish(project, [item if i.id == item.id else i for i in items])


# --- split_layer_item -----------------------------------------------------------------------------

class SplitLayerItemArgs(BaseModel):
    itemId: str
    atMs: int = Field(ge=0, description="Output time of the cut.")


def split_layer_item(args: SplitLayerItemArgs, project: Project) -> LayerPatchResult:
    items = _layers(project)
    item = _find(items, args.itemId)
    if len(items) >= MAX_LAYER_ITEMS:
        raise ToolExecutionError(f"a project holds at most {MAX_LAYER_ITEMS} layer items")
    halves = split_item(item, args.atMs, next_layer_id(items))
    if halves is None:
        raise ToolExecutionError(
            f"{args.atMs}ms is not inside {item.id} ({item.startMs}-{item.endMs}ms) with at least "
            f"{MIN_ITEM_MS}ms either side"
        )
    index = items.index(item)
    return _finish(project, [*items[:index], *halves, *items[index + 1:]])


# --- set_layer_track ------------------------------------------------------------------------------

class SetLayerTrackArgs(BaseModel):
    itemIds: ItemIds
    track: Literal[1, 2] = Field(description="2 draws on top of 1; both draw under the captions.")


def set_layer_track(args: SetLayerTrackArgs, project: Project) -> LayerPatchResult:
    items = _layers(project)
    wanted = {_find(items, item_id).id for item_id in args.itemIds}
    return _finish(project, [i.model_copy(update={"track": args.track}) if i.id in wanted else i for i in items])


# --- duplicate_layer_item -------------------------------------------------------------------------

class DuplicateLayerItemArgs(BaseModel):
    itemId: str
    startMs: int | None = Field(default=None, ge=0, description="Where the copy starts; default right after the original.")


def duplicate_layer_item(args: DuplicateLayerItemArgs, project: Project) -> LayerPatchResult:
    items = _layers(project)
    source = _find(items, args.itemId)
    if len(items) >= MAX_LAYER_ITEMS:
        raise ToolExecutionError(f"a project holds at most {MAX_LAYER_ITEMS} layer items")
    copy = source.model_copy(update={"id": next_layer_id(items)})
    copy = move_item_to(copy, source.endMs if args.startMs is None else args.startMs, project.durationMs)
    return _finish(project, [*items, copy])


# --- remove_layer_items ---------------------------------------------------------------------------

class RemoveLayerItemsArgs(BaseModel):
    itemIds: ItemIds


def remove_layer_items(args: RemoveLayerItemsArgs, project: Project) -> LayerPatchResult:
    items = _layers(project)
    gone = {_find(items, item_id).id for item_id in args.itemIds}
    return _finish(project, [i for i in items if i.id not in gone])


# --- registration ---------------------------------------------------------------------------------

def _register(name: str, description: str, args, handler, writes: bool = True, result=LayerPatchResult):
    default_registry.register(
        ToolSpec(
            name=name,
            description=description,
            input_model=args,
            output_model=result,
            reads=True,
            writes=writes,
            status=ToolStatus.AVAILABLE,
            notes="Media layers. Returns ONE SetLayersAction with the finished list (see module docstring).",
        ),
        handler,
    )


_register(
    "get_layers",
    "List the images and clips the user placed over the video (media layers): id, name (the "
    "uploaded file's name — 'the logo' is usually the item named logo.png), kind, track, when it "
    "is on screen (startMs..endMs), and where it sits (x/y are its CENTRE in % of the frame, width "
    "is % of the frame's width). Call this before any layer edit — never guess an item id.",
    GetLayersArgs, get_layers, writes=False, result=GetLayersResult,
)
_register(
    "update_layer_items",
    "Move, resize, rotate, fade or mute layer items. `position` names a spot (top-left, top, "
    "top-right, left, center, right, bottom-left, bottom, bottom-right). 'Bigger' is scaleBy 1.3, "
    "'a lot bigger' 1.7, 'smaller' 0.75; 'half the width of the video' is width 50. Pass every id "
    "that should change in one call.",
    UpdateLayerItemsArgs, update_layer_items,
)
_register(
    "retime_layer_item",
    "Change WHEN a layer item is on screen. `moveToMs` slides it (keeps its length), `startMs` / "
    "`endMs` trim its edges ('show the logo until 8 seconds' = endMs 8000; 'start the clip at 3 "
    "seconds' when it should keep ending where it does = startMs 3000). For a clip, `trimStartMs` "
    "picks which moment of the clip it opens on. A clip can never run past the end of its source.",
    RetimeLayerItemArgs, retime_layer_item,
)
_register(
    "split_layer_item",
    "Cut one layer item in two at `atMs` (output time), e.g. 'cut the clip at 5 seconds'. Both "
    "halves play seamlessly until one is moved; the second half gets a new id. This splits an "
    "OVERLAY item — the main video itself cannot be cut.",
    SplitLayerItemArgs, split_layer_item,
)
_register(
    "set_layer_track",
    "Put layer items on layer 1 or layer 2. Layer 2 draws ON TOP of layer 1 ('bring the picture to "
    "the front' = track 2); both draw under the captions.",
    SetLayerTrackArgs, set_layer_track,
)
_register(
    "duplicate_layer_item",
    "Show the same image or clip again at another time ('put the logo again at 15 seconds'). The "
    "copy keeps its position and size.",
    DuplicateLayerItemArgs, duplicate_layer_item,
)
_register(
    "remove_layer_items",
    "Delete layer items ('remove the picture', 'get rid of all the stickers').",
    RemoveLayerItemsArgs, remove_layer_items,
)
