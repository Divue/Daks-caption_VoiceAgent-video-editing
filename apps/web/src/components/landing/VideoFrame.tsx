import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { VIDEO_SHAPES } from './video-shapes'
import type { VideoShape } from './video-shapes'

interface VideoFrameProps {
  shape: VideoShape
  children: ReactNode
  className?: string
}

/**
 * Dark-chrome frame for any video preview on the landing page (design.md §9: real frames,
 * never illustrations). It is a size container, so children can size captions in `cqmin`
 * and stay proportional to the frame's short edge in every shape.
 */
export function VideoFrame({ shape, children, className }: VideoFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-surface ring-1 ring-white/8',
        VIDEO_SHAPES[shape].aspectClass,
        className,
      )}
      style={{ containerType: 'size' }}
    >
      {children}
    </div>
  )
}

/** Mono caption under a frame: `9:16 · Reel`. */
export function VideoShapeLabel({ shape, className }: { shape: VideoShape; className?: string }) {
  const { ratio, label } = VIDEO_SHAPES[shape]
  return (
    <p
      className={cn(
        'inline-block rounded-full bg-background/80 px-2 py-0.5 font-mono text-[13px] leading-[1.4] text-faint backdrop-blur',
        className,
      )}
    >
      <span className="text-muted-foreground">{ratio}</span> · {label}
    </p>
  )
}
