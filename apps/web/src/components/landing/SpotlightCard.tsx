import { useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SpotlightCardProps {
  as?: 'div' | 'article' | 'figure'
  className?: string
  children: ReactNode
}

/**
 * Card with a pointer-following glow: a soft signal-coral light sits under the cursor while
 * hovered, and the card lifts 4px (lift only when motion is allowed). The pointer position
 * is written to CSS variables on the element, so moving the mouse never re-renders React.
 *
 * `isolate` makes the card its own stacking context, so the `-z-10` glow paints above the
 * card's background but below its content.
 */
export function SpotlightCard({ as: Tag = 'div', className, children }: SpotlightCardProps) {
  const ref = useRef<HTMLElement>(null)

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    element.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  return (
    <Tag
      // The tag is a union, so React can't narrow the ref type; the element is always an HTMLElement.
      ref={ref as never}
      onPointerMove={handlePointerMove}
      className={cn(
        'group/spot relative isolate transition-[translate,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-hairline-strong motion-safe:hover:-translate-y-1',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), rgb(255 107 74 / 0.09), transparent 70%)',
        }}
      />
      {children}
    </Tag>
  )
}
