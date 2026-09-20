import { useRef, useState } from 'react'
import { Palette, X } from 'lucide-react'
import { PRESETS } from '@captions/shared'
import type { CaptionBlock, PresetId, PresetSegment } from '@captions/shared'
import {
  MIN_SEGMENT_MS,
  moveSegmentTo,
  newSegmentId,
  resizeSegmentEnd,
  resizeSegmentStart,
} from '@/lib/preset-segments'
import { cn } from '@/lib/utils'

/** Edges snap to these within this many screen pixels — the distance a hand misses by. */
const SNAP_PX = 8
/** The grab zone at each end of a segment that resizes rather than moves. */
const EDGE_PX = 7

interface PresetLaneProps {
  segments: readonly PresetSegment[]
  /** The look everywhere a segment does not cover — what a new segment starts as. */
  projectPresetId: PresetId
  /** Caption blocks, so an edge can snap to a caption rather than landing inside one. */
  blocks: readonly CaptionBlock[]
  durationMs: number
  pxPerMs: number
  height: number
  playheadMs: number
  onChange: (segment: PresetSegment) => void
  onRemove: (id: string) => void
  onSeek: (ms: number) => void
}

type Drag =
  | { kind: 'move' | 'start' | 'end'; originX: number; segment: PresetSegment }
  | { kind: 'create'; originMs: number }

/**
 * The preset lane: which stretches of the video are drawn in a preset other than the project's.
 *
 * Deliberately the same interaction as `LayerLane`, because it is the same kind of object — a
 * clip on a track. Drag empty space to draw a new one, drag a segment's body to move it, drag an
 * edge to resize, the × removes it. Every gesture ends in ONE write of the whole list
 * (`usePresetSegments`), so it is one save and one Ctrl+Z.
 *
 * Edges snap to CAPTION BLOCK boundaries as well as to the usual 0 / playhead / other segments.
 * That is not polish: `wordsPerLine` is a preset property, so a boundary inside a caption splits
 * that caption in two (lib/caption-timeline.ts derives blocks per segment). Snapping makes the
 * common case land where the user already sees a break.
 *
 * Drawing a segment gives it the project's own preset and seeks into it, because the style panel
 * and the preset picker are scoped to the PLAYHEAD — landing there is what makes the next click
 * on a preset card change the new segment rather than the whole video.
 */
export function PresetLane({
  segments,
  projectPresetId,
  blocks,
  durationMs,
  pxPerMs,
  height,
  playheadMs,
  onChange,
  onRemove,
  onSeek,
}: PresetLaneProps) {
  const dragRef = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<PresetSegment | null>(null)

  const snapTargets = (except: string) => [
    0,
    durationMs,
    playheadMs,
    ...blocks.flatMap((block) => [block.startMs, block.endMs]),
    ...segments.filter((segment) => segment.id !== except).flatMap((s) => [s.startMs, s.endMs]),
  ]
  const snap = (ms: number, except: string) => {
    let best = ms
    let bestPx = SNAP_PX
    for (const target of snapTargets(except)) {
      const px = Math.abs(target - ms) * pxPerMs
      if (px < bestPx) {
        best = target
        bestPx = px
      }
    }
    return Math.round(Math.min(Math.max(0, best), durationMs))
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'create') {
      const rect = event.currentTarget.getBoundingClientRect()
      const here = snap((event.clientX - rect.left) / pxPerMs, '')
      const startMs = Math.min(drag.originMs, here)
      const endMs = Math.max(drag.originMs, here)
      setDraft({ id: 'draft', startMs, endMs, presetId: projectPresetId })
      return
    }
    const deltaMs = (event.clientX - drag.originX) / pxPerMs
    const segment = drag.segment
    // The clamps all live in lib/preset-segments.ts, mirrored in the agent's Python — never
    // inline here, or the two drift and only one of the two suites notices.
    if (drag.kind === 'move') {
      const length = segment.endMs - segment.startMs
      let startMs = segment.startMs + deltaMs
      const snappedStart = snap(startMs, segment.id)
      const snappedEnd = snap(startMs + length, segment.id)
      if (snappedStart !== Math.round(startMs)) startMs = snappedStart
      else if (snappedEnd !== Math.round(startMs + length)) startMs = snappedEnd - length
      setDraft(moveSegmentTo(segment, startMs, durationMs))
    } else if (drag.kind === 'start') {
      setDraft(resizeSegmentStart(segment, snap(segment.startMs + deltaMs, segment.id)))
    } else {
      setDraft(resizeSegmentEnd(segment, snap(segment.endMs + deltaMs, segment.id), durationMs))
    }
  }

  const end = () => {
    const drag = dragRef.current
    const next = draft
    dragRef.current = null
    setDraft(null)
    if (!drag || !next) return
    if (drag.kind === 'create') {
      // A click, not a drag: seek there instead of leaving a sliver of a segment behind.
      if (next.endMs - next.startMs < MIN_SEGMENT_MS) return onSeek(next.startMs)
      const created = { ...next, id: newSegmentId() }
      onChange(created)
      // The panel and the picker follow the playhead, so put it inside what was just drawn.
      onSeek(Math.round((created.startMs + created.endMs) / 2))
      return
    }
    if (next.startMs !== drag.segment.startMs || next.endMs !== drag.segment.endMs) onChange(next)
  }

  const shown = draft && draft.id === 'draft' ? [...segments, draft] : segments

  return (
    <div
      className="relative border-b border-border/40"
      style={{ width: durationMs * pxPerMs, height }}
      data-preset-lane
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'create', originMs: snap((event.clientX - rect.left) / pxPerMs, '') }
        setDraft({ id: 'draft', startMs: dragRef.current.originMs, endMs: dragRef.current.originMs, presetId: projectPresetId })
      }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {shown.map((stored) => {
        const segment = draft && draft.id === stored.id ? draft : stored
        const active = playheadMs >= segment.startMs && playheadMs < segment.endMs
        const left = segment.startMs * pxPerMs
        const width = Math.max(4, (segment.endMs - segment.startMs) * pxPerMs)
        const name = PRESETS[segment.presetId].name
        return (
          <div
            key={segment.id}
            role="button"
            tabIndex={0}
            aria-label={`${name} from ${segment.startMs} to ${segment.endMs} ms`}
            aria-pressed={active}
            data-preset-segment={segment.id}
            className={cn(
              'absolute inset-y-1 flex cursor-grab items-center gap-1 overflow-hidden rounded-[3px] px-1.5 active:cursor-grabbing',
              // Warm neutrals like every other lane; the ring marks the one the panel is editing,
              // which is the selection meaning orange is budgeted for (INDEX.md).
              'bg-white/[0.13] ring-1 ring-white/20 ring-inset',
              active && 'ring-2 ring-primary',
            )}
            style={{ left, width }}
            onPointerDown={(event) => {
              if (segment.id === 'draft') return
              event.stopPropagation()
              // Seek into it first: the style panel and the preset picker are playhead-scoped, so
              // this is what "selecting" a segment means.
              if (!active) onSeek(Math.round((segment.startMs + segment.endMs) / 2))
              const rect = event.currentTarget.getBoundingClientRect()
              const x = event.clientX - rect.left
              const kind = x < EDGE_PX ? 'start' : x > rect.width - EDGE_PX ? 'end' : 'move'
              ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
              dragRef.current = { kind, originX: event.clientX, segment: stored }
            }}
          >
            <span className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize bg-white/10" data-edge="start" />
            <span className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize bg-white/10" data-edge="end" />
            <Palette className="size-3 shrink-0 text-foreground/80" />
            <span className="truncate text-[10px] text-foreground/80">{name}</span>
            {segment.id !== 'draft' && (
              <button
                type="button"
                aria-label={`Remove the ${name} segment`}
                className="ml-auto shrink-0 rounded p-0.5 text-foreground/50 opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [div:hover>&]:opacity-100"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(segment.id)
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )
      })}
      {segments.length === 0 && !draft && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
          Drag to give a stretch of the video its own preset
        </span>
      )}
    </div>
  )
}
