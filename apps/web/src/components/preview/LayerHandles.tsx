import { useRef, useState } from 'react'
import type { LayerItem } from '@captions/shared'
import { activeLayerItems, clampTransform, layerBox, layerBoxStyle } from '@/lib/layers'
import { cn } from '@/lib/utils'

/** Snap the centre to the frame's middle within this many percent, the way every editor does. */
const SNAP_PCT = 1.5
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const

interface LayerHandlesProps {
  layers: readonly LayerItem[]
  timeMs: number
  frameWidth: number
  frameHeight: number
  selectedId: string | null
  onSelect: (id: string) => void
  /** Called ONCE when a gesture ends — one drag is one save and one Ctrl+Z. */
  onChange: (item: LayerItem) => void
}

type Gesture =
  | { kind: 'move'; startX: number; startY: number; item: LayerItem }
  | { kind: 'scale'; centreX: number; centreY: number; startDist: number; item: LayerItem }
  | { kind: 'rotate'; centreX: number; centreY: number; startAngle: number; item: LayerItem }

/**
 * Direct manipulation of layer items on the preview, drawn ABOVE the captions so a selected sticker
 * can be grabbed even where a caption covers it (captions are pointer-transparent).
 *
 * - Click an item on screen to select it.
 * - Drag the selected item to move it; its centre snaps to the frame's middle lines.
 * - Drag a corner to scale. Always uniform — an item's shape comes from its source (`aspect`), so
 *   there is nothing to stretch; that is the convention of every overlay editor, and it keeps a
 *   logo from ever being squashed by a slip of the mouse.
 * - Drag the round handle above it to rotate; hold Shift to step in 15°.
 *
 * The item follows the pointer from a local draft; nothing is written until the pointer lifts.
 */
export function LayerHandles({ layers, timeMs, frameWidth, frameHeight, selectedId, onSelect, onChange }: LayerHandlesProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  // A draft belongs to one gesture on one item against one version of the list; an undo or a
  // selection change mid-way makes it stale, so it is derived away rather than reset in an effect.
  const [draftState, setDraftState] = useState<{ draft: LayerItem; layers: readonly LayerItem[] } | null>(null)
  const draft = draftState && draftState.layers === layers && draftState.draft.id === selectedId ? draftState.draft : null
  const setDraft = (next: LayerItem | null) => setDraftState(next ? { draft: next, layers } : null)
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })

  if (frameWidth <= 0) return null
  const onScreen = activeLayerItems(layers, timeMs)
  const selected = layers.find((item) => item.id === selectedId) ?? null
  const shown = draft && draft.id === selectedId ? draft : selected

  const local = (event: React.PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const begin = (event: React.PointerEvent, gesture: Gesture) => {
    event.preventDefault()
    event.stopPropagation()
    // Captured on the element that was pressed (the root is pointer-transparent); the moves still
    // bubble to the root's handlers, and keep arriving even when the pointer leaves the frame.
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    gestureRef.current = gesture
    setDraft(gesture.item)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const gesture = gestureRef.current
    if (!gesture) return
    const at = local(event)
    const item = gesture.item
    if (gesture.kind === 'move') {
      let x = item.x + ((at.x - gesture.startX) / frameWidth) * 100
      let y = item.y + ((at.y - gesture.startY) / frameHeight) * 100
      const snapX = Math.abs(x - 50) < SNAP_PCT
      const snapY = Math.abs(y - 50) < SNAP_PCT
      if (snapX) x = 50
      if (snapY) y = 50
      setGuides({ x: snapX, y: snapY })
      setDraft(clampTransform({ ...item, x, y }))
    } else if (gesture.kind === 'scale') {
      const dist = Math.hypot(at.x - gesture.centreX, at.y - gesture.centreY)
      setDraft(clampTransform({ ...item, width: item.width * (dist / Math.max(1, gesture.startDist)) }))
    } else {
      const angle = (Math.atan2(at.y - gesture.centreY, at.x - gesture.centreX) * 180) / Math.PI
      let rotation = item.rotation + angle - gesture.startAngle
      rotation = ((((rotation + 180) % 360) + 360) % 360) - 180
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      setDraft(clampTransform({ ...item, rotation: Math.round(rotation * 10) / 10 }))
    }
  }

  const end = () => {
    const gesture = gestureRef.current
    gestureRef.current = null
    setGuides({ x: false, y: false })
    if (!gesture || !draft) return
    const before = gesture.item
    const moved = draft.x !== before.x || draft.y !== before.y || draft.width !== before.width || draft.rotation !== before.rotation
    if (moved) onChange(round(draft))
    else setDraft(null)
  }

  const centreOf = (item: LayerItem) => {
    const box = layerBox(item, frameWidth, frameHeight)
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      data-layer-handles
    >
      {/* Hit areas for every item on screen, so one click selects it. */}
      {onScreen
        .filter((item) => item.id !== selectedId)
        .map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Select ${item.name ?? item.id}`}
            className="pointer-events-auto cursor-pointer rounded-sm hover:outline hover:outline-1 hover:outline-white/50"
            style={layerBoxStyle(item, frameWidth, frameHeight)}
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelect(item.id)
            }}
          />
        ))}

      {guides.x && <div className="absolute inset-y-0 left-1/2 w-px bg-primary/70" />}
      {guides.y && <div className="absolute inset-x-0 top-1/2 h-px bg-primary/70" />}

      {shown && (
        <div
          role="group"
          aria-label={`${shown.name ?? shown.id} — drag to move, corners to scale`}
          className="pointer-events-auto cursor-move outline outline-2 outline-primary"
          style={layerBoxStyle(shown, frameWidth, frameHeight)}
          data-layer-selected={shown.id}
          onPointerDown={(event) => {
            const at = local(event)
            begin(event, { kind: 'move', startX: at.x, startY: at.y, item: shown })
          }}
        >
          {CORNERS.map((corner) => (
            <span
              key={corner}
              data-handle={corner}
              className={cn(
                'absolute size-3 rounded-[2px] border-2 border-primary bg-white',
                corner.includes('n') ? '-top-1.5' : '-bottom-1.5',
                corner.includes('w') ? '-left-1.5' : '-right-1.5',
                corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
              )}
              onPointerDown={(event) => {
                const c = centreOf(shown)
                const at = local(event)
                begin(event, { kind: 'scale', centreX: c.x, centreY: c.y, startDist: Math.hypot(at.x - c.x, at.y - c.y), item: shown })
              }}
            />
          ))}
          <span
            data-handle="rotate"
            title="Rotate (Shift: 15° steps)"
            className="absolute -top-6 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border-2 border-primary bg-white"
            onPointerDown={(event) => {
              const c = centreOf(shown)
              const at = local(event)
              begin(event, {
                kind: 'rotate',
                centreX: c.x,
                centreY: c.y,
                startAngle: (Math.atan2(at.y - c.y, at.x - c.x) * 180) / Math.PI,
                item: shown,
              })
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Two decimals is far below a pixel and keeps the stored document (and the agent's view) readable. */
function round(item: LayerItem): LayerItem {
  const r = (value: number) => Math.round(value * 100) / 100
  return { ...item, x: r(item.x), y: r(item.y), width: r(item.width), rotation: r(item.rotation) }
}
