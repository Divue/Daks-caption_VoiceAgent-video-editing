import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { useOffscreen } from '@/hooks/useOffscreen'

/** Square hairline grid (design.md §3.3 "precision" texture), fading out toward the edges. */
const GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 40%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 40%, transparent 100%)',
}

interface Star {
  x: number
  y: number
  size: number
  delay: string
  twinkles: boolean
}

/** Deterministic scatter (no Math.random), so every render and reload draws the same sky. */
const STARS: Star[] = Array.from({ length: 46 }, (_, i) => {
  const x = (Math.sin(i * 12.9898) * 43758.5453) % 1
  const y = (Math.sin(i * 78.233) * 12345.6789) % 1
  return {
    x: Math.abs(x) * 100,
    y: Math.abs(y) * 100,
    size: i % 7 === 0 ? 2 : 1,
    delay: `${-((i * 0.37) % 4).toFixed(2)}s`,
    twinkles: i % 3 === 0,
  }
})

/**
 * Hero atmosphere matching the reference: hairline grid, a sparse star field and a soft
 * light pool behind the orb. Stars twinkle through opacity only; stopped under reduced motion.
 */
export function HeroGridBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null)
  // Pauses this backdrop's CSS loops while off-screen (see [data-offscreen] in index.css).
  useOffscreen(rootRef, (offscreen) => {
    if (rootRef.current) rootRef.current.dataset.offscreen = String(offscreen)
  })

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={GRID} />
      <div
        className="absolute top-[46%] left-1/2 size-[min(70vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(255 255 255 / 0.05) 0%, transparent 62%)' }}
      />
      {STARS.map((star, index) => (
        <span
          key={index}
          className={star.twinkles ? 'star-twinkle absolute rounded-full bg-white' : 'absolute rounded-full bg-white/50'}
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
          }}
        />
      ))}
    </div>
  )
}
