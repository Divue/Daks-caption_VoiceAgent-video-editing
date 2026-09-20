import { useState } from 'react'
import { PRESETS, Word } from '@captions/shared'
import type { Emotion, PresetId, Project } from '@captions/shared'
import realReel from '@captions/shared/fixtures/real_reel-project.json'
import { CaptionWords, SectionHeading, useElementWidth, useLoopClock } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

/*
  "Hear the difference" — the tone layer, shown on three moments of ONE real Hinglish reel. The
  emotion on each line is what the pipeline detected (real_reel fixture), not something set for
  the demo. The switch flips `settings.emotionLayer`, the same project setting the editor has,
  so "off" is exactly what the editor renders with the tone layer disabled.
*/

const reel = Word.array().parse(realReel.words)

interface Moment {
  tone: Emotion
  label: string
  words: Word[]
  blurb: string
}

// Indices into the real_reel transcript. Each line carries the tone the pipeline tagged it with.
const MOMENTS: Moment[] = [
  {
    tone: 'neutral',
    label: 'Neutral',
    words: reel.slice(29, 33),
    blurb: 'Plain delivery reads plain: the preset face, with emphasis only where the voice leaned on a word.',
  },
  {
    tone: 'excited',
    label: 'Excited',
    words: reel.slice(4, 8),
    blurb: 'A held, lifted "saaaal" gets the excited layer, and its measured length stretches the letters on screen.',
  },
  {
    tone: 'angry',
    label: 'Angry',
    words: reel.slice(89, 93),
    blurb: 'Pushed, loud words go hot and shake, at the amplitude the preset gives its angry layer.',
  },
]

// Inline-layout presets (chamak's `stack` layout needs the full renderer, not a single line).
const PRESET_CHOICES: PresetId[] = ['rangmanch', 'dhamaka', 'nazm', 'hinglish-bold', 'mrbeast', 'minimal']

const TONE_DOT: Record<Emotion, string> = { neutral: 'bg-ink-tertiary', excited: 'bg-[#FFB83E]', angry: 'bg-signal' }

/**
 * Footage for the angry moment only ("rona machne wala hai"). Root paths, not bundler imports —
 * these are static assets that must not be hashed into the JS graph.
 *
 * The frame is shared by all three moments, but this clip is the angry one's own footage, so it
 * would be showing someone crying under the birthday line if it played for the others. Neutral and
 * Excited keep the plain gradient until their own footage exists (owner's call, Sep 20).
 */
const ANGRY_VIDEO_SRC = '/rona-reel.mp4'
/** The clip's own first frame: shown while it loads, and instead of it under reduced motion. */
const ANGRY_POSTER_SRC = '/rona-reel-poster.jpg'

/**
 * Waveform strip under the frame. Each word gets a cluster of thin bars, as many as its duration
 * allows, whose overall height is that word's MEASURED loudness; the rise-and-fall within a
 * cluster is only a drawing envelope. Played words light up, emphasised ones in signal.
 */
function Waveform({ words, timeMs }: { words: Word[]; timeMs: number }) {
  return (
    <div className="flex h-12 items-center gap-[2px]" aria-hidden="true">
      {words.map((word, wi) => {
        const loud = word.signals?.loudnessZ ?? 0
        const peak = Math.min(1, Math.max(0.18, 0.5 + loud * 0.28))
        const bars = Math.max(4, Math.round((word.endMs - word.startMs) / 28))
        const played = timeMs >= word.startMs
        const tone = played ? (word.emphasis ? 'bg-signal' : 'bg-ink-secondary') : 'bg-line-default'
        return Array.from({ length: bars }, (_, j) => {
          const envelope = 0.35 + 0.65 * Math.sin((Math.PI * (j + 0.5)) / bars)
          const grain = 0.8 + 0.2 * Math.abs(Math.sin(j * 12.99 + wi * 78.23))
          return (
            <span
              key={`${word.id}-${j}`}
              className={`w-[2px] shrink-0 rounded-full transition-colors duration-200 ${tone}`}
              style={{ height: `${Math.max(8, peak * envelope * grain * 100)}%` }}
            />
          )
        })
      })}
    </div>
  )
}

export function ToneSection() {
  const motionSafe = useMotionSafe()
  const [momentIndex, setMomentIndex] = useState(2)
  const [presetId, setPresetId] = useState<PresetId>('rangmanch')
  const [toneLayer, setToneLayer] = useState(true)
  const moment = MOMENTS[momentIndex]
  const preset = PRESETS[presetId]
  const settings: Project['settings'] = { ...realReel.settings, emotionLayer: toneLayer }

  const { ref: frameRef, width } = useElementWidth<HTMLDivElement>()
  const clip = moment.words
  const { ref: clockRef, timeMs } = useLoopClock(clip[0].startMs, clip[clip.length - 1].endMs, 1800, motionSafe)

  return (
    <section id="hear-the-difference" className="scroll-mt-20 border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Hear the difference" lines={['Same reel.', 'Three moods.']} motionSafe={motionSafe}>
          Most captions treat a whisper and a rant the same. Ours read the tone of every word from the
          audio, and the preset reacts to it.
        </SectionHeading>

        <div ref={clockRef} className="mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16">
          {/* Frame */}
          <RevealItem motionSafe={motionSafe} size="lg" className="mx-auto w-full max-w-[340px] lg:mx-0">
            <div
              ref={frameRef}
              className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line-subtle shadow-soft"
              style={{
                background:
                  'radial-gradient(80% 50% at 50% 24%, rgba(255, 184, 62, 0.14), transparent 70%), radial-gradient(90% 60% at 50% 105%, rgba(255, 107, 74, 0.14), transparent 70%), linear-gradient(180deg, #19171a, #0c0c0e)',
              }}
            >
              {/* Footage, angry moment only — see ANGRY_VIDEO_SRC above. The clip is portrait and
                  so is this 9:16 frame, so object-cover crops rather than letterboxes either way.
                  muted/loop/playsInline/autoPlay are required together or mobile Safari won't
                  autoplay. Under reduced motion the poster renders as a static <img> instead: no
                  video element at all, so there is nothing that could autoplay. */}
              {moment.tone === 'angry' &&
                (motionSafe ? (
                  <video
                    className="absolute inset-0 h-full w-full object-cover"
                    src={ANGRY_VIDEO_SRC}
                    poster={ANGRY_POSTER_SRC}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                ) : (
                  <img className="absolute inset-0 h-full w-full object-cover" src={ANGRY_POSTER_SRC} alt="" aria-hidden="true" />
                ))}
              {/* Scrim between footage and the caption/badge/waveform layers — a gradient, not a
                  text-shadow, so every preset stays legible over moving footage rather than only
                  the heavy ones. Only drawn when there is footage to darken. */}
              {moment.tone === 'angry' && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65" aria-hidden="true" />
              )}
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-line-subtle bg-canvas/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-secondary backdrop-blur-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[moment.tone]}`} />
                Detected · {moment.tone}
              </div>
              <CaptionWords
                key={`${momentIndex}-${presetId}`}
                words={clip}
                preset={preset}
                settings={settings}
                width={width}
                timeMs={timeMs}
                motionSafe={motionSafe}
              />
              <div className="absolute inset-x-4 bottom-4 flex justify-center overflow-hidden">
                <Waveform words={clip} timeMs={timeMs} />
              </div>
            </div>
          </RevealItem>

          {/* Controls */}
          <RevealItem motionSafe={motionSafe} size="lg" style={{ animationDelay: '90ms' }} className="flex flex-col gap-8">
            <div role="tablist" aria-label="Moment" className="grid grid-cols-3 gap-2">
              {MOMENTS.map((m, i) => (
                <button
                  key={m.tone}
                  role="tab"
                  type="button"
                  aria-selected={i === momentIndex}
                  onClick={() => setMomentIndex(i)}
                  className={`group rounded-xl border px-4 py-4 text-left transition-all duration-300 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 ${
                    i === momentIndex
                      ? 'border-signal/50 bg-signal/[0.07]'
                      : 'border-line-subtle bg-surface/40 hover:-translate-y-0.5 hover:border-line-default'
                  }`}
                >
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[m.tone]}`} />
                    {m.label}
                  </span>
                  <span className="mt-2 hidden truncate text-body-md font-medium text-ink-primary sm:block">
                    “{m.words.map((w) => w.text).join(' ')}”
                  </span>
                </button>
              ))}
            </div>

            <p className="min-h-[3.5rem] text-body-md text-ink-secondary">{moment.blurb}</p>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line-subtle bg-surface/40 px-4 py-3">
              <div>
                <p className="text-body-sm font-medium text-ink-primary">Tone layer</p>
                <p className="text-body-sm text-ink-tertiary">Flip it off to see the plain preset.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={toneLayer}
                aria-label="Tone layer"
                onClick={() => setToneLayer((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 ${
                  toneLayer ? 'border-signal/60 bg-signal/80' : 'border-line-default bg-surface-raised'
                }`}
              >
                <span
                  className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-ink-primary shadow transition-all duration-300 ease-out-expo ${toneLayer ? 'left-[calc(100%-1.4rem)]' : 'left-1'}`}
                />
              </button>
            </div>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Try it on a preset</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESET_CHOICES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={id === presetId}
                    onClick={() => setPresetId(id)}
                    className={`rounded-full border px-3.5 py-1.5 text-body-sm transition-all duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 ${
                      id === presetId
                        ? 'border-ink-primary bg-ink-primary text-canvas'
                        : 'border-line-subtle text-ink-secondary hover:border-line-default hover:text-ink-primary'
                    }`}
                  >
                    {PRESETS[id].name}
                  </button>
                ))}
              </div>
            </div>
          </RevealItem>
        </div>
      </div>
    </section>
  )
}
