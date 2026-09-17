import { CheckCircle2 } from 'lucide-react'
import { AnimatedSection } from './AnimatedSection'
import { EditorPreviewMock } from './EditorPreviewMock'

const OUTCOMES = ['Found 7 emphasized moments', 'Updated caption styling', 'Applied animation']

/** Static illustration only — no real command bar, no backend call, no fake agent execution. */
export function AiEditingSection() {
  return (
    <section id="ai-editing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <AnimatedSection className="mx-auto max-w-xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Edit your captions without touching the timeline.
        </h2>
      </AnimatedSection>

      <div className="mt-10 flex flex-col items-center gap-8 lg:flex-row lg:justify-center">
        <AnimatedSection className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">You</p>
          <p className="mt-1 text-sm text-foreground">"Make the important words more dramatic."</p>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">AI</p>
            {OUTCOMES.map((outcome) => (
              <div key={outcome} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                {outcome}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground italic">
            Illustration of the AI editing experience — not a live demo.
          </p>
        </AnimatedSection>

        <AnimatedSection style={{ transitionDelay: '150ms' }}>
          <EditorPreviewMock />
        </AnimatedSection>
      </div>
    </section>
  )
}
