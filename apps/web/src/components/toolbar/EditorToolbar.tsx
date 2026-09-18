import { Gauge, Link, Magnet, Music, Scissors, Shuffle, Sticker, Wand2, ZoomIn, ZoomOut } from 'lucide-react'
import { SplitSquareHorizontal } from 'lucide-react'
import { InertControl } from '@/components/layout/InertControl'
import { Button } from '@/components/ui/button'

const OUT_OF_SCOPE = 'not in the MVP scope'

/** Order mirrors the reference product's toolbar. Everything here is inert except zoom. */
const TOOLS = [
  { label: 'Split', icon: Scissors },
  { label: 'Trim', icon: SplitSquareHorizontal },
  { label: 'Snapping', icon: Magnet },
  { label: 'Link tracks', icon: Link },
  { label: 'Transitions', icon: Shuffle },
  { label: 'Effects', icon: Wand2 },
  { label: 'Stickers', icon: Sticker },
  { label: 'Music', icon: Music },
  { label: 'Speed', icon: Gauge },
] as const

interface EditorToolbarProps {
  zoom: number
  minZoom: number
  maxZoom: number
  onZoomChange: (zoom: number) => void
}

export function EditorToolbar({ zoom, minZoom, maxZoom, onZoomChange }: EditorToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 py-1">
      {TOOLS.map(({ label, icon }) => (
        <InertControl key={label} label={label} icon={icon} reason={OUT_OF_SCOPE} />
      ))}

      <div className="mx-1 h-5 w-px shrink-0 bg-border" />

      {/* Zoom is the one real control on this bar. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Zoom out"
        disabled={zoom <= minZoom}
        onClick={() => onZoomChange(Math.max(minZoom, zoom / 1.5))}
      >
        <ZoomOut />
      </Button>
      <input
        type="range"
        aria-label="Timeline zoom"
        min={Math.log(minZoom)}
        max={Math.log(maxZoom)}
        step={0.01}
        value={Math.log(zoom)}
        onChange={(event) => onZoomChange(Math.exp(Number(event.target.value)))}
        className="h-1.5 w-20 shrink-0 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Zoom in"
        disabled={zoom >= maxZoom}
        onClick={() => onZoomChange(Math.min(maxZoom, zoom * 1.5))}
      >
        <ZoomIn />
      </Button>
    </div>
  )
}
