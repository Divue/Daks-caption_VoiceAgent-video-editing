"""The preset-segment arithmetic, mirroring apps/web/src/lib/preset-segments.ts.

Same relationship `layer_tools.py` has with `lib/layers.ts`: two implementations of one set of
numbers, tested against the same cases on both sides. Change one, change both.

Everything that leaves this module has been through `normalise`, so it is sorted, disjoint,
non-empty and clamped to the video — the shape `Project` demands and the editor's reducer would
otherwise silently drop.
"""
from __future__ import annotations

import uuid

from app.schema import MAX_PRESET_SEGMENTS, PresetSegment


def segment_at(segments: list[PresetSegment], time_ms: int) -> PresetSegment | None:
    """The segment containing this time, or None — the project's own preset applies there."""
    for segment in segments:
        if segment.startMs <= time_ms < segment.endMs:
            return segment
    return None


def _same_look(left: PresetSegment, right: PresetSegment) -> bool:
    return left.presetId == right.presetId and left.presetOverride == right.presetOverride


def normalise(segments: list[PresetSegment], duration_ms: int) -> list[PresetSegment]:
    """Clamped, sorted, disjoint, with the empty ones dropped and touching segments of the same
    look folded together.

    The merge is not tidiness: two adjacent segments with the same preset are indistinguishable on
    screen, so leaving them split would put a caption break (deriveBlocks groups per segment)
    where the viewer sees no change at all.
    """
    clamped: list[PresetSegment] = []
    for segment in segments:
        start = min(max(0, segment.startMs), duration_ms)
        end = min(max(0, segment.endMs), duration_ms)
        if end > start:
            clamped.append(segment.model_copy(update={"startMs": start, "endMs": end}))
    clamped.sort(key=lambda s: (s.startMs, s.endMs))

    out: list[PresetSegment] = []
    for segment in clamped:
        if not out:
            out.append(segment)
            continue
        previous = out[-1]
        # An overlap can only arrive as a bug upstream; the later segment yields rather than
        # winning, so the list can never reach the store in a shape it would refuse.
        start = max(segment.startMs, previous.endMs)
        if segment.endMs <= start:
            continue
        nxt = segment.model_copy(update={"startMs": start})
        if previous.endMs == nxt.startMs and _same_look(previous, nxt):
            out[-1] = previous.model_copy(update={"endMs": nxt.endMs})
        else:
            out.append(nxt)
    return out[:MAX_PRESET_SEGMENTS]


def set_segment(
    segments: list[PresetSegment], new: PresetSegment, duration_ms: int
) -> list[PresetSegment]:
    """Add or replace one segment, carving its range out of everything already there.

    Create, move and resize are all this one operation, exactly as they are in any editor: what is
    dropped on top wins, and what was underneath is trimmed, split or removed. A segment whose id
    already exists is REPLACED rather than carved against, so a resize leaves no stub behind.
    """
    carved: list[PresetSegment] = []
    for segment in segments:
        if segment.id == new.id:
            continue
        if segment.endMs <= new.startMs or segment.startMs >= new.endMs:
            carved.append(segment)
            continue
        if segment.startMs >= new.startMs and segment.endMs <= new.endMs:
            continue  # covered entirely
        if segment.startMs < new.startMs and segment.endMs > new.endMs:
            carved.append(segment.model_copy(update={"endMs": new.startMs}))
            carved.append(segment.model_copy(update={"id": f"{segment.id}-b", "startMs": new.endMs}))
            continue
        carved.append(
            segment.model_copy(update={"endMs": new.startMs})
            if segment.startMs < new.startMs
            else segment.model_copy(update={"startMs": new.endMs})
        )
    return normalise([*carved, new], duration_ms)


def new_segment_id() -> str:
    """Ids only have to be unique within the list; nothing parses them."""
    return f"seg-{uuid.uuid4().hex[:6]}"
