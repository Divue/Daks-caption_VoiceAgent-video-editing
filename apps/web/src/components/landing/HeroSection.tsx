import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { Check, Mic, MicOff, SkipForward } from 'lucide-react'
import { CAPTION_EFFECTS } from '@/components/captions/caption-effects'
import type { CaptionEffect } from '@/components/captions/caption-effects'
import { useScrollFrame } from '@/hooks/useScrollFrame'
import { useVoiceDemo } from '@/hooks/useVoiceDemo'
import type { VoicePhase } from '@/hooks/useVoiceDemo'
import { cn } from '@/lib/utils'
import { EffectChip } from './EffectChip'
import { EffectConnectors } from './EffectConnectors'
import { HeroGridBackdrop } from './HeroGridBackdrop'
import { SectionSeam } from './SectionSeam'
import { VoiceOrb } from './VoiceOrb'

/** Orb speaking energy per phase: calm while listening, rippling while the command is heard. */
const ENERGY: Record<VoicePhase, number> = { listening: 0.25, heard: 1, applied: 0.35 }

function statusText(phase: VoicePhase, effect: CaptionEffect): string {
  if (phase === 'listening') return 'Listening…'
  if (phase === 'heard') return 'Heard'
  return `Applied · ${effect.label}`
}

/**
 * First viewport: the voice orb. Four caption effects orbit it on dashed connectors, and a
 * scripted loop plays a Hinglish command, lights the effect it asks for and marks it applied.
 * It is a demo: no microphone is opened and nothing is sent anywhere (see useVoiceDemo).
 *
 * Desktop: chips and connectors sit on a 16:9 stage around the orb. Mobile: the stage
 * collapses, the orb stacks above a 2×2 chip grid and the connectors are hidden. Clicking a
 * chip plays that effect's example.
 *
 * First load: the orb scales up out of the dark, then the chips pop in one by one, the
 * connectors fade in and the status/mic rise last (CSS `hero-*-in` classes, `both` fill so
 * nothing flashes before its turn). The entrances animate `transform`, which composes with
 * the Tailwind `translate`/`scale` positioning and hover lifts on the same elements.
 *
 * Scroll exit: as the hero scrolls away its content drifts up, shrinks to 92% and fades, so
 * the page reads as moving *through* the scene. The styles are written straight to the DOM
 * from the shared scroll loop; it is skipped under reduced motion.
 */
export function HeroSection() {
  const { phase, index, playing, reducedMotion, toggle, jumpTo } = useVoiceDemo(CAPTION_EFFECTS.length)
  const effect = CAPTION_EFFECTS[index]
  const activeId = phase === 'applied' ? effect.id : null
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useScrollFrame(() => {
    const section = sectionRef.current
    const content = contentRef.current
    if (!section || !content) return
    const rect = section.getBoundingClientRect()
    const progress = Math.min(Math.max(-rect.top / rect.height, 0), 1)
    return () => {
      content.style.transform = `translate3d(0, ${(-60 * progress).toFixed(1)}px, 0) scale(${(1 - 0.08 * progress).toFixed(4)})`
      content.style.opacity = (1 - 0.85 * progress).toFixed(3)
    }
  }, !reducedMotion)

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-label="Voice editing demo"
      className="relative isolate flex min-h-svh flex-col overflow-hidden"
    >
      <HeroGridBackdrop />

      <div
        ref={contentRef}
        className="mx-auto flex w-full max-w-300 flex-1 origin-top flex-col items-center justify-center px-4 pt-24 pb-8 will-change-transform sm:px-6"
      >
        <div className="relative w-full md:mx-auto md:aspect-video md:w-[min(100%,calc((100svh-340px)*16/9))]">
          <EffectConnectors
            effects={CAPTION_EFFECTS}
            activeId={activeId}
            className="fade-in hidden md:block"
            style={{ animationDelay: '850ms', animationDuration: '900ms' }}
          />

          <div className="relative mx-auto w-[min(76vw,320px)] md:absolute md:top-[45%] md:left-1/2 md:w-[30%] md:-translate-x-1/2 md:-translate-y-1/2">
            <VoiceOrb energy={ENERGY[phase]} tint={activeId ? effect.color : null} className="hero-orb-in" />
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-3 md:contents">
            {CAPTION_EFFECTS.map((item, itemIndex) => (
              <li
                key={item.id}
                className="flex justify-center md:absolute md:top-(--y) md:left-(--x) md:-translate-x-1/2 md:-translate-y-1/2"
                style={{ '--x': `${item.chip.x}%`, '--y': `${item.chip.y}%` } as CSSProperties}
              >
                <EffectChip
                  effect={item}
                  active={item.id === activeId}
                  onClick={() => jumpTo(itemIndex)}
                  className="hero-pop-in max-md:w-full"
                  style={{ animationDelay: `${400 + itemIndex * 110}ms` }}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-pop-in mt-8 flex flex-col items-center gap-4 md:mt-4" style={{ animationDelay: '950ms' }}>
          <CommandChip phase={phase} command={effect.command} />

          <p className="font-mono text-[13px] tracking-[0.2em] text-faint uppercase">{statusText(phase, effect)}</p>

          <button
            type="button"
            onClick={toggle}
            aria-label={reducedMotion ? 'Show next example' : playing ? 'Pause demo' : 'Play demo'}
            className="relative flex size-16 items-center justify-center rounded-full border border-hairline-strong bg-surface/70 text-muted-foreground backdrop-blur transition-colors duration-150 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {playing && phase === 'listening' && (
              <span aria-hidden className="listening-pulse absolute inset-0 rounded-full border border-signal" />
            )}
            {reducedMotion ? (
              <SkipForward className="size-5" strokeWidth={1.5} />
            ) : playing ? (
              <Mic className="size-5" strokeWidth={1.5} />
            ) : (
              <MicOff className="size-5" strokeWidth={1.5} />
            )}
          </button>

          <p className="font-mono text-[11px] text-faint">
            {reducedMotion ? 'Demo · tap for the next example' : 'Demo · nothing is recorded'}
          </p>
        </div>
      </div>

      <SectionSeam />
    </section>
  )
}

/**
 * The recognised command, design.md §7: mono text in a precision-dim pill, turning to a
 * success state once applied. Height is reserved so the layout never jumps between phases.
 */
function CommandChip({ phase, command }: { phase: VoicePhase; command: string }) {
  return (
    <div className="flex h-9 items-center">
      {phase !== 'listening' && (
        <p
          key={`${command}-${phase}`}
          className={cn(
            'fade-up flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[13px] leading-[1.4]',
            phase === 'heard'
              ? 'border-precision/30 bg-precision-dim text-precision'
              : 'border-success/30 bg-success/10 text-success',
          )}
        >
          {phase === 'applied' && <Check className="size-3.5" strokeWidth={2} />}“{command}”
        </p>
      )}
    </div>
  )
}
