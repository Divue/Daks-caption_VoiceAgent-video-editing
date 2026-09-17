import { useState } from 'react'
import { Maximize2, Pause, Play, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'

interface VideoControlBarProps {
  durationMs: number
  width: number
  height: number
  captionsEnabled: boolean
  onToggleCaptions: () => void
}

/** Presentational transport bar — no real playback engine exists yet (Step 10, blocked on remotion/). */
export function VideoControlBar({
  durationMs,
  width,
  height,
  captionsEnabled,
  onToggleCaptions,
}: VideoControlBarProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={() => setIsPlaying((value) => !value)}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        00:00 / {formatTimestamp(durationMs)}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-0 rounded-full bg-primary" />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Volume">
        <Volume2 />
      </Button>
      <Button
        type="button"
        variant={captionsEnabled ? 'default' : 'outline'}
        size="sm"
        className="px-2 text-xs"
        aria-pressed={captionsEnabled}
        onClick={onToggleCaptions}
      >
        CC
      </Button>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {width}×{height}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Fullscreen">
        <Maximize2 />
      </Button>
    </div>
  )
}
