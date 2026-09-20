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
    <section id="made-for-hinglish" className="scroll-mt-20 overflow-hidden border-t border-line-subtle py-24 sm:py-32">
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
      {/* The three numbered points that used to close this section now sit under the score in
          SignalsSection ("Under the hood"), where the measurement story they tell belongs. The
          marquee caption is the section's last element, so the section's own py-24/sm:py-32
          carries the bottom spacing and nothing collapses. */}
      <RevealItem motionSafe={motionSafe} className="mt-6">
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">
          Real words from our Hinglish test reels · each in a different preset
        </p>
      </RevealItem>
    </section>
  )
}
