import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

// The four real steps, phrased to match what the product genuinely does —
// no publishing or platform-integration claims (export produces a file to
// download, it doesn't post anywhere).
const STEPS = [
  { number: '01', title: 'Upload', description: 'Bring in the clip you want to caption.' },
  { number: '02', title: 'AI captions', description: 'Transcription and expressive captions are generated automatically.' },
  { number: '03', title: 'Edit with voice', description: 'Speak the change, the edit is applied.' },
  { number: '04', title: 'Export', description: 'Render the captioned video and download it, ready for short-form.' },
]

/**
 * Dark-theme port of ../HowItWorksSection.tsx (untouched) — rewritten from
 * 3 to the 4 real steps and restyled. The dashed connector rail + large
 * mono step numbers reuse the same diagrammatic language already used by
 * the "How It Works" nav dropdown (LandingNavbar.tsx's PanelContent), as
 * new, self-contained markup here rather than an import from that file.
 */
export function HowItWorksSection() {
  const motionSafe = useMotionSafe()

  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-line-subtle py-20 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <RevealItem motionSafe={motionSafe} className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">How it works</p>
        </RevealItem>
        <div className="relative mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-4">
          <div
            className="pointer-events-none absolute inset-x-0 top-[10px] hidden border-t border-dashed border-line-default sm:block"
            aria-hidden="true"
          />
          {STEPS.map((step, index) => (
            <RevealItem key={step.number} motionSafe={motionSafe} style={{ animationDelay: `${index * 90}ms` }}>
              <div className="relative bg-canvas">
                <p className="font-mono text-heading-md text-ink-tertiary">{step.number}</p>
                <p className="mt-2 text-body-sm font-medium uppercase tracking-wide text-ink-primary">{step.title}</p>
                <p className="mt-1 text-body-sm text-ink-secondary">{step.description}</p>
              </div>
            </RevealItem>
          ))}
        </div>
      </div>
    </section>
  )
}
