import { useMemo } from 'react'
import { formatTimecode } from '@/lib/format'

/** Tick spacings in ms, coarsest last. The first that gives >= MIN_TICK_PX is used. */
const STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000]
/** Wide, deliberately: labels every 64px was a wall of timecode (audit 16 §2.4). */
const MIN_TICK_PX = 96

interface TimeRulerProps {
  durationMs: number
  pxPerMs: number
  onSeek: (ms: number) => void
}

export function TimeRuler({ durationMs, pxPerMs, onSeek }: TimeRulerProps) {
  // Label density follows zoom: at fit-to-width a 15.9 s clip gets seconds, zoomed in it
  // gets tenths, rather than a fixed step that either crowds or empties the ruler.
  const stepMs = useMemo(
    () => STEPS_MS.find((step) => step * pxPerMs >= MIN_TICK_PX) ?? STEPS_MS[STEPS_MS.length - 1],
    [pxPerMs],
  )

  const ticks = useMemo(() => {
    const out: number[] = []
    for (let ms = 0; ms <= durationMs; ms += stepMs) out.push(ms)
    return out
  }, [durationMs, stepMs])

  return (
    <div
      className="relative h-6 shrink-0 cursor-pointer border-y border-border/50 select-none"
      style={{ width: durationMs * pxPerMs }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      {ticks.map((ms) => (
        <div key={ms} className="absolute top-0 h-full" style={{ left: ms * pxPerMs }}>
          <div className="h-1.5 w-px bg-border" />
          <span className="absolute top-1 left-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground/70 tabular-nums">
            {formatTimecode(ms, stepMs)}
          </span>
        </div>
      ))}
    </div>
  )
}
