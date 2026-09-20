import { useState } from 'react'
import { Word } from '@captions/shared'
import realReel from '@captions/shared/fixtures/real_reel-project.json'
import { SectionHeading, useLoopClock } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

/*
  "Not an LLM wrapper" — the pipeline's actual per-word measurements for the opening of the real
  reel, drawn as a score: loudness (bars), pitch (the line), and held time (the hatched tail past
  a word's expected length). Emphasis and stretch in the fixture came from these numbers
  (pipeline/prosody.py); nothing here is re-derived or tuned for the page.
*/

const WORDS = Word.array().parse(realReel.words.slice(0, 17))
const START = WORDS[0].startMs
const END = WORDS[WORDS.length - 1].endMs
const SPAN = END - START

// Moved here verbatim from HinglishSection ("Made for Hinglish"): same copy, same numbering, same
// card styling. They read as the pipeline's three guarantees, which is this section's subject.
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

const z = (value: number | undefined) => value ?? 0
const sigma = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}σ`

/** Pitch line through each word's centre, in a 0..100 viewBox. */
const PITCH_POINTS = WORDS.map((w) => {
  const x = ((w.startMs + w.endMs) / 2 - START) / SPAN * 100
  const y = 50 - Math.max(-2, Math.min(2, z(w.signals?.pitchZ))) * 20
  return `${x.toFixed(2)},${y.toFixed(2)}`
}).join(' ')

function verdict(word: Word): string {
  const parts: string[] = []
  if (word.emphasis) parts.push('emphasis')
  if (word.emotion !== 'neutral') parts.push(word.emotion)
  if (word.stretch > 1) parts.push(`stretch ×${word.stretch.toFixed(2)}`)
  return parts.length ? parts.join(' · ') : 'plain'
}

export function SignalsSection() {
  const motionSafe = useMotionSafe()
  const { ref, timeMs } = useLoopClock(START, END, 1600, motionSafe)
  const [hovered, setHovered] = useState<number | null>(null)

  const playingIndex = WORDS.findIndex((w) => timeMs >= w.startMs && timeMs < w.endMs)
  const focusIndex = hovered ?? (playingIndex >= 0 ? playingIndex : WORDS.length - 1)
  const focus = WORDS[focusIndex]
  const playhead = Math.min(100, Math.max(0, ((timeMs - START) / SPAN) * 100))

  return (
    <section id="under-the-hood" className="relative scroll-mt-20 overflow-hidden border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Under the hood" lines={['Not an LLM wrapper.', 'We measure your voice.']} motionSafe={motionSafe}>
          For every word we measure loudness, pitch, how long it took and how long it was held, against the
          speaker’s own baseline. Emphasis and stretch come from those numbers, not from a model guessing at the
          text.
        </SectionHeading>

        <RevealItem motionSafe={motionSafe} size="lg" className="mt-16">
          <div ref={ref} className="rounded-2xl border border-line-subtle bg-surface/40 p-4 sm:p-6">
            {/* Readout */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-line-subtle pb-4">
              <p className="font-display text-heading-lg font-bold tracking-tight text-ink-primary">
                {focus.text}
                <span className="ml-3 font-mono text-[11px] font-normal uppercase tracking-widest text-ink-tertiary">
                  {((focus.startMs - START) / 1000).toFixed(2)}s
                </span>
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-wide sm:grid-cols-4">
                {[
                  ['Loudness', sigma(z(focus.signals?.loudnessZ))],
                  ['Pitch', sigma(z(focus.signals?.pitchZ))],
                  ['Duration', `×${z(focus.signals?.durationRatio).toFixed(2)}`],
                  ['Held', `${z(focus.signals?.extraMs) >= 0 ? '+' : '−'}${Math.abs(Math.round(z(focus.signals?.extraMs)))}ms`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-ink-tertiary">{k}</dt>
                    <dd className="normal-case text-ink-primary">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="w-full font-mono text-[11px] uppercase tracking-widest text-signal sm:w-auto">→ {verdict(focus)}</p>
            </div>

            {/* Score: scrolls sideways inside its own box on narrow screens, never the page. */}
            <div className="-mx-4 mt-6 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
              <div className="relative min-w-[760px]">
                <div className="relative h-40">
                  {/* Baseline */}
                  <div className="absolute inset-x-0 top-1/2 h-px bg-line-subtle" aria-hidden="true" />
                  {/* Loudness bars + held tails */}
                  {WORDS.map((w, i) => {
                    const left = ((w.startMs - START) / SPAN) * 100
                    const width = ((w.endMs - w.startMs) / SPAN) * 100
                    const loud = Math.max(-2, Math.min(2, z(w.signals?.loudnessZ)))
                    const barH = Math.abs(loud) * 22 + 4
                    const held = Math.max(0, z(w.signals?.extraMs))
                    const heldW = (held / SPAN) * 100
                    const lit = i === focusIndex
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(i)}
                        onBlur={() => setHovered(null)}
                        aria-label={`${w.text}: ${verdict(w)}`}
                        className="absolute inset-y-0 cursor-default focus-visible:outline-none"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span
                          className={`absolute inset-x-[12%] rounded-sm transition-all duration-300 ${
                            w.emphasis ? 'bg-signal' : 'bg-ink-secondary/70'
                          } ${lit ? 'opacity-100' : 'opacity-60'}`}
                          style={loud >= 0 ? { bottom: '50%', height: `${barH}%` } : { top: '50%', height: `${barH}%` }}
                        />
                        {held > 0 && w.stretch > 1 && (
                          <span
                            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-r-sm border border-l-0 border-[#FFB83E]/70 bg-[repeating-linear-gradient(135deg,rgba(255,184,62,0.55)_0_3px,transparent_3px_6px)]"
                            style={{ left: '100%', width: `${(heldW / width) * 100}%` }}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                  {/* Pitch line */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={PITCH_POINTS} fill="none" stroke="#8B98F0" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  {/* Playhead */}
                  <div
                    className="pointer-events-none absolute inset-y-0 w-px bg-signal/80 shadow-[0_0_12px_rgba(255,107,74,0.7)]"
                    style={{ left: `${playhead}%` }}
                    aria-hidden="true"
                  />
                </div>
                {/* Words */}
                <div className="relative mt-3 h-6">
                  {WORDS.map((w, i) => (
                    <span
                      key={w.id}
                      className={`absolute truncate text-center font-mono text-[11px] transition-colors duration-200 ${
                        i === focusIndex ? 'text-ink-primary' : w.emphasis ? 'text-signal/80' : 'text-ink-tertiary'
                      }`}
                      style={{ left: `${((w.startMs - START) / SPAN) * 100}%`, width: `${((w.endMs - w.startMs) / SPAN) * 100}%` }}
                    >
                      {w.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wide text-ink-tertiary">
              <li className="flex items-center gap-2"><span className="h-3 w-1.5 rounded-sm bg-signal" />Emphasised word</li>
              <li className="flex items-center gap-2"><span className="h-3 w-1.5 rounded-sm bg-ink-secondary/70" />Loudness</li>
              <li className="flex items-center gap-2"><span className="h-px w-4 bg-[#8B98F0]" />Pitch</li>
              <li className="flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-[repeating-linear-gradient(135deg,rgba(255,184,62,0.55)_0_3px,transparent_3px_6px)]" />Held longer</li>
            </ul>
          </div>
        </RevealItem>

        {/* A row of three under the score, not a stack: the score card is already tall and wide,
            and stacking these below it made the section read top-heavy at 1280px. */}
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
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
      </div>
    </section>
  )
}
