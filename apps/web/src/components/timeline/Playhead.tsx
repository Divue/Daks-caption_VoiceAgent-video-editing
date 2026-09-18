import { useCallback, useEffect, useRef } from 'react'

interface PlayheadProps {
  timeMs: number
  pxPerMs: number
  durationMs: number
  onSeek: (ms: number) => void
}

/**
 * Driven by CSS transform rather than `left`, so moving it every animation frame does not
 * trigger layout — it stays on the compositor.
 */
export function Playhead({ timeMs, pxPerMs, durationMs, onSeek }: PlayheadProps) {
  const draggingRef = useRef(false)

  const seekFromClientX = useCallback(
    (clientX: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      onSeek(Math.max(0, Math.min(durationMs, (clientX - rect.left) / pxPerMs)))
    },
    [durationMs, pxPerMs, onSeek],
  )

  useEffect(() => {
    if (!draggingRef.current) return
    function onUp() {
      draggingRef.current = false
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  })

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-20 w-px bg-primary"
      style={{ transform: `translateX(${timeMs * pxPerMs}px)` }}
    >
      {/* Only the grab handle takes pointer events, so the line never blocks track clicks. */}
      <div
        className="pointer-events-auto absolute -top-0.5 -left-[5px] size-2.5 cursor-ew-resize rounded-sm bg-primary"
        onPointerDown={(event) => {
          event.stopPropagation()
          draggingRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return
          const scroller = event.currentTarget.closest('[data-timeline-content]')
          if (scroller instanceof HTMLElement) seekFromClientX(event.clientX, scroller)
        }}
        onPointerUp={(event) => {
          draggingRef.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        role="slider"
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs)}
        aria-valuenow={Math.round(timeMs)}
        tabIndex={0}
      />
    </div>
  )
}
