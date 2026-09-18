import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { useOffscreen } from '@/hooks/useOffscreen'

/** Every other bar is hidden below `sm`, so phones draw 44. */
const BAR_COUNT = 88

/** Faint dot grid (design.md §3.3: ~4–6% on the canvas), faded out toward the edges. */
const GRID: CSSProperties = {
  backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(245 245 247 / 0.05) 1px, transparent 0)',
  backgroundSize: '24px 24px',
  maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)',
}

const BAND_FADE = 'linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)'

interface Bar {
  /** Full envelope height, 0–1 of the band. */
  peak: number
  /** Resting fraction of `peak` the bar breathes down to. */
  low: number
  /** Negative delay, so peaks travel left to right instead of pulsing together. */
  delay: string
}

/**
 * A speech-shaped envelope rather than noise: slow "phrase" swells with faster
 * "syllable" ripples inside them, plus short gaps where a speaker would breathe.
 * Deterministic, so every reload draws the same waveform.
 */
function speechEnvelope(count: number): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const phrase = Math.abs(Math.sin(i * 0.11 + 0.6))
    const syllable = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37))
    const breath = i % 29 < 2 ? 0.25 : 1
    return {
      peak: Math.max(0.08, phrase * syllable * breath),
      low: 0.3 + 0.25 * Math.abs(Math.sin(i * 1.7)),
      delay: `${-(i * 0.045).toFixed(3)}s`,
    }
  })
}

const BARS = speechEnvelope(BAR_COUNT)

/**
 * Hero atmosphere: grid for precision, one low off-axis signal glow for energy, and a
 * full-bleed waveform band with a playhead reading across it. The waveform is the
 * product's own motif (design.md §7): vertical bars, in the signal accent, never a
 * smooth decorative line. Everything is aria-hidden and pointer-transparent.
 *
 * Motion is transform-only (`signal-level`, `signal-sweep` in index.css). Under
 * prefers-reduced-motion the bars rest at full envelope height and the playhead is hidden.
 */
export function HeroSignalBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null)
  // Pauses this backdrop's CSS loops while off-screen (see [data-offscreen] in index.css).
  useOffscreen(rootRef, (offscreen) => {
    if (rootRef.current) rootRef.current.dataset.offscreen = String(offscreen)
  })

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={GRID} />

      {/* Primary glow, anchored low and off-axis behind the showcase (design.md §3.3). */}
      <div
        className="absolute bottom-[-18%] left-[30%] size-[760px] -translate-x-1/2 rounded-full opacity-[0.18] blur-[120px]"
        style={{ background: 'var(--accent-signal)' }}
      />
      {/* Secondary counter-glow, far corner, precision hue at lower strength. */}
      <div
        className="absolute -top-40 -right-40 size-[520px] rounded-full opacity-[0.07] blur-[120px]"
        style={{ background: 'var(--accent-precision)' }}
      />

      <div
        className="absolute inset-x-0 bottom-[16%] h-40 sm:bottom-[20%] sm:h-48"
        style={{ maskImage: BAND_FADE, WebkitMaskImage: BAND_FADE }}
      >
        {/* Carrier line: the silence the waveform sits on. */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-hairline" />

        <div className="absolute inset-0 flex items-center justify-between px-2">
          {BARS.map((bar, index) => (
            <span
              key={index}
              className="w-[3px] rounded-full bg-signal/30 max-sm:even:hidden"
              style={{ height: `${bar.peak * 100}%` }}
            >
              <span
                className="signal-level block size-full rounded-full bg-signal/50"
                style={{ '--lo': bar.low, animationDelay: bar.delay } as CSSProperties}
              />
            </span>
          ))}
        </div>

        {/* Playhead: a hairline with a short trailing wash, like a scrubber reading audio. */}
        <div className="signal-sweep absolute inset-y-0 -left-full w-full">
          <div className="absolute inset-y-0 right-0 w-24 bg-linear-to-r from-transparent to-signal/10" />
          <div className="absolute inset-y-0 right-0 w-px bg-signal/70" />
        </div>
      </div>
    </div>
  )
}
