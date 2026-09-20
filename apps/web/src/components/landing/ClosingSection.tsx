import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { useRoute } from '@/router'
import { ArrowRightIcon } from '@/icons'
import { useScrollVar } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

// The closing call to action. Its headline answers the hero's scroll split: the two lines slide
// in from opposite sides and lock together as the section arrives.
export function ClosingSection() {
  const motionSafe = useMotionSafe()
  const { navigate } = useRoute()
  const ref = useRef<HTMLElement>(null)
  // Widened from 0.65 to 1.3 screens of scroll so the reveal doesn't snap after one wheel tick.
  useScrollVar(ref, '--close-p', 1, -0.3, motionSafe)

  const slide = (dir: -1 | 1): CSSProperties | undefined =>
    motionSafe ? { transform: `translate3d(calc((1 - var(--close-p, 1)) * ${dir * 30}vw), 0, 0)`, opacity: 'calc(var(--close-p, 1) * 1.2 - 0.1)' } : undefined

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-line-subtle py-28 sm:py-40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-40%] left-1/2 h-[80%] w-[90%] max-w-[900px] -translate-x-1/2 rounded-full bg-signal/20 blur-[120px]"
        style={motionSafe ? { opacity: 'calc(var(--close-p, 1) * 0.9)' } : undefined}
      />
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-4 text-center sm:px-8">
        <RevealItem motionSafe={motionSafe}>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Your next reel</p>
        </RevealItem>
        <h2 className="mt-6 font-display text-[clamp(2.4rem,8.5vw,6.5rem)] font-bold leading-[0.95] tracking-[-0.045em] text-ink-primary">
          <span className="block whitespace-nowrap will-change-transform" style={slide(-1)}>
            Stop typing captions.
          </span>
          <span className="block whitespace-nowrap text-signal will-change-transform" style={slide(1)}>
            Start saying them.
          </span>
        </h2>
        <RevealItem motionSafe={motionSafe} size="lg" style={{ animationDelay: '90ms' }} className="mt-8 flex flex-col items-center">
          <p className="max-w-xl text-body-md text-ink-secondary sm:text-body-lg">
            Upload a reel, let it hear how you said it, and talk your way to the edit.
          </p>
          <button
            type="button"
            onClick={() => navigate('/editor')}
            className="group relative mt-10 inline-flex items-center gap-2 overflow-hidden rounded-full bg-signal px-8 py-4 text-body-md font-semibold text-canvas transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_36px_-8px_rgba(255,107,74,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {motionSafe && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shine"
              />
            )}
            <span className="relative">Start Creating</span>
            <ArrowRightIcon className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </RevealItem>
      </div>
    </section>
  )
}
