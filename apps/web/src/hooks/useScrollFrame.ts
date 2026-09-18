import { useEffect, useRef } from 'react'

/**
 * A scroll-frame callback does its DOM *reads* (getBoundingClientRect, scrollY…) and may
 * return a *write* function. All reads of a frame run first, then all writes, so the
 * browser computes layout once per frame instead of once per subscriber.
 */
type ScrollRead = () => (() => void) | void

const readers = new Set<ScrollRead>()
let frame = 0

function flush() {
  frame = 0
  const writes: (() => void)[] = []
  readers.forEach((read) => {
    const write = read()
    if (write) writes.push(write)
  })
  writes.forEach((write) => write())
}

/** Coalesces every scroll/resize event in a frame into one read pass and one write pass. */
function schedule() {
  if (!frame) frame = requestAnimationFrame(flush)
}

function subscribe(read: ScrollRead): () => void {
  if (readers.size === 0) {
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
  }
  readers.add(read)
  schedule()
  return () => {
    readers.delete(read)
    if (readers.size === 0) {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

/**
 * Runs `read` at most once per animation frame while the page scrolls or resizes (and once
 * on mount). All subscribers share one passive listener. Measure inside `read`; return a
 * function that writes styles straight to DOM refs. It runs outside React, so it never
 * causes a re-render.
 */
export function useScrollFrame(read: ScrollRead, enabled = true) {
  const readRef = useRef(read)

  useEffect(() => {
    readRef.current = read
  })

  useEffect(() => {
    if (!enabled) return
    return subscribe(() => readRef.current())
  }, [enabled])
}
