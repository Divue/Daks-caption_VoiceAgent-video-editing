import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

// Same three pillars as the hero's own HERO_INFO_ITEMS (LandingPage.tsx,
// left untouched) — deliberately reworded and expanded here rather than
// restated, since the hero already states them briefly and this section's
// job is to go one level deeper into what each one actually does.
const PILLARS = [
  {
    n: '01',
    title: 'Speak the edit',
    description:
      'Every edit starts as a sentence, not a scrub through the timeline. Say what you want changed and the request goes to an agent that reads the current project as data, decides what to change, and returns a structured patch — validated against the same schema the editor itself writes to — before anything on screen updates.',
  },
  {
    n: '02',
    title: 'Tone-aware captions',
    description:
      'Speech is transcribed and read for how it was actually said, not just what was said — loudness, pitch and pacing per word — so emphasis, stretched syllables and tone-driven styling land on the words that carried the delivery, layered on top of a base caption preset rather than replacing it.',
  },
  {
    n: '03',
    title: 'Ready for the feed',
    description:
      'The same project data drives both the live preview and the final render, so what you see while editing is what gets exported — a short-form-ready file sized for vertical video, with no separate rendering step to second-guess.',
  },
]

/**
 * Dark-theme port of ../ValuePropsSection.tsx (untouched) — this is the
 * "Features" section. Restructured from bordered icon cards to the hero's
 * own numbered editorial treatment (see LandingPage.tsx's HeroProductInfo)
 * and expanded from the hero's one-line taglines into a real paragraph per
 * pillar, in different wording, so the section adds detail instead of
 * repeating the hero.
 */
export function ValuePropsSection() {
  const motionSafe = useMotionSafe()

  return (
    <section id="features" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 py-20 sm:px-8 sm:py-24">
      <RevealItem motionSafe={motionSafe} className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Features</p>
      </RevealItem>
      <div className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {PILLARS.map((item, index) => (
          <RevealItem key={item.n} motionSafe={motionSafe} style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-ink-tertiary">{item.n}</span>
              <span className="h-px w-4 bg-line-subtle" />
            </div>
            <p className="mt-3 text-body-lg font-medium text-ink-primary">{item.title}</p>
            <p className="mt-2 text-body-sm leading-relaxed text-ink-secondary">{item.description}</p>
          </RevealItem>
        ))}
      </div>
    </section>
  )
}
