import { AnimatedSection } from './AnimatedSection'

const USE_CASES = [
  'YouTube Shorts',
  'Instagram Reels',
  'TikTok',
  'Podcasts',
  'Educational videos',
  'Talking-head content',
]

export function CreatorSection() {
  return (
    <section className="border-t bg-muted/30 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AnimatedSection>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground">
            Built for the way creators actually edit.
          </h2>
        </AnimatedSection>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {USE_CASES.map((useCase, index) => (
            <AnimatedSection key={useCase} style={{ transitionDelay: `${index * 60}ms` }}>
              <div className="rounded-lg border bg-card px-4 py-3 text-center text-sm font-medium text-foreground">
                {useCase}
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  )
}
