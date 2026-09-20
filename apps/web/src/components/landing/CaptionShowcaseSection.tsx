import type { ComponentType } from 'react'
import { Activity, AudioWaveform, Palette, Upload } from 'lucide-react'
import { Emotion, PRESETS, PresetId, Signals, Word } from '@captions/shared'
import type { Preset, Project } from '@captions/shared'
import realReel from '@captions/shared/fixtures/real_reel-project.json'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { ArrowRightIcon } from '@/icons'
import { UPLOAD_MAX_BYTES } from '@/lib/api'
import { CaptionWords, SectionHeading, useElementWidth, useLoopClock } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

/*
  "One clip, three looks" section below the hero. Layout borrowed from a caption-tool landing
  page the owner pointed at (headline, upload row, three frames of different shapes, a row of
  number cards); everything inside it is ours and real:

  - The caption words are the pipeline's actual output for the real_reel test clip (fixture
    words w5-w8, "har saaaal meri birthday"), including its measured emphasis, the `excited`
    tone and the stretch on "saaaal". They are drawn by the editor's own resolver
    (lib/caption-style.ts), not a marketing approximation, so what the frame shows is what the
    editor would render for that preset at that frame width.
  - The frames now carry footage: one cleared demo reel (public/demo-reel.mp4), the same file in
    all three, cropped to each frame's shape. The caption layer did not change — it draws over
    the video exactly as it drew over the backdrop, which stays underneath as the fallback if
    the file is missing or still loading.
  - The numbers in the cards are counted from the schema and preset list, not written by hand,
    so they cannot drift from what the product actually does. No speed, accuracy or language
    claims: none of those have been measured.
*/

// Real pipeline output, validated against the schema so a fixture change fails loudly here.
const SAMPLE_WORDS = Word.array().parse(realReel.words.slice(4, 8))
const SAMPLE_SETTINGS: Project['settings'] = realReel.settings
const CLIP_START_MS = SAMPLE_WORDS[0].startMs
const CLIP_END_MS = SAMPLE_WORDS[SAMPLE_WORDS.length - 1].endMs
// The finished line stays on screen this long before the loop restarts.
const HOLD_MS = 1400
// Whole megabytes for marketing copy ("200 MB", not lib/format's "200.0 MB"), same source value.
const UPLOAD_LIMIT_MB = Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))

// Root paths, not bundler imports: the clip is a static asset that must not be hashed into the
// JS graph, and all three frames point at the same file so the browser fetches it once.
const DEMO_VIDEO_SRC = '/demo-reel.mp4'
// The clip's own first frame, so a card is never blank while the video loads — and the whole of
// what a reduced-motion visitor sees, since nothing autoplays for them.
const DEMO_POSTER_SRC = '/demo-reel-poster.jpg'

interface ShowcaseFrame {
  preset: Preset
  /** Width / height, and the label printed under the frame. */
  aspect: number
  ratioLabel: string
  /** A lit backdrop standing in for footage — see the note at the top. */
  backdrop: string
  /** Layout slot on the wrapper: `order-*` for mobile stacking, width for the row. */
  className: string
  /** Extra classes on the frame itself (the 9:16 caps its width when it has a row to itself). */
  figureClassName?: string
}

// The export renders at the project's own width x height (remotion/src/Root.tsx), so a square or
// landscape upload keeps its shape. Presets without the `stack` layout, so the three read as
// captions of different characters rather than one of them being a typographic trick.
const FRAMES: ShowcaseFrame[] = [
  {
    preset: PRESETS.dhamaka,
    aspect: 1,
    ratioLabel: '1:1',
    backdrop:
      'radial-gradient(90% 70% at 22% 30%, rgba(139, 152, 240, 0.22), transparent 62%), radial-gradient(70% 60% at 85% 90%, rgba(255, 107, 74, 0.12), transparent 70%), linear-gradient(160deg, #17171c, #0d0d10)',
    className: 'order-2 w-[calc(42%-0.5rem)] lg:order-1 lg:w-[25%]',
  },
  {
    preset: PRESETS.rangmanch,
    aspect: 9 / 16,
    ratioLabel: '9:16',
    backdrop:
      'radial-gradient(80% 50% at 50% 26%, rgba(255, 184, 62, 0.16), transparent 70%), radial-gradient(90% 60% at 50% 100%, rgba(255, 107, 74, 0.1), transparent 70%), linear-gradient(180deg, #19171a, #0c0c0e)',
    // Below lg it takes a row of its own, centred; the other two share the row under it.
    className: 'order-1 flex w-full justify-center lg:order-2 lg:w-[25%]',
    figureClassName: 'max-w-[300px] lg:max-w-none',
  },
  {
    preset: PRESETS['hinglish-bold'],
    aspect: 16 / 9,
    ratioLabel: '16:9',
    backdrop:
      'radial-gradient(60% 90% at 78% 35%, rgba(139, 152, 240, 0.18), transparent 65%), radial-gradient(50% 80% at 12% 80%, rgba(255, 184, 62, 0.09), transparent 70%), linear-gradient(200deg, #17171c, #0d0d10)',
    className: 'order-3 w-[calc(58%-0.5rem)] lg:w-[42%]',
  },
]

interface Fact {
  icon: ComponentType<{ className?: string }>
  value: number
  label: string
  detail: string
}

// Plain-language names for the four measured Signals fields, in schema order.
const SIGNAL_NAMES: Record<keyof typeof Signals.shape, string> = {
  loudnessZ: 'loudness',
  pitchZ: 'pitch',
  durationRatio: 'duration',
  extraMs: 'held time',
}

const FACTS: Fact[] = [
  {
    icon: Palette,
    value: PresetId.options.length,
    label: 'Caption styles',
    detail: Object.values(PRESETS)
      .map((preset) => preset.name)
      .join(' · '),
  },
  {
    icon: AudioWaveform,
    value: Emotion.options.length,
    label: 'Tones read per word',
    detail: Emotion.options.join(' · '),
  },
  {
    icon: Activity,
    value: Object.keys(Signals.shape).length,
    label: 'Voice signals measured per word',
    detail: Object.values(SIGNAL_NAMES).join(' · '),
  },
]

function CaptionFrame({ frame, timeMs }: { frame: ShowcaseFrame; timeMs: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const motionSafe = useMotionSafe()
  const { preset } = frame
  const progress = Math.min(1, (timeMs - CLIP_START_MS) / (CLIP_END_MS - CLIP_START_MS))

  return (
    <figure className={`group w-full ${frame.figureClassName ?? ''}`}>
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-xl border border-line-subtle shadow-soft transition-colors duration-300 group-hover:border-line-default"
        style={{ aspectRatio: frame.aspect, background: frame.backdrop }}
      >
        {/* The clip is portrait and the frames are 1:1, 9:16 and 16:9 — object-cover crops it to
            each shape rather than letterboxing or squashing it. All four of muted/loop/playsInline/
            autoPlay are required together, or mobile Safari refuses to autoplay. */}
        {motionSafe ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={DEMO_VIDEO_SRC}
            poster={DEMO_POSTER_SRC}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : (
          <img className="absolute inset-0 h-full w-full object-cover" src={DEMO_POSTER_SRC} alt="" aria-hidden="true" />
        )}
        {/* Scrim between the footage and the captions. A gradient, not a text-shadow: the presets
            already own their own stroke/glow, and darkening the plate is what keeps every preset
            legible over a moving image instead of only the heavy ones. */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65"
          aria-hidden="true"
        />
        <CaptionWords words={SAMPLE_WORDS} preset={preset} settings={SAMPLE_SETTINGS} width={width} timeMs={timeMs} motionSafe={motionSafe} />
        {/* Playhead: same signal colour and 2px weight as the editor's own timeline accent. */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ink-primary/10">
          <div className="h-full bg-signal/80" style={{ width: `${Math.max(0, progress) * 100}%` }} />
        </div>
      </div>
      <figcaption className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-ink-tertiary">
        <span className="transition-colors duration-200 group-hover:text-ink-secondary">{preset.name}</span>
        <span>{frame.ratioLabel}</span>
      </figcaption>
    </figure>
  )
}

function FactCard({ fact }: { fact: Fact }) {
  const Icon = fact.icon
  return (
    <div className="group flex h-full flex-col items-center rounded-xl border border-line-subtle bg-surface/40 px-6 py-8 text-center transition-colors duration-300 hover:border-line-default hover:bg-surface/70">
      <div className="flex items-center gap-3">
        <Icon className="size-6 text-ink-tertiary transition-colors duration-200 group-hover:text-signal" />
        <span className="font-display text-display-md leading-none text-ink-primary">{fact.value}</span>
      </div>
      <p className="mt-3 text-body-sm font-medium text-ink-secondary">{fact.label}</p>
      <p className="mt-2 font-mono text-[11px] leading-relaxed tracking-wide text-ink-tertiary">{fact.detail}</p>
    </div>
  )
}

export function CaptionShowcaseSection() {
  const motionSafe = useMotionSafe()
  const { navigate } = useRoute()
  const { ref, timeMs } = useLoopClock(CLIP_START_MS, CLIP_END_MS, HOLD_MS, motionSafe)

  return (
    <section id="showcase" className="scroll-mt-20 border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Tone-aware captions" lines={['One line of speech,', 'captioned how it was said.']} motionSafe={motionSafe}>
          Emphasis, stretched words and tone are read from the audio word by word, then layered on top of whichever
          caption style you pick. Below is a real Hinglish clip, in three of them.
        </SectionHeading>

        <RevealItem motionSafe={motionSafe} size="lg" style={{ animationDelay: '120ms' }} className="mt-10 flex justify-center">
          <div className="flex w-full max-w-xl flex-col items-stretch gap-2 rounded-2xl border border-line-subtle bg-surface/50 p-2 sm:flex-row sm:items-center sm:rounded-full sm:pl-5">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 py-2 text-body-sm text-ink-tertiary sm:justify-start sm:py-0">
              <Upload className="size-4 shrink-0" />
              <span className="truncate">MP4, MOV, MKV or WebM · up to {UPLOAD_LIMIT_MB} MB</span>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => navigate('/editor')}
              className="group gap-1.5 rounded-full bg-signal px-6 text-canvas transition-all duration-200 ease-out-expo hover:bg-signal hover:brightness-110 hover:shadow-[0_10px_28px_-6px_rgba(255,107,74,0.4)] focus-visible:ring-signal/50 focus-visible:ring-offset-canvas"
            >
              Add captions
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </RevealItem>

        <div
          ref={ref}
          className="mt-14 flex flex-wrap items-start justify-center gap-4 sm:mt-16 lg:flex-nowrap lg:items-center lg:gap-6"
        >
          {FRAMES.map((frame, index) => (
            <RevealItem
              key={frame.preset.id}
              motionSafe={motionSafe}
              size="lg"
              style={{ animationDelay: `${200 + Math.min(index, 5) * 90}ms` }}
              className={frame.className}
            >
              <CaptionFrame frame={frame} timeMs={timeMs} />
            </RevealItem>
          ))}
        </div>

        <div className="mt-16 grid gap-4 sm:mt-20 sm:grid-cols-3">
          {FACTS.map((fact, index) => (
            <RevealItem key={fact.label} motionSafe={motionSafe} size="lg" style={{ animationDelay: `${Math.min(index, 5) * 90}ms` }}>
              <FactCard fact={fact} />
            </RevealItem>
          ))}
        </div>
      </div>
    </section>
  )
}
