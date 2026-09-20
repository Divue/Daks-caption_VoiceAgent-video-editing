import { PRESETS, Word } from '@captions/shared'
import type { PresetId, Style } from '@captions/shared'
import realReel from '@captions/shared/fixtures/real_reel-project.json'
import { CaptionWords, SectionHeading, useElementWidth, useLoopClock } from './caption-demo'
import { RevealItem } from './dark/RevealItem'
import { useMotionSafe } from './dark/useMotionSafe'

/*
  "Just talk" — a replay of the voice-editing flow. The tool names are the agent's real tools
  (services/api/app/agent/tools: find_words, update_caption_style, apply_preset) and each step
  applies the same patch shape the agent returns (a per-word Style patch, or a preset switch) to
  real transcript words, drawn by the editor's resolver. It is a scripted replay, not a live
  agent call, and is labelled as one.
*/

const LINE = Word.array().parse(realReel.words.slice(4, 8))
const LINE_END = LINE[LINE.length - 1].endMs

interface Step {
  said: string
  calls: [tool: string, args: string][]
  result: string
  /** Style patches keyed by word text, or a preset switch. */
  patch: { words?: Record<string, Partial<Style>>; presetId?: PresetId }
}

const STEPS: Step[] = [
  {
    said: 'make saaaal pink and bigger',
    calls: [
      ['find_words', '"saaaal"'],
      ['update_caption_style', 'color #FF4FA3 · fontSize 170'],
    ],
    result: '1 word updated',
    patch: { words: { saaaal: { color: '#FF4FA3', fontSize: 170 } } },
  },
  {
    said: 'shake birthday a little',
    calls: [
      ['find_words', '"birthday"'],
      ['update_caption_style', 'shake 4'],
    ],
    result: '1 word updated',
    patch: { words: { birthday: { shake: 4 } } },
  },
  {
    said: 'now switch to Dhamaka',
    calls: [['apply_preset', 'dhamaka']],
    result: 'preset applied · your word edits kept',
    patch: { presetId: 'dhamaka' },
  },
]

const TYPE_MS = 45
const THINK_MS = 350
const CALL_MS = 550
const HOLD_MS = 2600

// Each step's timeline: type the command, show the calls one by one, apply, hold.
const TIMINGS = STEPS.reduce<{ start: number; typed: number; applied: number; end: number }[]>((acc, step) => {
  const start = acc.length ? acc[acc.length - 1].end : 0
  const typed = start + step.said.length * TYPE_MS
  const applied = typed + THINK_MS + step.calls.length * CALL_MS
  acc.push({ start, typed, applied, end: applied + HOLD_MS })
  return acc
}, [])
const TOTAL = TIMINGS[TIMINGS.length - 1].end

export function TalkToEditSection() {
  const motionSafe = useMotionSafe()
  const { ref: clockRef, timeMs: t } = useLoopClock(0, TOTAL, 0, motionSafe)
  const { ref: frameRef, width } = useElementWidth<HTMLDivElement>()

  const current = Math.max(0, TIMINGS.findIndex((tm) => t < tm.end))
  const stepIndex = t >= TOTAL ? STEPS.length - 1 : current
  const timing = TIMINGS[stepIndex]
  const appliedCount = STEPS.filter((_, i) => t >= TIMINGS[i].applied).length

  // Fold every applied patch, in order, onto the real words.
  let presetId: PresetId = 'rangmanch'
  const styles: Record<string, Partial<Style>> = {}
  STEPS.slice(0, appliedCount).forEach((step) => {
    if (step.patch.presetId) presetId = step.patch.presetId
    Object.entries(step.patch.words ?? {}).forEach(([text, style]) => {
      styles[text] = { ...styles[text], ...style }
    })
  })
  const words = LINE.map((w) => (styles[w.text] ? { ...w, style: { ...w.style, ...styles[w.text] } } : w))

  const step = STEPS[stepIndex]
  const typedChars = Math.min(step.said.length, Math.max(0, Math.floor((t - timing.start) / TYPE_MS)))
  const listening = t < timing.typed
  const visibleCalls = step.calls.filter((_, i) => t >= timing.typed + THINK_MS + i * CALL_MS)
  const applied = t >= timing.applied

  return (
    <section id="voice-editing" className="scroll-mt-20 border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Edit by voice" lines={['You don’t need to edit.', 'Just talk.']} motionSafe={motionSafe}>
          Say what you want changed. An agent reads your project, picks the edit, and every change is checked
          against the project schema before it lands, so talking can’t break your video.
        </SectionHeading>

        {/* Three columns left to right: editor screenshot (~40%), RANGMANCH caption preview
            (~32%), agent-command chat panel (~22%, floats slightly above the other two). Mobile:
            stacked, screenshot/RANGMANCH/chat. Tablet: screenshot full width on top, RANGMANCH and
            the chat panel side by side below (triggered at `sm`/640px, not `md`/768px — a classic,
            non-overlay scrollbar eats ~15-17px of CSS viewport width, so a window resized to
            exactly 768px can measure just under the `md` breakpoint; `sm` clears that with margin
            at any real 768px width). Desktop (lg, 1024px+): the tablet row's wrapper becomes
            `lg:contents`, so RANGMANCH and the chat panel become independent flex siblings of the
            screenshot instead of a stacked pair — each gets its own `flex-[n]` ratio (40:32:22),
            which is `flex-grow`+`flex-basis:0%`, so the row can never overflow regardless of
            container width. */}
        <div ref={clockRef} className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
          {/* Column 1 — editor screenshot, the section's hero visual. Never distorted: intrinsic
              1600x825 (1.94:1), full width, height auto so its own aspect ratio is preserved. Its
              own RevealItem, like the other two columns, so it plays its own down-scroll entrance
              instead of appearing statically. */}
          <RevealItem motionSafe={motionSafe} size="lg" className="w-full lg:flex-[40] lg:self-start">
            <img
              src="/editor-screenshot.jpg"
              alt="The Expressive Captions editor interface, showing the video preview with a speaker on camera, the caption list on the left, style presets on the right, and the timeline with word-level caption blocks along the bottom"
              className="w-full rounded-2xl border border-line-subtle shadow-soft"
            />
          </RevealItem>

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-6 lg:contents">
            {/* Column 2 — the birthday-line caption-preview frame, constrained to a portrait 3:4
                proportion (not its old 9:16) so its overall area reads close to the screenshot's
                instead of dominating the row. Sized by width only (max-width on mobile/tablet, the
                flex ratio at lg), never a fixed height. */}
            <RevealItem
              motionSafe={motionSafe}
              size="lg"
              style={{ animationDelay: '90ms' }}
              className="mx-auto w-full max-w-[280px] sm:mx-0 sm:w-1/2 sm:max-w-none lg:w-auto lg:flex-[32] lg:self-start"
            >
              <div
                ref={frameRef}
                className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border shadow-soft transition-colors duration-500 ${applied ? 'border-signal/40' : 'border-line-subtle'}`}
                style={{
                  background:
                    'radial-gradient(70% 45% at 50% 22%, rgba(139, 152, 240, 0.16), transparent 70%), radial-gradient(90% 60% at 50% 105%, rgba(255, 107, 74, 0.12), transparent 70%), linear-gradient(180deg, #17171c, #0c0c0e)',
                }}
              >
                <div className="absolute left-3 top-3 rounded-full border border-line-subtle bg-canvas/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-secondary backdrop-blur-sm">
                  {PRESETS[presetId].name}
                </div>
                <CaptionWords
                  words={words}
                  preset={PRESETS[presetId]}
                  settings={realReel.settings}
                  width={width}
                  timeMs={LINE_END}
                  motionSafe={motionSafe}
                  shakeAlways
                />
              </div>
            </RevealItem>

            {/* Column 3 — agent-command replay. Copy, states and timing are untouched; the `lg:`
                overrides only scale padding/type down further, since this column is now roughly
                half the width panel A had when it was stacked with panel B (phase 09). `lg:-mt-10`
                floats it above columns 1/2's top line, reading as a small panel at the section's
                top-right corner rather than a third equal panel. */}
            <RevealItem
              motionSafe={motionSafe}
              size="lg"
              style={{ animationDelay: '180ms' }}
              className="w-full sm:w-1/2 lg:w-auto lg:flex-[22] lg:-mt-10 lg:self-start"
            >
              <div className="rounded-2xl border border-line-subtle bg-surface/50 p-4 shadow-soft backdrop-blur-sm sm:p-5 lg:p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-tertiary lg:text-[9px]">
                    <span className="relative flex h-2 w-2">
                      {motionSafe && listening && <span className="absolute inset-0 rounded-full bg-[#8B98F0]/60 animate-pulse-ring" />}
                      <span className={`relative h-2 w-2 rounded-full ${listening ? 'bg-[#8B98F0]' : 'bg-line-default'}`} />
                    </span>
                    {listening ? 'Listening' : applied ? 'Done' : 'Working'}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary lg:text-[9px]">
                    {stepIndex + 1} / {STEPS.length}
                  </p>
                </div>

                {/* Earlier commands, faded */}
                <ul className="mt-4 min-h-[2.5rem] space-y-1.5 lg:mt-2 lg:min-h-[1.5rem]" aria-hidden="true">
                  {STEPS.slice(0, stepIndex).map((s) => (
                    <li key={s.said} className="flex items-center gap-2 text-body-sm text-ink-tertiary lg:text-[10px]">
                      <span className="text-signal/70">✓</span> “{s.said}”
                    </li>
                  ))}
                </ul>

                <p className="mt-3 min-h-[2.2em] font-display text-[clamp(1.15rem,2.4vw,1.5rem)] font-semibold leading-tight tracking-tight text-ink-primary lg:mt-2 lg:text-[clamp(0.8rem,1.1vw,0.95rem)]">
                  “{step.said.slice(0, typedChars)}
                  {listening && motionSafe && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] animate-pulse bg-[#8B98F0]" />}
                  {!listening && '”'}
                </p>

                <div className="mt-4 min-h-[6rem] space-y-1.5 font-mono text-[11px] lg:mt-2 lg:min-h-[3.5rem] lg:space-y-1 lg:text-[9px]">
                  {visibleCalls.map(([tool, args]) => (
                    <div key={tool + args} className={`flex flex-wrap items-baseline gap-x-3 ${motionSafe ? 'animate-fade-up' : ''}`}>
                      <span className="text-ink-tertiary">→</span>
                      <span className="text-[#8B98F0]">{tool}</span>
                      <span className="text-ink-secondary">{args}</span>
                    </div>
                  ))}
                  {applied && (
                    <div className={`flex items-baseline gap-3 ${motionSafe ? 'animate-fade-up' : ''}`}>
                      <span className="text-signal">✓</span>
                      <span className="text-ink-primary">validated · {step.result}</span>
                    </div>
                  )}
                </div>

                <p className="mt-4 border-t border-line-subtle pt-3 text-body-sm text-ink-tertiary lg:mt-2 lg:pt-2 lg:text-[10px]">
                  A replay of the flow, using the agent’s real tool names and patch shapes on real transcript words.
                </p>
              </div>
            </RevealItem>
          </div>
        </div>
      </div>
    </section>
  )
}
