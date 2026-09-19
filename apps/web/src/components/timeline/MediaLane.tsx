import { cn } from '@/lib/utils'

interface MediaLaneProps {
  durationMs: number
  pxPerMs: number
  variant: 'video' | 'audio'
  /** Shown inside the clip. Real data — resolution, or the source filename. */
  label?: string
  height: number
  onSeek: (ms: number) => void
}

/**
 * The video and audio lanes: one clip each, spanning the whole source.
 *
 * They are honest about being one clip — the MAIN video is never cut or split, so there is never
 * more than one. Overlay media lives on its own lanes (`LayerLane`), which are real clip tracks. The
 * previous version was a flat coloured bar with a floating label; this one at least renders the
 * shape of the thing (a clip with ends) and stays quiet enough to sit under the captions without
 * competing with them.
 *
 * NOT drawn: a waveform. We have no audio analysis on the client and inventing a plausible-looking
 * one would be a lie about the only lane whose whole job is to show real signal.
 */
export function MediaLane({
  durationMs,
  pxPerMs,
  variant,
  label,
  height,
  onSeek,
}: MediaLaneProps) {
  return (
    <div
      className="relative border-b border-border/40"
      style={{ width: durationMs * pxPerMs, height }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      <div
        className={cn(
          'absolute inset-y-1 left-0 flex items-center gap-2 overflow-hidden rounded-[3px] px-2',
          variant === 'video'
            ? 'bg-white/[0.07] ring-1 ring-white/10 ring-inset'
            : 'bg-white/[0.04] ring-1 ring-white/[0.07] ring-inset',
        )}
        style={{ width: durationMs * pxPerMs }}
      >
        {variant === 'audio' && <AudioHint />}
        {label && (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70 tabular-nums">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A flat rule where a waveform would be, so the lane reads as audio without claiming to have
 * measured any. It is a placeholder and looks like one on purpose.
 */
function AudioHint() {
  return <span className="h-px min-w-6 flex-1 bg-white/12" aria-hidden />
}
