import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'
import { usePlayback } from '@/state/playback-context'
import { cn } from '@/lib/utils'

interface TransportBarProps {
  /** Frame size, shown as a readout. Comes from the Project, not from guesswork. */
  width: number
  height: number
  captionsEnabled: boolean
  onToggleCaptions: () => void
  onFullscreen: () => void
}

/** Real transport for the real <video>: play/pause, scrub, volume, rate, fullscreen. */
export function TransportBar({
  width,
  height,
  captionsEnabled,
  onToggleCaptions,
  onFullscreen,
}: TransportBarProps) {
  const { timeMs, isPlaying, durationMs, volume, muted, rate, seek, toggle, setRate, setVolume, toggleMute } =
    usePlayback()

  const progress = durationMs > 0 ? Math.min(100, (timeMs / durationMs) * 100) : 0

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-card px-3 py-2">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={toggle}>
        {isPlaying ? <Pause /> : <Play />}
      </Button>

      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatTimestamp(timeMs)} / {formatTimestamp(durationMs)}
      </span>

      {/* range input rather than a div: keyboard-seekable for free */}
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(1, Math.round(durationMs))}
        value={Math.round(timeMs)}
        onChange={(event) => seek(Number(event.target.value))}
        className="h-1.5 min-w-[120px] flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        // The played portion carries the sunset spectrum — the same band as the header stripe,
        // which is what ties the transport to the brand rather than a flat accent fill.
        style={{
          background: `linear-gradient(to right,
            var(--sunset-red) 0%,
            var(--sunset-orange) ${progress * 0.55}%,
            var(--sunset-amber) ${progress}%,
            var(--color-muted) ${progress}%)`,
        }}
      />

      <Button type="button" variant="ghost" size="icon-sm" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
        {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
      </Button>

      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="hidden h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-primary sm:block"
      />

      <select
        aria-label="Playback speed"
        value={rate}
        onChange={(event) => setRate(Number(event.target.value))}
        className="h-7 rounded-md border bg-background px-1 text-xs tabular-nums"
      >
        {[0.5, 1, 1.5, 2].map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>

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

      <span className={cn('hidden shrink-0 text-xs text-muted-foreground tabular-nums', 'lg:inline')}>
        {width}×{height}
      </span>

      <Button type="button" variant="ghost" size="icon-sm" aria-label="Fullscreen" onClick={onFullscreen}>
        <Maximize2 />
      </Button>
    </div>
  )
}
