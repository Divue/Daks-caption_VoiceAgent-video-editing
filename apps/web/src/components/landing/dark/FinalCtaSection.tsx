import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { ArrowRightIcon } from '@/icons'
import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

/**
 * Dark-theme port of ../FinalCtaSection.tsx (untouched) — with a content
 * fix. The original's "in seconds" was an unverified speed claim against
 * the real STT+Bedrock pipeline latency, and "for free" implied a pricing
 * model this MVP doesn't have (no auth, no billing at all) — both dropped.
 * CTA restyled to match the hero's own "Start Creating" pill button
 * (LandingNavbar.tsx) exactly, still using the shared Button component.
 */
export function FinalCtaSection() {
  const { navigate } = useRoute()
  const motionSafe = useMotionSafe()

  return (
    <section className="border-t border-line-subtle py-20 sm:py-28">
      <RevealItem
        motionSafe={motionSafe}
        className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 text-center sm:px-8"
      >
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Get started</p>
        <h2 className="font-display text-heading-lg text-ink-primary sm:text-display-md">
          Ready to make every word count?
        </h2>
        <p className="text-body-sm text-ink-secondary sm:text-body-md">
          Upload a video and create expressive, tone-aware captions.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => navigate('/editor')}
          className="group mt-2 gap-1.5 rounded-full bg-signal px-6 text-canvas shadow-[0_0_0_rgba(255,107,74,0)] transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-signal hover:brightness-110 hover:shadow-[0_10px_28px_-6px_rgba(255,107,74,0.4),0_0_36px_-10px_rgba(255,107,74,0.3)] focus-visible:ring-signal/50 focus-visible:ring-offset-canvas"
        >
          Start Creating
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Button>
      </RevealItem>
    </section>
  )
}
