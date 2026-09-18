import { useEffect, useRef, useState } from 'react'
import { useOffscreen } from '@/hooks/useOffscreen'
import type { CSSProperties } from 'react'
import { EMOTION_STYLES } from '@captions/shared'
import type { Emotion } from '@captions/shared'
import { cn } from '@/lib/utils'
import { VideoFrame } from './VideoFrame'
import type { VideoShape } from './video-shapes'

/**
 * Landing-page demo data — marketing copy, not the editor's Project schema.
 * Times are seconds here because they are compared against `video.currentTime`;
 * real project data uses integer milliseconds (see packages/shared/src/project.ts).
 */
export interface CaptionWord {
  word: string
  startTime: number
  endTime: number
  /** The layers the pipeline adds per word (same meaning as `Word` in the shared schema). */
  emphasis?: boolean
  emotion?: Emotion
  /** Display text for a held word, e.g. `hello` spoken long -> `hellooo`. */
  stretched?: string
}

export type CaptionStyle =
  | 'bold-outline'
  | 'karaoke-highlight'
  | 'minimal-chip'
  | 'motion-blur'
  | 'text-scramble'
  | 'blur-reveal'
  | 'expressive'

interface CaptionedVideoProps {
  src: string
  captions: CaptionWord[]
  style: CaptionStyle
  shape?: VideoShape
  className?: string
}

const WORDS_PER_GROUP = 3

/** How long a word spends decoding in `text-scramble`, and how often characters reshuffle. */
const SCRAMBLE_WINDOW_MS = 260
const SCRAMBLE_STEP_MS = 45
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%$&@*'

/** Black outline that keeps captions readable over any footage. */
const OUTLINE: CSSProperties = {
  WebkitTextStroke: '0.5cqmin #000000',
  paintOrder: 'stroke fill',
}

const SHADOW = '0 0.4cqmin 0.9cqmin rgba(0, 0, 0, 0.55)'

/** Index of the last word that has started by `time`; -1 before the first word. */
function activeWordAt(captions: CaptionWord[], time: number): number {
  let index = -1
  for (let i = 0; i < captions.length; i += 1) {
    if (captions[i].startTime > time) break
    index = i
  }
  return index
}

/** Deterministic, so a re-render inside one step never reshuffles the characters. */
function scrambleChar(seed: number): string {
  const hash = Math.abs(Math.sin(seed * 12.9898) * 43758.5453)
  return SCRAMBLE_CHARS[Math.floor(hash) % SCRAMBLE_CHARS.length]
}

/** Decodes left to right: characters before `step`'s progress are already locked in. */
function scrambled(word: string, step: number): string {
  const progress = Math.min((step * SCRAMBLE_STEP_MS) / SCRAMBLE_WINDOW_MS, 1)
  const locked = Math.floor(progress * word.length)
  return Array.from(word, (character, index) =>
    index < locked || character === ' ' ? character : scrambleChar(step * 31 + index),
  ).join('')
}

/**
 * The product's own look: a quiet base caption with the pipeline's per-word layers on top
 * (CLAUDE.md: presets are the base, emphasis and emotion layer over any preset).
 * Angry uses the shared EMOTION_STYLES values; its shake is a CSS class, not a style.
 */
function expressiveStyle(entry: CaptionWord, isActive: boolean): CSSProperties {
  const base: CSSProperties = {
    ...OUTLINE,
    fontFamily: "'Poppins', 'Inter', sans-serif",
    fontWeight: 700,
    fontSize: '7.4cqmin',
    color: '#FFFFFF',
    textShadow: SHADOW,
    transform: isActive ? 'scale(1.08)' : 'scale(1)',
    transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1), color 120ms linear',
  }

  if (entry.emotion === 'angry') {
    const angry = EMOTION_STYLES.angry
    return {
      ...base,
      fontWeight: angry.weight,
      fontSize: '8.6cqmin',
      color: angry.color,
      textTransform: angry.uppercase ? 'uppercase' : 'none',
      transform: undefined,
    }
  }
  if (entry.emotion === 'excited') {
    return {
      ...base,
      fontWeight: 800,
      color: isActive ? '#FFE600' : '#FFFFFF',
      transform: `scale(${isActive ? EMOTION_STYLES.excited.fontSize : 1})`,
    }
  }
  if (entry.emphasis) {
    return { ...base, fontWeight: 800, fontSize: '9.2cqmin', textTransform: 'uppercase' }
  }
  return { ...base, color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.82)' }
}

function wordStyle(style: CaptionStyle, isActive: boolean): CSSProperties {
  switch (style) {
    case 'expressive':
      return {}
    case 'bold-outline':
      return {
        ...OUTLINE,
        fontFamily: "'Anton', 'Arial Narrow', sans-serif",
        fontWeight: 800,
        fontSize: '8.5cqmin',
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
        color: '#FF4A1C',
        textShadow: SHADOW,
      }
    case 'karaoke-highlight':
      return {
        ...OUTLINE,
        fontFamily: "'Poppins', 'Inter', sans-serif",
        fontWeight: 800,
        fontSize: '8.5cqmin',
        textTransform: 'uppercase',
        color: isActive ? '#FFE600' : '#FFFFFF',
        transform: isActive ? 'scale(1.06)' : 'scale(1)',
        transition: 'color 90ms linear, transform 90ms ease-out',
        textShadow: SHADOW,
      }
    case 'minimal-chip':
      return {
        fontFamily: "'Inter', sans-serif",
        fontWeight: 600,
        fontSize: '6.8cqmin',
        color: isActive ? '#111111' : 'rgba(255, 255, 255, 0.55)',
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.92)' : 'transparent',
        borderRadius: '1.8cqmin',
        padding: '0.2cqmin 1.4cqmin',
        transition: 'background-color 110ms linear, color 110ms linear',
        textShadow: isActive ? 'none' : '0 0.3cqmin 0.8cqmin rgba(0, 0, 0, 0.5)',
      }
    case 'motion-blur':
      return {
        ...OUTLINE,
        fontFamily: "'Poppins', 'Inter', sans-serif",
        fontWeight: 800,
        fontSize: '8.5cqmin',
        textTransform: 'uppercase',
        color: '#FFFFFF',
        textShadow: SHADOW,
      }
    case 'text-scramble':
      return {
        ...OUTLINE,
        fontFamily: "ui-monospace, 'SFMono-Regular', 'Menlo', monospace",
        fontWeight: 700,
        fontSize: '7.2cqmin',
        textTransform: 'uppercase',
        color: isActive ? 'var(--accent-precision)' : '#FFFFFF',
        transition: 'color 120ms linear',
        textShadow: SHADOW,
      }
    case 'blur-reveal':
      return {
        fontFamily: "'Inter', sans-serif",
        fontWeight: 700,
        fontSize: '7.6cqmin',
        textTransform: 'uppercase',
        color: '#FFFFFF',
        filter: isActive ? 'blur(0)' : 'blur(0.5cqmin)',
        opacity: isActive ? 1 : 0.68,
        transition: 'filter 240ms ease-out, opacity 240ms ease-out',
        textShadow: SHADOW,
      }
  }
}

/**
 * A looping muted video with a caption overlay driven by real playback position.
 * The active word is recomputed on every animation frame so the highlight stays in
 * sync with `currentTime` — a CSS-only animation would drift from the video. State is
 * only written when the active word (or scramble step) actually changes, so this
 * re-renders a few times a second rather than sixty.
 *
 * Until the first frame is decoded (`loadeddata`) a shimmering skeleton covers the frame
 * and the captions stay hidden; both cross-fade in once the video is ready. Off-screen, the
 * video pauses and the caption-sync loop stops, so hidden frames cost nothing while scrolling.
 */
export function CaptionedVideo({ src, captions, style, shape = 'portrait', className }: CaptionedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [scrambleStep, setScrambleStep] = useState(-1)
  const [ready, setReady] = useState(false)
  const [offscreen, setOffscreen] = useState(false)

  // Off-screen videos stop decoding and stop the caption-sync loop below.
  useOffscreen(videoRef, (next) => {
    setOffscreen(next)
    const video = videoRef.current
    if (!video) return
    if (next) video.pause()
    else void video.play().catch(() => undefined) // autoplay can be refused; the poster frame stays
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video || offscreen) return

    let frame = 0
    const tick = () => {
      const next = activeWordAt(captions, video.currentTime)
      setActiveIndex((current) => (current === next ? current : next))

      if (style === 'text-scramble') {
        const word = captions[next]
        const elapsedMs = word ? (video.currentTime - word.startTime) * 1000 : Number.POSITIVE_INFINITY
        const step = elapsedMs < SCRAMBLE_WINDOW_MS ? Math.floor(elapsedMs / SCRAMBLE_STEP_MS) : -1
        setScrambleStep((current) => (current === step ? current : step))
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [captions, style, offscreen])

  const groupStart = Math.floor(Math.max(activeIndex, 0) / WORDS_PER_GROUP) * WORDS_PER_GROUP
  const group = captions.slice(groupStart, groupStart + WORDS_PER_GROUP)
  const lowercase = style === 'minimal-chip'

  return (
    <VideoFrame shape={shape} className={className}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        onLoadedData={() => setReady(true)}
        // A failed load settles too, so the shimmer never runs forever; the captions still show.
        onError={() => setReady(true)}
        className={cn('size-full object-cover transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')}
      />

      <div
        aria-hidden
        className={cn(
          'skeleton pointer-events-none absolute inset-0 transition-opacity duration-500',
          ready ? 'opacity-0' : 'opacity-100',
        )}
      />

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[11%] flex flex-wrap items-center justify-center text-center transition-opacity delay-150 duration-500',
          ready ? 'opacity-100' : 'opacity-0',
        )}
        style={{ columnGap: '1.8cqmin', rowGap: '1.4cqmin', paddingInline: '6cqmin' }}
      >
        {group.map((entry, index) => {
          const isActive = groupStart + index === activeIndex
          const text = lowercase ? entry.word.toLowerCase() : entry.word
          const decoding = style === 'text-scramble' && isActive && scrambleStep >= 0
          const expressive = style === 'expressive'
          const shown = expressive && entry.stretched ? entry.stretched : text

          return (
            <span
              key={`${entry.word}-${entry.startTime}`}
              className={cn(
                style === 'motion-blur' && 'caption-motion-blur',
                expressive && entry.emotion === 'angry' && 'caption-shake',
              )}
              style={expressive ? expressiveStyle(entry, isActive) : wordStyle(style, isActive)}
            >
              {decoding ? scrambled(shown, scrambleStep) : shown}
            </span>
          )
        })}
      </div>
    </VideoFrame>
  )
}
