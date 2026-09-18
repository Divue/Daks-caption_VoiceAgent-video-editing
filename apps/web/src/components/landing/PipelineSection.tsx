import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AnimatedSection } from './AnimatedSection'
import {
  CaptionsSurface,
  SignalsSurface,
  TranscriptSurface,
  UploadSurface,
  VoiceSurface,
} from './PipelineSurfaces'
import { SectionHeader } from './SectionHeader'
import { SectionSeam } from './SectionSeam'
import { SpotlightCard } from './SpotlightCard'

interface Step {
  number: string
  title: string
  description: string
  surface: ReactNode
  /** Grid span on large screens: three cards on the first row, two wider ones below. */
  span: string
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Upload a reel',
    description: 'Portrait, square or landscape.',
    surface: <UploadSurface />,
    span: 'lg:col-span-2',
  },
  {
    number: '02',
    title: 'Hinglish transcript',
    description: 'Roman script, the way you would type it, timed to the word.',
    surface: <TranscriptSurface />,
    span: 'lg:col-span-2',
  },
  {
    number: '03',
    title: 'How it was said',
    description: 'Loudness, pitch and duration, measured against your own voice.',
    surface: <SignalsSurface />,
    span: 'lg:col-span-2',
  },
  {
    number: '04',
    title: 'Expressive captions',
    description: 'Shouts go red and shake, stress gets bigger, held words stay stretched.',
    surface: <CaptionsSurface />,
    span: 'lg:col-span-3',
  },
  {
    number: '05',
    title: 'Fix it by voice',
    description: 'Say the change in Hinglish; the editor applies it and shows each step.',
    surface: <VoiceSurface />,
    span: 'lg:col-span-3',
  },
]

/**
 * "How it works": the actual pipeline as five product surfaces, not feature cards.
 * The data is the demo clip's sample; the footnote says so.
 */
export function PipelineSection() {
  return (
    <section id="how-it-works" className="relative">
      <div className="mx-auto max-w-300 px-4 py-24 sm:px-6 lg:py-32">
        <SectionHeader
          eyebrow="How it works"
          title="From a raw reel to captions that sound like you."
          lede="Text alone misses the shout and the drawl. The captions come from the words and from how you said them."
        />

        <ol className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {STEPS.map((step, index) => (
            <li key={step.number} className={cn(step.span, index === 4 && 'md:col-span-2 lg:col-span-3')}>
              <AnimatedSection className="h-full" delay={(index % 3) * 110}>
                <SpotlightCard
                  as="article"
                  className="flex h-full flex-col gap-5 rounded-[20px] border border-hairline bg-surface p-5"
                >
                  <header className="flex flex-col gap-1.5">
                    <p className="font-mono text-[13px] text-signal">{step.number}</p>
                    <h3 className="font-display text-xl leading-[1.3] font-semibold text-foreground">{step.title}</h3>
                    <p className="text-sm leading-[1.5] text-muted-foreground">{step.description}</p>
                  </header>
                  <div className="mt-auto">{step.surface}</div>
                </SpotlightCard>
              </AnimatedSection>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-center font-mono text-[13px] text-faint">
          Sample data from the demo clip. This page does not upload or process anything.
        </p>
      </div>

      <SectionSeam />
    </section>
  )
}
