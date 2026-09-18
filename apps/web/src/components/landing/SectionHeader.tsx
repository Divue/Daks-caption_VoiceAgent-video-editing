import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AnimatedSection } from './AnimatedSection'
import { RISE, stagger } from './reveal-classes'

interface SectionHeaderProps {
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  align?: 'center' | 'left'
  className?: string
}

/**
 * Eyebrow (label token) + display headline + optional lede, shared by every landing section.
 * Reveals itself on scroll: eyebrow, title and lede rise in one after another.
 */
export function SectionHeader({ eyebrow, title, lede, align = 'center', className }: SectionHeaderProps) {
  return (
    <AnimatedSection
      variant="fade"
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'mx-auto max-w-2xl items-center text-center' : 'max-w-xl items-start',
        className,
      )}
    >
      <p
        className={cn('flex items-center gap-2 font-mono text-[13px] leading-[1.2] tracking-[0.08em] text-faint uppercase', RISE)}
        style={stagger(0)}
      >
        <span className="size-1.5 rounded-full bg-signal" />
        {eyebrow}
      </p>
      <h2
        className={cn(
          'font-display text-[32px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-[40px] lg:text-[48px]',
          RISE,
        )}
        style={stagger(1, 90)}
      >
        {title}
      </h2>
      {lede && (
        <p className={cn('text-base leading-[1.6] text-muted-foreground sm:text-lg', RISE)} style={stagger(2, 90)}>
          {lede}
        </p>
      )}
    </AnimatedSection>
  )
}
