import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { AnimatedSection } from './AnimatedSection'

export function FinalCtaSection() {
  const { navigate } = useRoute()

  return (
    <section className="border-t py-20">
      <AnimatedSection className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Ready to make every word count?
        </h2>
        <p className="text-muted-foreground">Upload a video and create expressive captions in seconds.</p>
        <Button type="button" size="lg" className="mt-2 gap-2" onClick={() => navigate('/editor')}>
          Get started for free
          <ArrowRight className="size-4" />
        </Button>
      </AnimatedSection>
    </section>
  )
}
