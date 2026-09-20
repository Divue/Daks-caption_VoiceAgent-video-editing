import type { AnimationEvent, CSSProperties, ReactNode } from 'react'
import { useAnimationLifecycle, useInView } from '@/hooks/useInView'

export type RevealSize = 'sm' | 'lg'

/**
 * The class that shows/hides/animates an element for the `useInView` reveal system, shared by
 * `RevealItem` (below) and every call site that can't use it directly because the animated element
 * must be a specific tag — a `<li>` inside an `<ol>`, an `<a>` inside a `<nav>` — where wrapping in
 * `RevealItem`'s own `<div>` would add an element the surrounding layout doesn't expect.
 * `size` picks the distance: 'sm' (index.css --animate-reveal-sm, 20px) for small elements —
 * labels, list items, links — or 'lg' (--animate-reveal-lg, 32px) for cards, panels and images, so
 * the page doesn't read as one magnitude of motion repeated on everything. Same easing/duration
 * either way — only the distance changes. This is a dedicated pair of keyframes, not the shared
 * --animate-fade-up LandingNavbar's dropdown and TalkToEditSection's own replay lines use — this
 * system's timing can change without touching either of those.
 */
export function revealClass(isInView: boolean, shouldAnimate: boolean, size: RevealSize = 'sm'): string {
  if (!isInView) return 'opacity-0'
  if (!shouldAnimate) return ''
  return size === 'lg' ? 'animate-reveal-lg' : 'animate-reveal-sm'
}

interface RevealItemProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  motionSafe: boolean
  /** 'sm' (default) for small elements, 'lg' for cards/panels/images. See `revealClass` above. */
  size?: RevealSize
}

/**
 * Fades a block up into place when it scrolls into view on a downward scroll (index.css's
 * --animate-reveal-sm/-lg — see `revealClass` above). Re-entering the block on an upward scroll
 * shows it immediately at its settled look instead of replaying the animation. When motionSafe is
 * false the block just renders as-is: no hidden state, no animation, fully static.
 *
 * `will-change: transform, opacity` is applied only while the reveal is actually animating
 * (`useAnimationLifecycle`) and removed the moment it finishes, rather than left on indefinitely.
 */
export function RevealItem({ children, className = '', style, motionSafe, size = 'sm' }: RevealItemProps) {
  const { ref, isInView, shouldAnimate } = useInView<HTMLDivElement>()
  const { style: liveStyle, onAnimationEnd } = useAnimationLifecycle(isInView && shouldAnimate)

  if (!motionSafe) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => onAnimationEnd(event)

  return (
    <div
      ref={ref}
      style={{ ...style, ...liveStyle }}
      className={`${className} ${revealClass(isInView, shouldAnimate, size)}`}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  )
}
