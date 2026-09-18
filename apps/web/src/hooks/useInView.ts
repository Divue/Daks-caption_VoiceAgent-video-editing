import { useEffect, useRef, useState } from 'react'

interface InViewOptions {
  threshold?: number
  /** Shrinks the viewport's bottom edge so reveals start once content is properly on screen. */
  rootMargin?: string
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Fires once when the element first scrolls into view — used for entrance animations.
 * Under prefers-reduced-motion it reports "in view" immediately, so nothing waits hidden.
 */
export function useInView<T extends HTMLElement>({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' }: InViewOptions = {}) {
  const ref = useRef<T>(null)
  const [isInView, setIsInView] = useState(() => window.matchMedia(REDUCED_MOTION).matches)

  useEffect(() => {
    const element = ref.current
    if (!element || isInView) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin, isInView])

  return { ref, isInView }
}
