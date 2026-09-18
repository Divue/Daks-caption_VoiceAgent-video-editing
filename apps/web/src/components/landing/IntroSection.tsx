import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { AnimatedSection } from './AnimatedSection'
import { CaptionShowcase } from './CaptionShowcase'
import { HeroSignalBackdrop } from './HeroSignalBackdrop'
import { SectionSeam } from './SectionSeam'

/** The three caption layers, shown as the words they would produce. */
const LAYERS = [
  { label: 'Loud', sample: 'SUNTA', className: 'font-extrabold text-foreground' },
  { label: 'Angry', sample: 'BEKAAR', className: 'font-black text-[#FF2D2D]' },
  { label: 'Held', sample: 'hellooo', className: 'font-bold text-foreground' },
]

/**
 * Second section, directly under the voice orb: the page's headline and CTAs, then the demo
 * clip in all three frame shapes over the waveform backdrop.
 */
export function IntroSection() {
  const { navigate } = useRoute()

  return (
    <section id="product" className="relative isolate overflow-hidden">
      <HeroSignalBackdrop />

      <div className="mx-auto flex max-w-300 flex-col items-center gap-12 px-4 py-24 text-center sm:px-6 lg:py-32">
        <AnimatedSection className="flex flex-col items-center gap-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/80 px-3 py-1 text-[13px] leading-[1.2] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-signal" />
            Hinglish · speech-aware captions
          </p>

          <h1 className="max-w-4xl font-display text-[38px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-[56px] lg:text-[72px]">
            <span className="block">Captions that hear</span>
            <span className="block text-muted-foreground">
              how you <span className="text-signal">said</span> it.
            </span>
          </h1>

          <p className="max-w-2xl text-base leading-[1.6] text-muted-foreground sm:text-lg">
            Made for Hinglish reels. Every word is timed and read for loudness, pitch and length, so a shout lands in
            red caps and a drawn-out word stays drawn out. Then change anything by telling the editor what you want.
          </p>

          <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Caption layers">
            {LAYERS.map((layer) => (
              <li
                key={layer.label}
                className="flex items-center gap-2 rounded-full border border-hairline bg-surface/80 py-1 pr-3 pl-1 backdrop-blur"
              >
                <span className="rounded-full bg-overlay px-2 py-0.5 font-mono text-[11px] text-faint uppercase">
                  {layer.label}
                </span>
                <span className={`font-['Poppins',sans-serif] text-sm ${layer.className}`}>{layer.sample}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="group/cta h-11 gap-1.5 rounded-full px-6"
              onClick={() => navigate('/editor')}
            >
              Open the editor
              <ArrowUpRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-11 rounded-full px-5 text-muted-foreground">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </AnimatedSection>

        <AnimatedSection className="w-full" style={{ transitionDelay: '150ms' }}>
          <CaptionShowcase />
          <p className="mt-6 font-mono text-[13px] leading-[1.4] text-faint">
            Sample clip · hand-timed demo captions
          </p>
        </AnimatedSection>
      </div>

      <SectionSeam />
    </section>
  )
}
