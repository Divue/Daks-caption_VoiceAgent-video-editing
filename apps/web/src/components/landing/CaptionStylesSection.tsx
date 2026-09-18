import { PRESETS } from '@captions/shared'
import type { PresetId } from '@captions/shared'
import { CaptionLine } from '@/components/captions/CaptionLine'
import type { CaptionLineWord } from '@/components/captions/CaptionLine'
import { AnimatedSection } from './AnimatedSection'
import { RISE, stagger } from './reveal-classes'
import { SectionHeader } from './SectionHeader'
import { SectionSeam } from './SectionSeam'
import { SpotlightCard } from './SpotlightCard'
import { VideoFrame } from './VideoFrame'
import { STILL_FOOTAGE } from './video-shapes'

const PRESET_ORDER: PresetId[] = ['kathmandu', 'mrbeast', 'minimal', 'hinglish-bold']

/** The same line in every preset: plain words plus one emphasised word. */
const SAMPLE: CaptionLineWord[] = [
  { text: 'ab' },
  { text: 'ye' },
  { text: 'sunta', emphasis: true },
  { text: 'hai' },
]

/**
 * The editor's real presets (packages/shared PRESETS), each rendering the same line.
 * Presets are the base look; emphasis and emotion layer on top of whichever one you pick.
 */
export function CaptionStylesSection() {
  return (
    <section id="templates" className="relative">
      <div className="mx-auto max-w-300 px-4 py-24 sm:px-6 lg:py-32">
        <SectionHeader
          eyebrow="Styles"
          title="Pick a base look. The emotion rides on top."
          lede="Four presets to start from. Emphasis, anger and stretch keep working whichever you choose."
        />

        <ul className="mt-16 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {PRESET_ORDER.map((presetId, index) => (
            <li key={presetId}>
              <AnimatedSection variant="scale" delay={index * 110}>
                <SpotlightCard as="figure" className="flex flex-col gap-3 rounded-[20px] border border-hairline bg-surface p-3">
                  <VideoFrame shape="square" className="w-full rounded-xl">
                    <div className="absolute inset-0" style={STILL_FOOTAGE} />
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                      <div className={RISE} style={stagger(index, 110, 350)}>
                        <CaptionLine presetId={presetId} words={SAMPLE} scale={1.5} />
                      </div>
                    </div>
                  </VideoFrame>
                  <figcaption className="flex items-center justify-between px-1 pb-1">
                    <span className="text-sm font-medium text-foreground">{PRESETS[presetId].name}</span>
                    <span className="font-mono text-[11px] text-faint">{PRESETS[presetId].wordsPerLine} words/line</span>
                  </figcaption>
                </SpotlightCard>
              </AnimatedSection>
            </li>
          ))}
        </ul>
      </div>

      <SectionSeam />
    </section>
  )
}
