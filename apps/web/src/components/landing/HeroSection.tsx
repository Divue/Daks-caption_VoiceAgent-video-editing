import { ArrowRight, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { AnimatedSection } from './AnimatedSection'
import { EditorPreviewMock } from './EditorPreviewMock'

export function HeroSection() {
  const { navigate } = useRoute()

  return (
    <section
      id="top"
      className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24 lg:flex-row lg:pt-28 lg:text-left"
    >
      <AnimatedSection className="flex flex-1 flex-col items-center gap-5 lg:items-start">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          Make your videos <span className="text-primary">speak louder.</span>
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          AI-powered captions that match your style, emotion, and story.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Automatically turn your speech into expressive captions. Edit every word. Change styles. And control your
          captions with your voice.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Button type="button" size="lg" className="gap-2" onClick={() => navigate('/editor')}>
            Get started for free
            <ArrowRight className="size-4" />
          </Button>
          <a
            href="#ai-editing"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <PlayCircle className="size-4" />
            Watch demo
          </a>
        </div>
      </AnimatedSection>

      <AnimatedSection className="flex flex-1 items-center justify-center" style={{ transitionDelay: '150ms' }}>
        <EditorPreviewMock />
      </AnimatedSection>
    </section>
  )
}
