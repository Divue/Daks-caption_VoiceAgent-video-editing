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
    .filter((segment) => segment.endMs > segment.startMs)
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
    if (segment.endMs <= start) continue
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

/** Ids only have to be unique within the list; nothing parses them. */
export function newSegmentId(): string {
  return `seg-${Math.random().toString(36).slice(2, 8)}`
}
