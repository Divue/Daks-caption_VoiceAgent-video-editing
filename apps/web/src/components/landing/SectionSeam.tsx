import { cn } from '@/lib/utils'
import { AnimatedSection } from './AnimatedSection'
import { DRAW_X, POP } from './reveal-classes'

/**
 * Section-transition device (design.md §3.3): a full-width hairline fading in from both
 * edges, with a small signal-coloured glow node at its centre. On scroll the line draws out
 * from the centre and the node lights up after it. Use between major sections.
 */
export function SectionSeam() {
  return (
    <AnimatedSection variant="fade" className="relative h-px w-full">
      <div aria-hidden className={cn('absolute inset-0 bg-linear-to-r from-transparent via-hairline-strong to-transparent', DRAW_X)} />
      <div
        aria-hidden
        className={cn('absolute top-1/2 left-1/2 -mt-[3px] -ml-[3px] size-1.5 rounded-full bg-signal', POP)}
        style={{ transitionDelay: '500ms' }}
      />
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 h-6 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/25 opacity-0 blur-xl transition-opacity delay-500 duration-1000 group-data-[inview=true]/reveal:opacity-100"
      />
    </AnimatedSection>
  )
}
