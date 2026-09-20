import { useCallback, useMemo } from 'react'
import type { PresetId, PresetSegment } from '@captions/shared'
import {
  newSegmentId,
  normaliseSegments,
  removeSegment as removeSegmentIn,
  segmentAt,
  setSegment as setSegmentIn,
} from '@/lib/preset-segments'
import { usePlayback } from '@/state/playback-context'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'

export interface PresetSegmentEditor {
  segments: PresetSegment[]
  /** The segment the playhead is in, or undefined — the project's own preset applies there. */
  activeSegment: PresetSegment | undefined
  /** Add or replace one segment, carving the ranges it lands on. One write, one Ctrl+Z. */
  setSegment: (next: PresetSegment) => void
  removeSegment: (id: string) => void
  /** A new segment over this range, with a fresh id. Returns what was written. */
  addSegment: (startMs: number, endMs: number, presetId: PresetId) => PresetSegment
}

/**
 * The preset lane's writer.
 *
 * Every change is ONE write of the whole `presetSegments` list through `patchProjectFields` — the
 * same rule the media layers follow (`layer-editor-context.tsx`), and for the same reason:
 * creating a segment carves the ones it overlaps, so there is no clean per-item expression, and
 * one write is one save and one Ctrl+Z.
 *
 * The arithmetic is all in `lib/preset-segments.ts`, which also guarantees the list comes back
 * sorted, disjoint and non-empty — the shape the schema demands and the reducer would otherwise
 * silently drop.
 */
export function usePresetSegments(): PresetSegmentEditor {
  const { project } = useProject()
  const { timeMs } = usePlayback()
  const { patchProjectFields } = useWordPatch()
  const durationMs = project.durationMs
  const segments = useMemo(() => project.presetSegments ?? [], [project.presetSegments])

  const write = useCallback(
    (next: PresetSegment[]) => {
      void patchProjectFields({ presetSegments: normaliseSegments(next, durationMs) })
    },
    [patchProjectFields, durationMs],
  )

  const setSegment = useCallback(
    (next: PresetSegment) => write(setSegmentIn(segments, next, durationMs)),
    [segments, durationMs, write],
  )

  const removeSegment = useCallback(
    (id: string) => write(removeSegmentIn(segments, id, durationMs)),
    [segments, durationMs, write],
  )

  const addSegment = useCallback(
    (startMs: number, endMs: number, presetId: PresetId) => {
      const next: PresetSegment = { id: newSegmentId(), startMs, endMs, presetId }
      setSegment(next)
      return next
    },
    [setSegment],
  )

  return {
    segments,
    activeSegment: segmentAt(segments, timeMs),
    setSegment,
    removeSegment,
    addSegment,
  }
}
