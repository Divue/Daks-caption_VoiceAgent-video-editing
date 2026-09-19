import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

// Content-type tags only — styled as plain text chips, not platform
// logos/badges, since these describe the kind of content the product suits,
// not an integration or partnership with any of these platforms.
const USE_CASES = ['YouTube Shorts', 'Instagram Reels', 'TikTok', 'Podcasts', 'Educational videos', 'Talking-head content']

/** Dark-theme port of ../CreatorSection.tsx (untouched). Same content, restyled only. */
export function CreatorSection() {
  const motionSafe = useMotionSafe()

  return (
    <section id="for-creators" className="scroll-mt-24 border-t border-line-subtle py-20 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <RevealItem motionSafe={motionSafe} className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">For creators</p>
          <h2 className="mt-3 font-display text-heading-lg text-ink-primary">Built for the way creators actually edit.</h2>
        </RevealItem>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {USE_CASES.map((useCase, index) => (
            <RevealItem key={useCase} motionSafe={motionSafe} style={{ animationDelay: `${index * 60}ms` }}>
              <span className="inline-flex rounded-full border border-line-subtle bg-surface/60 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-ink-secondary backdrop-blur-md">
                {useCase}
              </span>
            </RevealItem>
          ))}
        </div>
      </div>
    </section>
  )
}
