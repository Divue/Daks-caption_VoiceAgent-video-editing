import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRoute } from '@/router'
import { AnimatedSection } from './AnimatedSection'
import { POP, RISE, stagger } from './reveal-classes'
import { VoiceOrb } from './VoiceOrb'

const MADE_FOR = ['Instagram Reels', 'YouTube Shorts', 'Podcast clips', 'Vlogs', 'Explainers']

/** Closing bookend: a small idle orb, one line, one CTA, and who it is for — revealed in that order. */
export function FinalCtaSection() {
  const { navigate } = useRoute()

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute bottom-[-30%] left-1/2 -z-10 size-[640px] -translate-x-1/2 rounded-full opacity-[0.14] blur-[120px]"
        style={{ background: 'var(--accent-signal)' }}
      />

      <AnimatedSection
        variant="fade"
        className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 lg:py-32"
      >
        <div className={cn('w-40', POP)} style={{ transitionDuration: '1100ms' }}>
          <VoiceOrb energy={0.2} tint={null} density={3} />
        </div>

        <h2
          className={cn(
            'font-display text-[32px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-[48px]',
            RISE,
          )}
          style={stagger(0, 0, 200)}
        >
          Your voice already has the emotion. Now your captions do too.
        </h2>

        <div className={RISE} style={stagger(0, 0, 350)}>
          <Button
            type="button"
            size="lg"
            className="group/cta h-11 gap-1.5 rounded-full px-6"
            onClick={() => navigate('/editor')}
          >
            Open the editor
            <ArrowUpRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
          </Button>
        </div>

        <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Made for">
          {MADE_FOR.map((item, index) => (
            <li
              key={item}
              className={cn('rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-faint', POP)}
              style={stagger(index, 70, 500)}
            >
              {item}
            </li>
          ))}
        </ul>
      </AnimatedSection>
    </section>
  )
}
