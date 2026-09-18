import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Watches `ref` and calls `onChange(offscreen)` whenever it leaves or enters the viewport
 * (with a 200px margin, so work resumes just before it scrolls back into view). Used to
 * pause loops — CSS animations, videos, rAF ticks — that cost frames while nobody sees them.
 */
export function useOffscreen(ref: RefObject<Element | null>, onChange: (offscreen: boolean) => void) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => onChangeRef.current(!entry.isIntersecting), {
      rootMargin: '200px 0px',
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
}
