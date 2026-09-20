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
    <section id="edit-by-voice" className="scroll-mt-20 border-t border-line-subtle py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeading eyebrow="Edit by voice" lines={['You don’t need to edit.', 'Just talk.']} motionSafe={motionSafe}>
          Say what you want changed. An agent reads your project, picks the edit, and every change is checked
          against the project schema before it lands, so talking can’t break your video.
        </SectionHeading>

        {/* Composition: screenshot left/wider (flex-[65]), and a right column (flex-[25]) holding
            the chat panel above the RANGMANCH preview card.

            The chat panel used to be `absolute right-0 top-0` inside this right column with the
            card filling that same column at `w-full` — i.e. positioned against the card's own box —
            and lifted by `-translate-y-1/4`. That quarter is a quarter of the PANEL's height
            (~210px at lg), so ~158px of it stayed on top of the card, and no offset fixes that:
            `absolute` takes the panel out of flow, so the card never yields the space to move into.
            Clearing the card by offset alone means roughly `-translate-y-full`, which lifts the
            panel into the section heading; going right instead overflows the 1200px container.

            So the two are now explicit grid ROWS of the right column, not a float over a box. The
            panel is row 1 (`lg:row-start-1`) and the card is row 2 (`lg:row-start-2`) — DOM order
            stays card-then-panel for the smaller breakpoints, and `row-start` re-orders them only
            at lg. Nothing is absolutely positioned any more, so the rows cannot intersect at any
            width: the grid gap is the separation, by construction rather than by tuning.

            The diagonal the old float was reaching for survives, built from widths instead of
            offsets: the panel is `lg:w-[86%] lg:justify-self-end`, so its top-right corner IS the
            right column's top-right corner (and so the whole two-column area's), while the card
            below stays full width and keeps its `lg:-ml-4` nudge past the column's left edge.
            Panel up-and-right, card down-and-left.

            Mobile: stacked, screenshot/RANGMANCH/chat. Tablet: screenshot full width on top,
            RANGMANCH and the chat panel side by side below (triggered at `sm`/640px, not
            `md`/768px — a classic, non-overlay scrollbar eats ~15-17px of CSS viewport width, so a
            window resized to exactly 768px can measure just under the `md` breakpoint; `sm` clears
            that with margin at any real 768px width). */}
        <div ref={clockRef} className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
          {/* Column 1 — editor screenshot, the section's hero visual. Never distorted: intrinsic
              2559x1344 (1.904:1), full width, height auto so its own aspect ratio is preserved. Its
              own RevealItem, like the other two columns, so it plays its own down-scroll entrance
              instead of appearing statically. */}
          <RevealItem motionSafe={motionSafe} size="lg" className="w-full lg:flex-[65] lg:self-start">
            <img
              src="/editor-screenshot.png"
              alt="The Expressive Captions editor interface, showing the caption list with detected tone labels, the video preview, the style panel, the timeline, and the &ldquo;Ask the editor to do something&rdquo; command bar"
              className="w-full rounded-2xl border border-line-subtle shadow-soft"
            />
          </RevealItem>

          {/* Wrapper for RANGMANCH + the chat panel. <sm: stacked. sm–<lg (tablet): side by side
              below the screenshot. lg+ (desktop): a one-column grid of two auto-height rows —
              chat panel, then RANGMANCH — with `lg:gap-6` as the guaranteed separation between
              them. No `relative` any more: nothing inside is absolutely positioned. */}
          <div className="flex flex-col gap-8 sm:flex-row sm:gap-6 lg:grid lg:grid-cols-1 lg:grid-rows-[auto_auto] lg:gap-6 lg:flex-[25] lg:self-start">
            {/* RANGMANCH — the birthday-line caption-preview frame, a sensible portrait 3:4
                proportion. Sized by width only (max-width on mobile/tablet, the wrapper's own
                flex-[25] share at lg), never a fixed height — its height still follows the width via
                the aspect-ratio, it's just no longer given an oversized width to follow.
                `lg:row-start-2` puts it in the second grid row, under the chat panel; `lg:-ml-4`
                is the leftward nudge that gives the composition its diagonal. The old `lg:mt-4` is
                gone — the grid's own `lg:gap-6` owns the spacing above it now. */}
            <RevealItem
              motionSafe={motionSafe}
              size="lg"
              style={{ animationDelay: '90ms' }}
              className="mx-auto w-full max-w-[280px] sm:mx-0 sm:w-1/2 sm:max-w-none lg:row-start-2 lg:mx-0 lg:w-full lg:max-w-none lg:-ml-4"
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

            {/* Agent-command replay — the smallest of the three, and copy/states/timing are
                untouched. Below `lg` it's a normal-flow column (half-width on tablet, full width on
                mobile). At `lg`+ it is the FIRST grid row of the right column: `lg:justify-self-end`
                puts its right edge on the column's right edge — which is the right edge of the whole
                two-column area — and `lg:w-[86%]` leaves its left edge inset from the card below it,
                so the pair still reads as a diagonal. It no longer floats over anything. */}
            <div className="w-full sm:w-1/2 lg:row-start-1 lg:w-[86%] lg:justify-self-end">
              <RevealItem motionSafe={motionSafe} size="lg" style={{ animationDelay: '180ms' }}>
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
      </div>
    </section>
  )
}
