import { useMemo } from 'react'
import { formatTimecode } from '@/lib/format'

/** Tick spacings in ms, coarsest last. The first that gives >= MIN_TICK_PX is used. */
const STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000]
const MIN_TICK_PX = 64

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
      className="relative h-7 shrink-0 cursor-pointer border-b bg-muted/40 select-none"
      style={{ width: durationMs * pxPerMs }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      {ticks.map((ms) => (
        <div key={ms} className="absolute top-0 h-full" style={{ left: ms * pxPerMs }}>
          <div className="h-2 w-px bg-border" />
          <span className="absolute top-2 left-1 text-[10px] tabular-nums whitespace-nowrap text-muted-foreground">
            {formatTimecode(ms)}
          </span>
        </div>
      ))}
    </div>
  )
}
