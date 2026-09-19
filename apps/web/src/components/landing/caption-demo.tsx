import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { Preset, Project, Word } from '@captions/shared'
import { glowWrapperCss, renderedText, resolveWordStyle, revealOpacity, styleToCss } from '@/lib/caption-style'

// Shared by the landing sections that draw real captions. Everything here goes through the
// editor's own resolver (lib/caption-style.ts), so a landing frame shows what the editor would.

/** Element width in px. The resolver sizes captions against the frame width, like the editor stage. */
export function useElementWidth<T extends HTMLElement>(): { ref: RefObject<T | null>; width: number } {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

const TICK_MS = 50

/**
 * A looping playhead over [startMs, endMs] plus a hold on the finished line. Ticks only while
 * `ref` is on screen. Reduced motion: parked on the finished line.
 */
export function useLoopClock(startMs: number, endMs: number, holdMs: number, motionSafe: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const loopMs = endMs - startMs + holdMs

  useEffect(() => {
    const element = ref.current
    if (!element || !motionSafe) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [motionSafe])

  useEffect(() => {
    if (!visible) return
    // Advance by real elapsed time, not by tick count: throttled timers (background tab, a busy
    // main thread) then skip ahead instead of slowing the whole demo down.
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const step = now - last
      last = now
      setElapsed((value) => (value + step) % loopMs)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [visible, loopMs])

  // Math.min: a shorter new line can't overshoot while the old elapsed wraps on the next tick.
  return { ref, timeMs: motionSafe ? startMs + Math.min(elapsed, loopMs) : endMs }
}

interface CaptionWordsProps {
  words: Word[]
  preset: Preset
  settings: Project['settings']
  /** Frame width in px; nothing renders until it is known. */
  width: number
  timeMs: number
  motionSafe: boolean
  /** Shake angry/shaken words continuously, not only while spoken (static demo frames). */
  shakeAlways?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * One caption line, positioned by the preset's own x/y. Angry words shake while spoken, with the
 * same amplitude the editor uses (style.shake, px) — see CaptionRenderer's shakeOffset.
 */
export function CaptionWords({ words, preset, settings, width, timeMs, motionSafe, shakeAlways = false, className = '', style }: CaptionWordsProps) {
  if (width <= 0) return null
  return (
    <div
      aria-hidden="true"
      className={`absolute flex w-[88%] flex-wrap items-baseline justify-center gap-x-[0.28em] ${className}`}
      style={{
        left: `${preset.base.x}%`,
        top: `${preset.base.y}%`,
        transform: 'translate(-50%, -50%)',
        textAlign: preset.align ?? 'center',
        ...style,
      }}
    >
      {words.map((word) => {
        const resolved = resolveWordStyle(word, preset, settings, width)
        const started = timeMs >= word.startMs
        const speaking = started && timeMs < word.endMs + 350
        const shaking = motionSafe && resolved.shake > 0 && (shakeAlways || speaking)
        return (
          <span key={word.id} className="inline-block" style={glowWrapperCss(resolved)}>
            <span
              className={`inline-block transition-opacity duration-100 ${shaking ? 'animate-caption-shake' : ''}`}
              style={{
                ...styleToCss(resolved),
                opacity: revealOpacity(preset.reveal, started),
                ['--shake' as string]: `${resolved.shake}px`,
              }}
            >
              {renderedText(word, preset.stretch)}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Writes scroll progress (0..1) into a CSS custom property on `ref`, once per animation frame,
 * with no React re-render. `start`/`end` are the element's top edge position as a fraction of
 * the viewport height: progress is 0 when the top is at `start` and 1 when it reaches `end`.
 */
export function useScrollVar(ref: RefObject<HTMLElement | null>, name: string, start: number, end: number, enabled: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = element.getBoundingClientRect().top / window.innerHeight
      const progress = Math.min(1, Math.max(0, (start - top) / (start - end)))
      element.style.setProperty(name, progress.toFixed(4))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ref, name, start, end, enabled])
}

interface SectionHeadingProps {
  eyebrow: string
  /** Two lines; the second is drawn in the signal colour. */
  lines: [string, string]
  children?: ReactNode
  motionSafe: boolean
  align?: 'center' | 'left'
}

/**
 * The landing's section opener. Mirrors the hero's scroll split in reverse: as the heading scrolls
 * into view, line one slides in from the left and line two from the right, meeting in place.
 */
export function SectionHeading({ eyebrow, lines, children, motionSafe, align = 'center' }: SectionHeadingProps) {
  const ref = useRef<HTMLDivElement>(null)
  // 0 when the heading's top enters at the bottom of the viewport, 1 by the time it is 60% up.
  useScrollVar(ref, '--in', 1, 0.6, motionSafe)
  const slide = (dir: -1 | 1): CSSProperties | undefined =>
    motionSafe
      ? { transform: `translate3d(calc((1 - var(--in, 1)) * ${dir * 14}vw), 0, 0)`, opacity: 'calc(0.15 + var(--in, 1) * 0.85)' }
      : undefined
  const centered = align === 'center'

  return (
    <div ref={ref} className={`flex flex-col gap-4 ${centered ? 'items-center text-center' : 'items-start text-left'}`}>
      <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-signal">
        <span className="h-px w-6 bg-signal/60" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.035em] text-ink-primary">
        <span className="block will-change-transform" style={slide(-1)}>
          {lines[0]}
        </span>
        <span className="block text-signal will-change-transform" style={slide(1)}>
          {lines[1]}
        </span>
      </h2>
      {children && (
        <div className="max-w-2xl text-body-md text-ink-secondary sm:text-body-lg">{children}</div>
      )}
    </div>
  )
}
