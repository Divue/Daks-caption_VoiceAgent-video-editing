import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { Preset, Project, Word } from '@captions/shared'
import { glowWrapperCss, renderedText, resolveWordStyle, revealOpacity, styleToCss } from '@/lib/caption-style'
import { useAnimationLifecycle, useInView } from '@/hooks/useInView'

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
 * A looping playhead over [startMs, endMs] plus a hold on the finished line. Reuses the
 * scroll-reveal system's own `useInView` for visibility (~25% shown starts it, matching the
 * "trigger slightly early" reveal timing; only a full exit — ratio back to 0 — resets it, so
 * scroll jitter right at the edge can't restart it mid-jitter). Every fresh entry restarts the
 * loop from `startMs`, not a resume of wherever it was paused, so the user always sees the whole
 * sequence from the beginning. The interval itself only exists while in view, so nothing ticks
 * for a section nobody can see. Reduced motion: parked on the finished line, never ticking.
 */
export function useLoopClock(startMs: number, endMs: number, holdMs: number, motionSafe: boolean) {
  const { ref, isInView } = useInView<HTMLDivElement>(0.25)
  const [elapsed, setElapsed] = useState(0)
  const loopMs = endMs - startMs + holdMs

  useEffect(() => {
    if (!motionSafe || !isInView) return
    setElapsed(0)
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
  }, [motionSafe, isInView, loopMs])

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

const SECTION_STAGGER_BASE_MS = 80
const SECTION_STAGGER_STEP_MS = 70

/**
 * The landing's section opener. Plays the hero headline's own reveal language — each word rises
 * out of its own masked line, staggered, then the body copy fades up — the first time the section
 * scrolls into view (see HeroHeadline/`reveal` in pages/LandingPage.tsx for the same technique).
 */
export function SectionHeading({ eyebrow, lines, children, motionSafe, align = 'center' }: SectionHeadingProps) {
  const { ref, isInView, shouldAnimate } = useInView<HTMLDivElement>(0.3)
  const centered = align === 'center'
  // Eyebrow and body copy share one isInView/shouldAnimate (both belong to the same heading), but
  // finish animating at different times (different delays, same duration) — will-change is gated
  // off whichever finishes LAST (the body copy, when there is one) so it isn't torn down on both
  // elements the moment the earlier-finishing eyebrow completes, while the body is still moving.
  const isAnimating = isInView && shouldAnimate
  const { style: liveStyle, onAnimationEnd } = useAnimationLifecycle(isAnimating)

  // Word-reveal: same mask-clip technique as HeroHeadline, staggered across both lines. Entering
  // on a downward scroll plays the animation; re-entering on an upward scroll (isInView true,
  // shouldAnimate false) snaps straight to the settled look instead of replaying it.
  const wordReveal = (delayMs: number): { className: string; style?: CSSProperties } => {
    if (!motionSafe) return { className: '' }
    if (!isInView) return { className: '', style: { transform: 'translateY(115%) rotate(6deg)' } }
    if (!shouldAnimate) return { className: '' }
    return { className: 'animate-mask-up', style: { animationDelay: `${delayMs}ms` } }
  }
  // Reveal for the eyebrow and body copy — index.css's --animate-reveal-sm, a dedicated keyframe
  // for this scroll-reveal system (opacity + translateY only, no filter: blur — the hero's own
  // `rise` bakes in a blur, and the body copy here can be a fairly large text block; every section
  // entering on a downward scroll now runs many of these staggered at once, so keeping this path
  // compositor-cheap, plus the will-change hint below, is what keeps the scroll itself smooth).
  const reveal = (delayMs: number): { className: string; style?: CSSProperties } => {
    if (!motionSafe) return { className: '' }
    if (!isInView) return { className: '', style: { opacity: 0, transform: 'translateY(20px)' } }
    if (!shouldAnimate) return { className: '' }
    return { className: 'animate-reveal-sm', style: { animationDelay: `${delayMs}ms`, ...liveStyle } }
  }

  const lineWords = lines.map((line) => line.split(' '))
  const wordCount = lineWords[0].length + lineWords[1].length
  const headingStart = SECTION_STAGGER_BASE_MS + 120
  const bodyDelay = headingStart + wordCount * SECTION_STAGGER_STEP_MS + 150
  // The body copy (when present) always has the larger delay, so it's always the last of the two
  // to finish — that's the one whose animationend should retire the shared will-change hint.
  const lastToFinishHandlesEnd = !children

  return (
    <div ref={ref} className={`flex flex-col gap-4 ${centered ? 'items-center text-center' : 'items-start text-left'}`}>
      <p
        className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-signal ${reveal(SECTION_STAGGER_BASE_MS).className}`}
        style={reveal(SECTION_STAGGER_BASE_MS).style}
        onAnimationEnd={lastToFinishHandlesEnd ? onAnimationEnd : undefined}
      >
        <span className="h-px w-6 bg-signal/60" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.035em] text-ink-primary">
        {lineWords.map((words, lineIdx) => (
          <span key={lineIdx} className={`block ${lineIdx === 1 ? 'text-signal' : ''}`}>
            {words.map((word, i) => {
              const wordIdx = lineIdx === 0 ? i : lineWords[0].length + i
              const delay = headingStart + wordIdx * SECTION_STAGGER_STEP_MS
              const { className, style } = wordReveal(delay)
              return (
                <Fragment key={`${lineIdx}-${i}`}>
                  <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                    <span className={`inline-block origin-bottom-left ${className}`} style={style}>
                      {word}
                    </span>
                  </span>
                  {i < words.length - 1 ? ' ' : ''}
                </Fragment>
              )
            })}
          </span>
        ))}
      </h2>
      {children && (
        <div
          className={`max-w-2xl text-body-md text-ink-secondary sm:text-body-lg ${reveal(bodyDelay).className}`}
          style={reveal(bodyDelay).style}
          onAnimationEnd={onAnimationEnd}
        >
          {children}
        </div>
      )}
    </div>
  )
}
