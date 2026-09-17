import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'

interface AnimatedSectionProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/** Subtle fade/slide entrance when scrolled into view. */
export function AnimatedSection({ children, className, style }: AnimatedSectionProps) {
  const { ref, isInView } = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'translate-y-4 opacity-0 transition-all duration-700 ease-out',
        isInView && 'translate-y-0 opacity-100',
        className,
      )}
    >
      {children}
    </div>
  )
}
