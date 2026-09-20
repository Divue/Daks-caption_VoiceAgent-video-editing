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

#: The shortest segment worth having, mirroring MIN_SEGMENT_MS in
#: apps/web/src/lib/preset-segments.ts (itself matching MIN_ITEM_MS in lib/layers.ts): anything
#: shorter is a sliver nobody can see, click or remove. Found in a real browser, not reasoned
#: about — a start-edge drag past the end left a 1 ms segment that had replaced a real one.
MIN_SEGMENT_MS = 100


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
        if end - start >= MIN_SEGMENT_MS:
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
        # A remnant left by a carve is dropped, not kept as a sliver — same rule as above.
        if segment.endMs - start < MIN_SEGMENT_MS:
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


def move_segment_to(segment: PresetSegment, start_ms: int, duration_ms: int) -> PresetSegment:
    """Move the segment bodily, keeping its length. Mirrors moveSegmentTo in preset-segments.ts."""
    length = segment.endMs - segment.startMs
    start = round(min(max(0, start_ms), max(0, duration_ms - length)))
    return segment.model_copy(update={"startMs": start, "endMs": start + length})


def resize_segment_start(segment: PresetSegment, start_ms: int) -> PresetSegment:
    """Drag the LEFT edge. Never past MIN_SEGMENT_MS from the right one."""
    return segment.model_copy(
        update={"startMs": round(min(max(0, start_ms), segment.endMs - MIN_SEGMENT_MS))}
    )


def resize_segment_end(segment: PresetSegment, end_ms: int, duration_ms: int) -> PresetSegment:
    """Drag the RIGHT edge. Never past MIN_SEGMENT_MS from the left one, nor past the video."""
    return segment.model_copy(
        update={"endMs": round(min(max(end_ms, segment.startMs + MIN_SEGMENT_MS), duration_ms))}
    )


def new_segment_id() -> str:
    """Ids only have to be unique within the list; nothing parses them."""
    return f"seg-{uuid.uuid4().hex[:6]}"
