import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'

export type RevealVariant = 'up' | 'scale' | 'left' | 'right' | 'fade'

/** Hidden state per variant; every variant lands on the same resting state. */
const HIDDEN: Record<RevealVariant, string> = {
  up: 'translate-y-8 opacity-0',
  scale: 'scale-[0.94] opacity-0',
  left: '-translate-x-8 opacity-0',
  right: 'translate-x-8 opacity-0',
  fade: 'opacity-0',
}

interface AnimatedSectionProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  variant?: RevealVariant
  /** Stagger offset in ms, for rows of siblings. */
  delay?: number
}

/**
 * Scroll reveal: the element eases in once when it enters the viewport (ease-out-expo,
 * transform/opacity only — no blur, which would repaint every frame while scrolling).
 *
 * It also marks itself `group/reveal` with `data-inview`, so descendants can run their own
 * entrance off the same trigger, e.g. `group-data-[inview=true]/reveal:scale-y-100`.
 * Under reduced motion the element starts revealed, and index.css zeroes the transitions.
 */
export function AnimatedSection({ children, className, style, variant = 'up', delay = 0 }: AnimatedSectionProps) {
  const { ref, isInView } = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      data-reveal
      data-inview={isInView}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      className={cn(
        'group/reveal transition-[translate,scale,opacity] duration-900 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isInView ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : HIDDEN[variant],
        className,
      )}
    >
      {children}
    </div>
  )
}
