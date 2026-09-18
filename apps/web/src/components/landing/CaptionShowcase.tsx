import { useRef } from 'react'
import { useScrollFrame } from '@/hooks/useScrollFrame'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { CaptionedVideo } from './CaptionedVideo'
import type { CaptionStyle } from './CaptionedVideo'
import { VideoShapeLabel } from './VideoFrame'
import type { VideoShape } from './video-shapes'
import { SAMPLE_CAPTIONS } from './sample-captions'
import { cn } from '@/lib/utils'

/** Parallax travel for the side cards, in px, from the md breakpoint up. */
const PARALLAX_PX = 44
const DESKTOP = window.matchMedia('(min-width: 768px)')

/** Placeholder reel. Drop a real vertical clip here and every preview updates with it. */
const DEMO_SRC = '/demo/sample-reel.mp4'

interface ShowcaseCard {
  shape: VideoShape
  style: CaptionStyle
  /** Width per breakpoint. Side cards sit two-up under the reel on mobile. */
  sizeClass: string
  featured?: boolean
  delay: string
  floatDelay: string
  /** Parallax direction: -1 drifts up as you scroll, 1 drifts down, 0 stays put. */
  depth: -1 | 0 | 1
}

/** DOM order is the desktop order (square, reel, box); `order-first` lifts the reel on mobile. */
const CARDS: ShowcaseCard[] = [
  { shape: 'square', style: 'minimal-chip', sizeClass: 'w-[calc(50%-0.5rem)] md:w-52 lg:w-56', delay: '80ms', floatDelay: '-1.5s', depth: -1 },
  {
    shape: 'portrait',
    style: 'expressive',
    sizeClass: 'order-first w-64 md:order-none sm:w-72',
    featured: true,
    delay: '0ms',
    floatDelay: '0s',
    depth: 0,
  },
  { shape: 'landscape', style: 'bold-outline', sizeClass: 'w-[calc(50%-0.5rem)] md:w-60 lg:w-72', delay: '160ms', floatDelay: '-3s', depth: 1 },
]

/**
 * Cards stay fully opaque (hierarchy comes from size) so the waveform behind never shows
 * through a frame.
 *
 * The same clip in the three shapes creators publish: 9:16 reel, 1:1 square, 16:9 box.
 * The featured reel carries the speech-aware layer (angry, emphasis, stretch); the side
 * frames show that the caption re-fits when the frame changes.
 *
 * Each card pops in once (outer element, scale) and then floats (inner element,
 * translateY). The two are split so they do not fight over `transform`; negative delays
 * keep the floats out of phase. Both stop under prefers-reduced-motion.
 */
export function CaptionShowcase() {
  const rowRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const reducedMotion = usePrefersReducedMotion()

  // Scroll parallax: `offset` runs from -1 to 1 as the row crosses the viewport, and each
  // side card gets its own `translate` in opposite directions, which gives the row depth
  // around the reel. Writing one property per card (instead of a CSS variable on the row)
  // restyles two elements per frame, not the whole row. `translate` composes with the
  // pop/float transforms. Desktop only; off under reduced motion.
  useScrollFrame(() => {
    const row = rowRef.current
    if (!row) return
    const rect = row.getBoundingClientRect()
    const offset = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight))
    const amplitude = DESKTOP.matches ? PARALLAX_PX : 0
    return () => {
      CARDS.forEach((card, index) => {
        const element = cardRefs.current[index]
        if (element && card.depth !== 0) element.style.translate = `0 ${(offset * amplitude * card.depth).toFixed(1)}px`
      })
    }
  }, !reducedMotion)

  return (
    <div
      ref={rowRef}
      className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-4 md:flex-nowrap md:gap-6"
    >
      {CARDS.map((card, index) => (
        <figure
          key={card.shape}
          ref={(element) => {
            cardRefs.current[index] = element
          }}
          aria-hidden={!card.featured}
          className={cn('showcase-pop relative shrink-0', card.featured && 'z-10', card.sizeClass)}
          style={{ animationDelay: card.delay }}
        >
          <div className="showcase-float" style={{ animationDelay: card.floatDelay }}>
            <CaptionedVideo
              src={DEMO_SRC}
              captions={SAMPLE_CAPTIONS}
              style={card.style}
              shape={card.shape}
              className={card.featured ? 'shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]' : undefined}
            />
          </div>
          <figcaption className="mt-3 text-center">
            <VideoShapeLabel shape={card.shape} />
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
