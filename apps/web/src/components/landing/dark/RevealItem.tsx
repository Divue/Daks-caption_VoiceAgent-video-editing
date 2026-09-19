import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'

interface RevealItemProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  motionSafe: boolean
}

/**
 * Fades a block up into place the first time it scrolls into view, reusing
 * the hero's own fade-up reveal (index.css's --animate-fade-up — the same
 * keyframe LandingNavbar's dropdown items use) rather than a new animation
 * language. When motionSafe is false the block just renders as-is: no
 * hidden state, no animation, fully static.
 */
export function RevealItem({ children, className = '', style, motionSafe }: RevealItemProps) {
  const { ref, isInView } = useInView<HTMLDivElement>()

  if (!motionSafe) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <div ref={ref} style={style} className={`${className} ${isInView ? 'animate-fade-up' : 'opacity-0'}`}>
      {children}
    </div>
  )
}
