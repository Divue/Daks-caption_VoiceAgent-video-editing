import { useRef } from 'react'
import type { ComponentType } from 'react'
import { AudioWaveform, Download, Mic, Upload } from 'lucide-react'
import { UPLOAD_MAX_BYTES } from '@/lib/api'
import { SectionHeading, useScrollVar } from './caption-demo'
import { useMotionSafe } from './dark/useMotionSafe'

// The one how-it-works for the page (handoff §12.2 open decision: the navbar's 4-step and the old
// 3-step section disagreed). Upload → listen → talk → export covers both, in the product's order.

const UPLOAD_LIMIT_MB = Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))

const STEPS: { n: string; icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { n: '01', icon: Upload, title: 'Upload', body: `Drop in a reel: MP4, MOV, MKV or WebM, up to ${UPLOAD_LIMIT_MB} MB.` },
  {
    n: '02',
    icon: AudioWaveform,
    title: 'We listen',
    body: 'Your Hinglish is transcribed word by word, and every word’s loudness, pitch and timing is measured.',
  },
  { n: '03', icon: Mic, title: 'Talk to edit', body: '“Make it bigger.” “Shake that word.” The agent makes the edit; you review it.' },
  { n: '04', icon: Download, title: 'Export', body: 'A captioned video at your clip’s own size, ready for Reels, Shorts and TikTok.' },
]

export function StepsSection() {
  const motionSafe = useMotionSafe()
  const railRef = useRef<HTMLDivElement>(null)
  // The rail fills as the steps travel from 85% down the viewport to 35%.
  useScrollVar(railRef, '--steps-p', 0.85, 0.35, motionSafe)

  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="How it works" lines={['Four steps.', 'Zero timelines.']} motionSafe={motionSafe}>
          From raw reel to captioned export without touching a keyframe.
        </SectionHeading>

        <div ref={railRef} className="relative mt-16" style={motionSafe ? undefined : { ['--steps-p' as string]: 1 }}>
          {/* Rail: vertical on mobile, horizontal on desktop; fills with --steps-p. */}
          <div className="absolute left-[19px] top-0 h-full w-px bg-line-subtle lg:hidden" aria-hidden="true">
            <div className="h-full w-full origin-top bg-gradient-to-b from-signal to-signal/40" style={{ transform: 'scaleY(var(--steps-p, 0))' }} />
          </div>
          <div className="absolute left-0 top-[19px] hidden h-px w-full bg-line-subtle lg:block" aria-hidden="true">
            <div className="h-full w-full origin-left bg-gradient-to-r from-signal to-signal/40" style={{ transform: 'scaleX(var(--steps-p, 0))' }} />
          </div>

          <ol className="grid gap-10 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              // Each step lights up as the rail reaches it.
              const lit = `clamp(0.3, (var(--steps-p, 0) - ${(i / STEPS.length).toFixed(2)}) * 5 + 0.3, 1)`
              return (
                <li key={step.n} className="relative flex gap-5 lg:flex-col lg:gap-6" style={{ opacity: lit }}>
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-signal/50 bg-canvas text-signal shadow-[0_0_24px_-8px_rgba(255,107,74,0.6)]">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Step {step.n}</p>
                    <p className="mt-2 font-display text-heading-lg font-bold tracking-tight text-ink-primary">{step.title}</p>
                    <p className="mt-2 max-w-xs text-body-sm leading-relaxed text-ink-secondary">{step.body}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
