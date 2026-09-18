import { cn } from '@/lib/utils'

interface MediaTrackProps {
  label: string
  durationMs: number
  pxPerMs: number
  /** Extra text on the clip, e.g. "478×850". Real values from the Project only. */
  detail?: string
  variant: 'video' | 'audio'
  onSeek: (ms: number) => void
}

/**
 * The video and audio clips. One clip each, spanning the whole project — which is the truth:
 * this editor does not cut, split or move media, so there is nothing else to draw.
 *
 * No drag, resize or split handles exist, deliberately: a handle that cannot be dragged is
 * worse than no handle. The audio clip has no waveform — that needs a client-side decode
 * for something purely decorative here.
 */
export function MediaTrack({ label, durationMs, pxPerMs, detail, variant, onSeek }: MediaTrackProps) {
  return (
    <div
      className="relative h-9 border-b bg-muted/20"
      style={{ width: durationMs * pxPerMs }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      <div
        className={cn(
          'absolute top-1 bottom-1 left-0 flex items-center gap-2 overflow-hidden rounded border px-2',
          variant === 'video'
            ? 'border-sunset-amber/30 bg-sunset-amber/10'
            : 'border-sunset-red/30 bg-sunset-red/10',
        )}
        style={{ width: durationMs * pxPerMs }}
      >
        <span className="shrink-0 rounded bg-background/70 px-1 text-[10px] font-medium">{label}</span>
        {detail && <span className="truncate text-[10px] text-muted-foreground">{detail}</span>}
      </div>
    </div>
  )
}
