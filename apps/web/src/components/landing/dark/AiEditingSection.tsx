import { CheckCircle2 } from 'lucide-react'
import { EditorPreviewMock } from './EditorPreviewMock'
import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

const OUTCOMES = ['Found 7 emphasized moments', 'Updated caption styling', 'Applied animation']

/**
 * Dark-theme port of ../AiEditingSection.tsx (untouched). Same structure,
 * same illustrative chat card, same real EditorPreviewMock rendering —
 * restyled to the hero's canvas/ink/signal tokens only, no content changes.
 */
export function AiEditingSection() {
  const motionSafe = useMotionSafe()

  return (
    <section
      id="voice-editing"
      className="mx-auto max-w-[1200px] scroll-mt-24 border-t border-line-subtle px-4 py-20 sm:px-8 sm:py-24"
    >
      <RevealItem motionSafe={motionSafe} className="mx-auto max-w-xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">AI editing</p>
        <h2 className="mt-3 font-display text-heading-lg text-ink-primary">
          Edit your captions without touching the timeline.
        </h2>
      </RevealItem>

      <div className="mt-12 flex flex-col items-center gap-10 lg:flex-row lg:justify-center">
        <RevealItem
          motionSafe={motionSafe}
          style={{ animationDelay: '80ms' }}
          className="w-full max-w-sm rounded-xl border border-line-subtle bg-surface/60 p-5 backdrop-blur-md"
        >
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-tertiary">You</p>
          <p className="mt-1.5 text-body-sm text-ink-primary">"Make the important words more dramatic."</p>
          <div className="mt-4 flex flex-col gap-2 border-t border-line-subtle pt-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-tertiary">AI</p>
            {OUTCOMES.map((outcome) => (
              <div key={outcome} className="flex items-center gap-2 text-body-sm text-ink-secondary">
                <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                {outcome}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] italic text-ink-tertiary">
            Illustration of the AI editing experience — not a live demo.
          </p>
        </RevealItem>

        <RevealItem motionSafe={motionSafe} style={{ animationDelay: '150ms' }}>
          <EditorPreviewMock />
        </RevealItem>
      </div>
    </section>
  )
}
