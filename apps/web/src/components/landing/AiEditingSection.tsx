import { useState } from 'react'
import type { PresetId } from '@captions/shared'
import { Check, Mic } from 'lucide-react'
import { CaptionLine } from '@/components/captions/CaptionLine'
import type { CaptionLineWord } from '@/components/captions/CaptionLine'
import { cn } from '@/lib/utils'
import { AnimatedSection } from './AnimatedSection'
import { RISE, stagger } from './reveal-classes'
import { SectionHeader } from './SectionHeader'
import { SectionSeam } from './SectionSeam'
import { VideoFrame } from './VideoFrame'
import { STILL_FOOTAGE } from './video-shapes'

interface CaptionState {
  presetId: PresetId
  words: CaptionLineWord[]
}

interface CommandExample {
  command: string
  steps: string[]
  before: CaptionState
  after: CaptionState
}

const EXAMPLES: CommandExample[] = [
  {
    command: 'bekaar ko angry bana do',
    steps: ['Found “bekaar” at 00:02', 'Emotion → angry (red, caps, shake)', 'Preview updated'],
    before: { presetId: 'hinglish-bold', words: [{ text: 'ekdum' }, { text: 'bekaar' }, { text: 'the' }] },
    after: {
      presetId: 'hinglish-bold',
      words: [{ text: 'ekdum' }, { text: 'bekaar', emotion: 'angry' }, { text: 'the' }],
    },
  },
  {
    command: 'saare captions MrBeast style mein kar do',
    steps: ['Preset: Minimal → MrBeast', 'Emphasis kept on “sunta”', 'Preview updated'],
    before: { presetId: 'minimal', words: [{ text: 'ab' }, { text: 'ye' }, { text: 'sunta', emphasis: true }, { text: 'hai' }] },
    after: { presetId: 'mrbeast', words: [{ text: 'ab' }, { text: 'ye' }, { text: 'sunta', emphasis: true }, { text: 'hai' }] },
  },
  {
    command: 'hello ko thoda lamba khicho',
    steps: ['Found “hello” at 00:04', 'Stretch 1.0 → 2.4', 'Preview updated'],
    before: { presetId: 'kathmandu', words: [{ text: 'hello' }, { text: 'guys' }] },
    after: {
      presetId: 'kathmandu',
      words: [{ text: 'hello', emotion: 'excited', stretched: 'helloooo' }, { text: 'guys' }],
    },
  },
]

/**
 * Voice editing, shown as a captured product state: the recognised command (mono pill,
 * design.md §7), the steps the editor logs, and the caption before and after. Picking an
 * example replays it. Illustration only — this section calls no backend.
 */
export function AiEditingSection() {
  const [selected, setSelected] = useState(0)
  const example = EXAMPLES[selected]

  return (
    <section id="ai-editing" className="relative">
      <div className="mx-auto grid max-w-300 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:py-32">
        <div className="flex flex-col gap-8">
          <SectionHeader
            align="left"
            eyebrow="Voice editing"
            title="Bolo, aur caption badal jaaye."
            lede="Say what you want in Hinglish. No timeline scrubbing, no hunting for the word."
          />

          <AnimatedSection variant="left" delay={150}>
            <div role="group" aria-label="Example commands" className="flex flex-col gap-2">
              {EXAMPLES.map((item, index) => (
                // The wrapper carries the entrance, so the button's own hover stays quick.
                <div key={item.command} className={RISE} style={stagger(index, 90, 250)}>
                  <button
                    type="button"
                    aria-pressed={index === selected}
                    onClick={() => setSelected(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left font-mono text-[13px] transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      index === selected
                        ? 'border-hairline-strong bg-surface-raised text-foreground'
                        : 'border-hairline bg-transparent text-muted-foreground hover:bg-surface',
                    )}
                  >
                    <Mic
                      className={cn('size-4 shrink-0', index === selected ? 'text-signal' : 'text-faint')}
                      strokeWidth={1.5}
                    />
                    “{item.command}”
                  </button>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>

        <AnimatedSection variant="right" delay={200}>
          <div key={selected} className="flex flex-col gap-5 rounded-[20px] border border-hairline bg-surface p-5 sm:p-6">
            <p className="fade-up self-start rounded-full border border-precision/30 bg-precision-dim px-3 py-1 font-mono text-[13px] text-precision">
              “{example.command}”
            </p>

            <div className="grid grid-cols-2 gap-3">
              <CaptionFrame label="Before" state={example.before} />
              <CaptionFrame label="After" state={example.after} highlight />
            </div>

            <ol className="flex flex-col gap-2 border-t border-hairline pt-4">
              {example.steps.map((step, index) => (
                <li
                  key={step}
                  className="fade-up flex items-center gap-2 font-mono text-[13px] text-muted-foreground"
                  style={{ animationDelay: `${160 + index * 140}ms` }}
                >
                  <Check className="size-3.5 text-success" strokeWidth={2} />
                  {step}
                </li>
              ))}
            </ol>

            <p className="font-mono text-[11px] text-faint">Illustration of the editor flow · not a live demo</p>
          </div>
        </AnimatedSection>
      </div>

      <SectionSeam />
    </section>
  )
}

function CaptionFrame({ label, state, highlight = false }: { label: string; state: CaptionState; highlight?: boolean }) {
  return (
    <figure className="flex flex-col gap-2">
      <VideoFrame shape="square" className={cn('w-full rounded-xl', highlight && 'ring-signal/40')}>
        <div className="absolute inset-0" style={STILL_FOOTAGE} />
        <div className="absolute inset-x-0 bottom-[16%]">
          <CaptionLine presetId={state.presetId} words={state.words} scale={1.2} />
        </div>
        {/* Re-mounts with the panel (key={selected}), so it flashes once per example. */}
        {highlight && (
          <span aria-hidden className="frame-flash pointer-events-none absolute inset-0 rounded-xl border-2 border-signal" />
        )}
      </VideoFrame>
      <figcaption className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">{label}</figcaption>
    </figure>
  )
}
