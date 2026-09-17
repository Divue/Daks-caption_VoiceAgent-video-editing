import { Mic, Settings2, Sparkles } from 'lucide-react'
import { AnimatedSection } from './AnimatedSection'

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: 'AI-powered',
    description: 'Accurate transcription and expressive caption generation.',
  },
  {
    icon: Settings2,
    title: 'Fully customizable',
    description: 'Control fonts, emphasis, colors, timing and styles.',
  },
  {
    icon: Mic,
    title: 'Voice-controlled editing',
    description: 'Tell the editor what you want and let the AI apply changes.',
  },
]

export function ValuePropsSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-6 sm:grid-cols-3">
        {VALUE_PROPS.map((item, index) => (
          <AnimatedSection key={item.title} style={{ transitionDelay: `${index * 100}ms` }}>
            <div className="flex h-full flex-col gap-3 rounded-xl border p-5">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          </AnimatedSection>
        ))}
      </div>
    </section>
  )
}
