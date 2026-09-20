// The arithmetic for `Project.presetSegments` — the stretches of video drawn with a preset other
// than the project's. Pure, no React, no DOM: the timeline lane, the preset picker and the
// agent's mirror (services/api/app/agent/tools/preset_tools.py) all need the identical answer,
// the same rule `lib/layers.ts` follows for layer items.
//
// The schema demands segments be SORTED, DISJOINT and non-empty (`arePresetSegmentsValid`), and
// the reducer drops a project that fails that check. So every list that leaves this file goes
// through `normaliseSegments` — nothing here hands back a list the reducer would refuse.
import { MAX_PRESET_SEGMENTS } from '@captions/shared'
import type { PresetSegment } from '@captions/shared'

/**
 * The shortest segment worth having, matching `MIN_ITEM_MS` in lib/layers.ts and for the same
 * reason: anything shorter is a sliver you cannot see, click or remove.
 *
 * Found in a real browser, not reasoned about — dragging a segment's START edge past its END
 * clamped it to `endMs - 1`, leaving a 1 ms segment that had silently replaced a real one and
 * could not be got rid of.
 */
export const MIN_SEGMENT_MS = 100

/** The segment containing this time, or undefined — the project's own preset applies there. */
export function segmentAt(
  segments: readonly PresetSegment[],
  timeMs: number,
): PresetSegment | undefined {
  return segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs)
}

/** Two segments are the same look when neither the preset nor its tweaks differ. */
function sameLook(left: PresetSegment, right: PresetSegment): boolean {
  return (
    left.presetId === right.presetId &&
    JSON.stringify(left.presetOverride ?? null) === JSON.stringify(right.presetOverride ?? null)
  )
}

/**
 * Put a list into the shape the schema accepts: clamped to the video, sorted, disjoint, with the
 * empty ones dropped and TOUCHING segments of the same look folded together.
 *
 * The merge is not tidiness. Two adjacent segments with the same preset are indistinguishable on
 * screen, so leaving them split would put a boundary in `deriveBlocks` — and therefore a caption
 * break — where the viewer sees no change at all.
 */
export function normaliseSegments(
  segments: readonly PresetSegment[],
  durationMs: number,
): PresetSegment[] {
  const clamped = segments
    .map((segment) => ({
      ...segment,
      startMs: Math.round(Math.min(Math.max(0, segment.startMs), durationMs)),
      endMs: Math.round(Math.min(Math.max(0, segment.endMs), durationMs)),
    }))
    .filter((segment) => segment.endMs - segment.startMs >= MIN_SEGMENT_MS)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  const out: PresetSegment[] = []
  for (const segment of clamped) {
    const previous = out[out.length - 1]
    if (!previous) {
      out.push(segment)
      continue
    }
    // An overlap survives only as a bug upstream; the later segment yields rather than winning,
    // so the list can never reach the reducer in a shape it would drop.
    const start = Math.max(segment.startMs, previous.endMs)
    // A remnant left by a carve is dropped, not kept as a sliver — same rule as above.
    if (segment.endMs - start < MIN_SEGMENT_MS) continue
    const next = { ...segment, startMs: start }
    if (previous.endMs === next.startMs && sameLook(previous, next)) {
      out[out.length - 1] = { ...previous, endMs: next.endMs }
    } else {
      out.push(next)
    }
  }
  return out.slice(0, MAX_PRESET_SEGMENTS)
}

/**
 * Add or replace one segment, carving its range out of everything already there — create, move
 * and resize are all this one operation, exactly as they are in any editor: what you drop on top
 * wins, and what was underneath is trimmed, split or removed.
 *
 * A segment whose id already exists is REPLACED, so dragging an edge does not leave the old copy
 * behind to be carved by the new one.
 */
export function setSegment(
  segments: readonly PresetSegment[],
  next: PresetSegment,
  durationMs: number,
): PresetSegment[] {
  const carved: PresetSegment[] = []
  for (const segment of segments) {
    if (segment.id === next.id) continue
    if (segment.endMs <= next.startMs || segment.startMs >= next.endMs) {
      carved.push(segment)
      continue
    }
    // Covered entirely: it is gone.
    if (segment.startMs >= next.startMs && segment.endMs <= next.endMs) continue
    // Split in two: the new segment landed inside an existing one.
    if (segment.startMs < next.startMs && segment.endMs > next.endMs) {
      carved.push({ ...segment, endMs: next.startMs })
      carved.push({ ...segment, id: `${segment.id}-b`, startMs: next.endMs })
      continue
    }
    carved.push(
      segment.startMs < next.startMs
        ? { ...segment, endMs: next.startMs }
        : { ...segment, startMs: next.endMs },
    )
  }
  return normaliseSegments([...carved, next], durationMs)
}

export function removeSegment(
  segments: readonly PresetSegment[],
  id: string,
  durationMs: number,
): PresetSegment[] {
  return normaliseSegments(
    segments.filter((segment) => segment.id !== id),
    durationMs,
  )
}

/**
 * Drag the segment bodily to `startMs`, keeping its length and staying inside the video.
 * Mirrors `moveItemTo` in lib/layers.ts.
 */
export function moveSegmentTo(
  segment: PresetSegment,
  startMs: number,
  durationMs: number,
): PresetSegment {
  const length = segment.endMs - segment.startMs
  const start = Math.round(Math.min(Math.max(0, startMs), Math.max(0, durationMs - length)))
  return { ...segment, startMs: start, endMs: start + length }
}

/** Drag the LEFT edge. Never past `MIN_SEGMENT_MS` from the right one. */
export function resizeSegmentStart(segment: PresetSegment, startMs: number): PresetSegment {
  return {
    ...segment,
    startMs: Math.round(Math.min(Math.max(0, startMs), segment.endMs - MIN_SEGMENT_MS)),
  }
}

/** Drag the RIGHT edge. Never past `MIN_SEGMENT_MS` from the left one, nor past the video. */
export function resizeSegmentEnd(
  segment: PresetSegment,
  endMs: number,
  durationMs: number,
): PresetSegment {
  return {
    ...segment,
    endMs: Math.round(Math.min(Math.max(endMs, segment.startMs + MIN_SEGMENT_MS), durationMs)),
  }
}

/** Ids only have to be unique within the list; nothing parses them. */
export function newSegmentId(): string {
  return `seg-${Math.random().toString(36).slice(2, 8)}`
}
