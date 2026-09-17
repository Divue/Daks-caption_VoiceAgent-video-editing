import { AnimatedSection } from './AnimatedSection'

const STEPS = [
  { number: '01', title: 'Upload your video', description: 'Upload a short-form video.' },
  {
    number: '02',
    title: 'AI creates expressive captions',
    description: 'The system understands speech and delivery to create styled captions.',
  },
  { number: '03', title: 'Edit with your voice', description: 'Tell the AI what to change.' },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t bg-muted/30 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AnimatedSection>
          <p className="text-center text-sm font-semibold text-primary">How it works</p>
        </AnimatedSection>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <AnimatedSection key={step.number} style={{ transitionDelay: `${index * 100}ms` }}>
              <div className="flex flex-col gap-2">
                <span className="text-3xl font-semibold text-primary/30">{step.number}</span>
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  )
}
