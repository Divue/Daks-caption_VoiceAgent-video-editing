import { useState } from 'react'
import { Maximize2, Pause, Play, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

interface VideoControlBarProps {
  durationMs: number
  width: number
  height: number
  captionsEnabled: boolean
  onToggleCaptions: () => void
}

/**
 * Presentational transport bar — no real playback engine exists yet (Step 10, blocked on
 * remotion/). Glass chrome over the stage (design.md §6), timestamps and size in mono.
 */
export function VideoControlBar({
  durationMs,
  width,
  height,
  captionsEnabled,
  onToggleCaptions,
}: VideoControlBarProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface/70 px-3 py-2 backdrop-blur-xl">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={() => setIsPlaying((value) => !value)}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        00:00 <span className="text-faint">/ {formatTimestamp(durationMs)}</span>
      </span>
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-raised">
        <div className="absolute inset-y-0 left-0 w-0 rounded-full bg-signal" />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Volume">
        <Volume2 />
      </Button>
      <button
        type="button"
        aria-pressed={captionsEnabled}
        onClick={onToggleCaptions}
        className={cn(
          'rounded-md border px-2 py-1 font-mono text-[11px] transition-colors duration-150',
          captionsEnabled
            ? 'border-signal/40 bg-signal-dim text-signal'
            : 'border-hairline text-muted-foreground hover:text-foreground',
        )}
      >
        CC
      </button>
      <span className="hidden shrink-0 font-mono text-[11px] text-faint sm:inline">
        {width}×{height}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Fullscreen">
        <Maximize2 />
      </Button>
    </div>
  )
}
