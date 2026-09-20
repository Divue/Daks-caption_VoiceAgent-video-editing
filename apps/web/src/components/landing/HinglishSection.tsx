import { PRESETS, Word } from '@captions/shared'
import type { PresetId } from '@captions/shared'
import realReel from '@captions/shared/fixtures/real_reel-project.json'
import { glowWrapperCss, renderedText, resolveWordStyle, styleToCss } from '@/lib/caption-style'
import { SectionHeading } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

/*
  "Written the way you text" — two rows of words our pipeline actually transcribed from the
  Hinglish test reels, each drawn in a preset face by the editor's resolver. Short filler words and one
  misheard word are filtered out; nothing is added.
*/

// Filler and a misrecognised word, left out of the marquee.
const SKIP = new Set(['bia', 'ah', 'aa', 'wo', 'ne', 'se', 'ke', 'ka', 'ki', 'pe', 'ja', 'hi', 'ye', 'I', 'so'].map((w) => w.toLowerCase()))

const pool = Word.array()
  .parse(realReel.words)
  .filter((w, i, all) => w.text.length > 2 && !SKIP.has(w.text.toLowerCase()) && all.findIndex((o) => o.text.toLowerCase() === w.text.toLowerCase()) === i)

const FACES: PresetId[] = ['rangmanch', 'dhamaka', 'nazm', 'hinglish-bold', 'mrbeast', 'minimal']
const half = Math.ceil(pool.length / 2)
const ROWS = [pool.slice(0, half), pool.slice(half)]

const POINTS = [
  {
    n: '01',
    title: 'Hindi audio in',
    body: 'We transcribe with a Hindi speech model, because English models hear Hinglish as noise. In our first test, English (India) returned zero words on a real reel.',
  },
  {
    n: '02',
    title: 'Roman script out',
    body: 'Every word is written back in the Roman script creators actually type, like yaar, bhai and saaaal. Not Devanagari, and not a translation.',
  },
  {
    n: '03',
    title: 'Timed to the word',
    body: 'Each word keeps its own start and end, to the millisecond, so captions land on the beat of how you speak.',
  },
]

function MarqueeRow({ words, reverse, motionSafe, offset }: { words: Word[]; reverse: boolean; motionSafe: boolean; offset: number }) {
  // Two copies side by side: the keyframe moves -50%, which lands exactly on the second copy.
  const copies = motionSafe ? [0, 1] : [0]
  return (
    <div className={`flex w-max ${motionSafe ? (reverse ? 'animate-marquee-reverse' : 'animate-marquee') : ''}`} aria-hidden="true">
      {copies.map((copy) => (
        <div key={copy} className="flex shrink-0 items-center gap-x-10 pr-10 sm:gap-x-14 sm:pr-14">
          {words.map((word, i) => {
            const preset = PRESETS[FACES[(i + offset) % FACES.length]]
            const resolved = resolveWordStyle(word, preset, realReel.settings, 1080)
            return (
              <span key={word.id + copy} className="inline-block whitespace-nowrap" style={glowWrapperCss(resolved)}>
                <span style={{ ...styleToCss(resolved), fontSize: 'clamp(2rem, 5vw, 3.75rem)', lineHeight: 1.1 }}>
                  {renderedText(word, preset.stretch)}
                </span>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function HinglishSection() {
  const motionSafe = useMotionSafe()

  return (
    <section id="for-creators" className="scroll-mt-20 overflow-hidden border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Made for Hinglish" lines={['Written the way', 'you text.']} motionSafe={motionSafe}>
          Built for how India actually talks: Hindi and English in the same sentence, captioned in the script you’d
          use in a DM.
        </SectionHeading>
      </div>

      <div
        className="mt-16 flex flex-col gap-6 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]"
        style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}
      >
        <MarqueeRow words={ROWS[0]} reverse={false} motionSafe={motionSafe} offset={0} />
        <MarqueeRow words={ROWS[1]} reverse motionSafe={motionSafe} offset={3} />
      </div>
      <RevealItem motionSafe={motionSafe} className="mt-6">
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">
          Real words from our Hinglish test reels · each in a different preset
        </p>
      </RevealItem>

      <div className="mx-auto mt-16 grid max-w-[1200px] gap-4 px-4 sm:grid-cols-3 sm:px-8">
        {POINTS.map((point, index) => (
          <RevealItem key={point.n} motionSafe={motionSafe} size="lg" style={{ animationDelay: `${Math.min(index, 5) * 90}ms` }}>
            <div className="group h-full rounded-xl border border-line-subtle bg-surface/40 p-6 transition-colors duration-300 hover:border-line-default hover:bg-surface/70">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-ink-tertiary transition-colors duration-200 group-hover:text-signal">{point.n}</span>
                <span className="h-px w-4 bg-line-subtle transition-all duration-200 group-hover:w-6 group-hover:bg-signal/50" />
              </div>
              <p className="mt-4 text-body-lg font-semibold text-ink-primary">{point.title}</p>
              <p className="mt-2 text-body-sm leading-relaxed text-ink-secondary">{point.body}</p>
            </div>
          </RevealItem>
        ))}
      </div>
    </section>
  )
}
