import { useRef } from 'react'
import { useScrollFrame } from '@/hooks/useScrollFrame'

/**
 * Thin coral reading-progress bar pinned to the top edge. It moves only as the user
 * scrolls (scaleX from the left), so it stays on under reduced motion: it is feedback,
 * not decoration.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null)

  useScrollFrame(() => {
    const bar = barRef.current
    if (!bar) return
    const max = document.documentElement.scrollHeight - window.innerHeight
    const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
    return () => {
      bar.style.transform = `scaleX(${progress})`
    }
  })

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5">
      <div
        ref={barRef}
        className="h-full origin-left bg-linear-to-r from-signal/40 to-signal"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  )
}
