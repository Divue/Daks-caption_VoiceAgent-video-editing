import type { CSSProperties } from 'react'

/** The three output shapes a creator publishes in. Used by VideoFrame and the showcase. */
export type VideoShape = 'portrait' | 'square' | 'landscape'

export const VIDEO_SHAPES: Record<VideoShape, { ratio: string; label: string; aspectClass: string }> = {
  portrait: { ratio: '9:16', label: 'Reel', aspectClass: 'aspect-9/16' },
  square: { ratio: '1:1', label: 'Square', aspectClass: 'aspect-square' },
  landscape: { ratio: '16:9', label: 'Box', aspectClass: 'aspect-video' },
}

/** Stand-in "footage" for still frames: a dim, lit backdrop instead of fake video. */
export const STILL_FOOTAGE: CSSProperties = {
  background:
    'radial-gradient(90% 70% at 30% 20%, rgb(255 255 255 / 0.07), transparent 60%), linear-gradient(160deg, #1A1A21 0%, #0E0E12 100%)',
}
