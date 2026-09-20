import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/** Never re-hides until the element has fully left the viewport (ratio 0), regardless of how
 *  high `showThreshold` is — see the hysteresis note below. */
const HIDE_THRESHOLD = 0

/**
 * Extends the observed area 15% of the viewport height past the *bottom* edge before computing
 * intersections (a positive `rootMargin` value grows the root's bounds outward — this is the
 * standard "start early" lazy-reveal pattern, the opposite of a negative value, which would shrink
 * the area and trigger *later*). Without this, `showThreshold` only fires once the element is
 * already partway into the real viewport, leaving no runway for the entrance animation to actually
 * be seen traveling — it reads as popping in already-placed instead. With it, the reveal starts
 * while the element is still below the fold, so by the time it's actually on screen the animation
 * has had time to play.
 */
const ROOT_MARGIN = '0px 0px 15% 0px'

/**
 * Scroll direction, shared by every `useInView` instance via one `scroll` listener rather than
 * one per call site. Defaults to 'down' so a section already in view on first load — before the
 * user has scrolled at all — still gets its entrance animation instead of appearing static.
 */
let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0
let scrollDirection: 'up' | 'down' = 'down'
if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY
      scrollDirection = y >= lastScrollY ? 'down' : 'up'
      lastScrollY = y
    },
    { passive: true },
  )
}

/**
 * One native IntersectionObserver per distinct (`showThreshold`, `rootMargin`) pair, shared by
 * every `useInView` call site using that pair — not one observer per observed element. A page with
 * many small reveals (list items, footer links, cards) still only costs a couple of real observers;
 * each element just gets its own entry in that observer's callback map, added on mount and removed
 * on unmount (the shared observer itself is never disconnected while other elements still use it).
 * The callback does nothing but read the fixed `scrollDirection` variable and call `setState` — no
 * layout reads, no other synchronous work — so it stays cheap regardless of how many elements share it.
 */
const observerPool = new Map<string, { observer: IntersectionObserver; callbacks: Map<Element, (ratio: number) => void> }>()

function getSharedObserver(showThreshold: number, rootMargin: string) {
  const key = `${showThreshold}|${rootMargin}`
  let pooled = observerPool.get(key)
  if (!pooled) {
    const callbacks = new Map<Element, (ratio: number) => void>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry.intersectionRatio)
      },
      { threshold: [HIDE_THRESHOLD, showThreshold], rootMargin },
    )
    pooled = { observer, callbacks }
    observerPool.set(key, pooled)
  }
  return pooled
}

/**
 * Tracks whether the element is in view, with a deliberately asymmetric trigger: it flips true
 * once at least `showThreshold` of the element is visible (measured against a viewport extended
 * `ROOT_MARGIN` past the bottom edge — see above), but only flips back to false once the element
 * has left the (unextended) viewport entirely (intersection ratio reaches 0). Ordinary scroll
 * jitter right at the show line — a few px up, a few down — never crosses zero, so it can't flicker
 * the state (and therefore the caller's entrance animation) on and off.
 *
 * Keeps observing for the element's whole lifetime — callers get a live `isInView` they can
 * replay their entrance animation from every time it scrolls back into view, not just the first.
 *
 * `shouldAnimate` says whether *this* reveal should play the entrance animation: true only when
 * the element became visible while the page was scrolling down. Scrolling back up and re-entering
 * a section from below sets `isInView` true (the section is visible) but `shouldAnimate` false —
 * callers should render the settled, final look immediately rather than replaying the animation.
 */
export function useInView<T extends HTMLElement>(showThreshold = 0, rootMargin = ROOT_MARGIN) {
  const ref = useRef<T>(null)
  const wasInView = useRef(false)
  const [isInView, setIsInView] = useState(false)
  const [shouldAnimate, setShouldAnimate] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const { observer, callbacks } = getSharedObserver(showThreshold, rootMargin)
    callbacks.set(element, (ratio) => {
      if (ratio >= showThreshold) {
        if (!wasInView.current) setShouldAnimate(scrollDirection === 'down')
        wasInView.current = true
        setIsInView(true)
      } else if (ratio <= HIDE_THRESHOLD) {
        wasInView.current = false
        setIsInView(false)
      }
      // Between the two thresholds (mid-way out, not yet fully gone): hold the current state.
    })
    observer.observe(element)
    return () => {
      observer.unobserve(element)
      callbacks.delete(element)
    }
  }, [showThreshold, rootMargin])

  return { ref, isInView, shouldAnimate }
}

/**
 * `will-change: transform, opacity` while (and only while) an entrance animation driven by
 * `useInView` is actually playing — applied the moment `isAnimating` turns true, removed as soon
 * as the CSS animation's `animationend` fires (the `e.target === e.currentTarget` check ignores
 * animations bubbling up from a *different*, unrelated animated element nested inside — e.g. the
 * chat panel's own internal pulse/fade effects — so a nested animation finishing first can't
 * prematurely clear the hint for the entrance reveal itself). Leaving `will-change` on
 * indefinitely is itself a performance cost (the browser keeps a promoted layer around for an
 * element that's done moving), so this always turns it back off once the one-shot reveal settles,
 * and re-arms if the element leaves view and later re-enters.
 */
export function useAnimationLifecycle(isAnimating: boolean) {
  const [settled, setSettled] = useState(false)
  // Reset `settled` the moment `isAnimating` goes false (element exits, or never animated this
  // pass), so a later re-entry starts from a clean slate. A plain effect, not the "adjust during
  // render" version of this recipe: that alternative avoids one extra render per reveal by
  // mutating a ref mid-render, but only at the cost of being a much less obvious pattern to future
  // readers — and the render this effect costs is a single lightweight boolean flip on an element
  // that, by design (the stagger/granularity choices elsewhere in this system), is never one of
  // more than a handful animating at once. Not where this task's actual jank was coming from.
  useEffect(() => {
    if (!isAnimating) setSettled(false)
  }, [isAnimating])

  const onAnimationEnd = (event: { target: EventTarget | null; currentTarget: EventTarget }) => {
    if (event.target === event.currentTarget) setSettled(true)
  }

  const style: CSSProperties | undefined = isAnimating && !settled ? { willChange: 'transform, opacity' } : undefined

  return { style, onAnimationEnd }
}
