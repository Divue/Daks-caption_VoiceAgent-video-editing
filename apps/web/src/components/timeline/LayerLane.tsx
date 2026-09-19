import { useRef, useState } from 'react'
import { Film, ImageIcon } from 'lucide-react'
import type { LayerItem } from '@captions/shared'
import { moveItemTo, trimItemEnd, trimItemStart } from '@/lib/layers'
import { cn } from '@/lib/utils'

/** Edges snap to these within this many screen pixels — the distance a hand misses by. */
const SNAP_PX = 8
/** The grab zone at each end of a clip that trims rather than moves. */
const EDGE_PX = 7

interface LayerLaneProps {
  track: 1 | 2
  items: readonly LayerItem[]
  /** Every item on every track, for snapping to their edges. */
  allItems: readonly LayerItem[]
  durationMs: number
  pxPerMs: number
  height: number
  playheadMs: number
  selectedId: string | null
  onSelect: (id: string) => void
  /** Called ONCE when a drag ends. */
  onChange: (item: LayerItem) => void
  onSeek: (ms: number) => void
}

type Drag = { kind: 'move' | 'start' | 'end'; originX: number; item: LayerItem }

/**
 * One overlay track on the timeline. Each item is a clip you can:
 *   - click to select (and the panel opens its properties),
 *   - drag by its body to move it in time — its length and trim never change,
 *   - drag by an edge to trim it — the left edge also moves the clip's in-point, like every editor.
 * Edges snap to the playhead, the start and end of the video, and every other item's edges.
 * The clip follows the pointer from a local draft; one save when it is let go.
 */
export function LayerLane({
  track,
  items,
  allItems,
  durationMs,
  pxPerMs,
  height,
  playheadMs,
  selectedId,
  onSelect,
  onChange,
  onSeek,
}: LayerLaneProps) {
  const dragRef = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<LayerItem | null>(null)

  const snapTargets = (except: string) => [
    0,
    durationMs,
    playheadMs,
    ...allItems.filter((item) => item.id !== except).flatMap((item) => [item.startMs, item.endMs]),
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
    return best
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const deltaMs = (event.clientX - drag.originX) / pxPerMs
    const item = drag.item
    if (drag.kind === 'move') {
      // Snap whichever end is closer to something, keeping the length.
      let start = item.startMs + deltaMs
      const length = item.endMs - item.startMs
      const snappedStart = snap(start, item.id)
      const snappedEnd = snap(start + length, item.id)
      if (snappedStart !== start) start = snappedStart
      else if (snappedEnd !== start + length) start = snappedEnd - length
      setDraft(moveItemTo(item, start, durationMs))
    } else if (drag.kind === 'start') {
      setDraft(trimItemStart(item, snap(item.startMs + deltaMs, item.id)))
    } else {
      setDraft(trimItemEnd(item, snap(item.endMs + deltaMs, item.id), durationMs))
    }
  }

  const end = () => {
    const drag = dragRef.current
    dragRef.current = null
    const next = draft
    setDraft(null)
    if (!drag || !next) return
    if (next.startMs !== drag.item.startMs || next.endMs !== drag.item.endMs || next.trimStartMs !== drag.item.trimStartMs) {
      onChange(next)
    }
  }

  return (
    <div
      className="relative border-b border-border/40"
      style={{ width: durationMs * pxPerMs, height }}
      data-layer-lane={track}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {items.map((stored) => {
        const item = draft && draft.id === stored.id ? draft : stored
        const selected = item.id === selectedId
        const left = item.startMs * pxPerMs
        const width = Math.max(4, (item.endMs - item.startMs) * pxPerMs)
        const Icon = item.kind === 'video' ? Film : ImageIcon
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            aria-label={`${item.name ?? item.id}, layer ${track}`}
            aria-pressed={selected}
            data-layer-item={item.id}
            className={cn(
              'absolute inset-y-1 flex cursor-grab items-center gap-1 overflow-hidden rounded-[3px] px-1.5 active:cursor-grabbing',
              // Warm neutrals, like the other lanes — orange is kept for the playhead and selection
              // (INDEX.md). The icon says which kind of media it is.
              'bg-white/[0.13] ring-1 ring-white/20 ring-inset',
              selected && 'ring-2 ring-primary',
            )}
            style={{ left, width }}
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelect(item.id)
              const rect = event.currentTarget.getBoundingClientRect()
              const x = event.clientX - rect.left
              const kind = x < EDGE_PX ? 'start' : x > rect.width - EDGE_PX ? 'end' : 'move'
              ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
              dragRef.current = { kind, originX: event.clientX, item: stored }
            }}
          >
            <span className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize bg-white/10" data-edge="start" />
            <span className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize bg-white/10" data-edge="end" />
            <Icon className="size-3 shrink-0 text-foreground/80" />
            <span className="truncate text-[10px] text-foreground/80">{item.name ?? item.id}</span>
          </div>
        )
      })}
    </div>
  )
}
