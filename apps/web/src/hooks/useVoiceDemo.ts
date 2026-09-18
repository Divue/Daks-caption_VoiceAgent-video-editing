import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

/** listening -> heard (command recognised) -> applied (edit done), then the next example. */
export type VoicePhase = 'listening' | 'heard' | 'applied'

const PHASE_MS: Record<VoicePhase, number> = { listening: 1600, heard: 1700, applied: 2000 }
const NEXT_PHASE: Record<VoicePhase, VoicePhase> = { listening: 'heard', heard: 'applied', applied: 'listening' }

interface VoiceDemoState {
  phase: VoicePhase
  /** Index of the example currently being "spoken". */
  index: number
  playing: boolean
  reducedMotion: boolean
  /** Pause/resume; under reduced motion it steps to the next example instead. */
  toggle: () => void
  /** Play example `index` now: it is "heard", then applied, then the loop carries on from it. */
  jumpTo: (index: number) => void
}

/**
 * Drives the landing page's scripted voice-edit demo. Nothing is recorded or sent anywhere:
 * it is a timer cycling through `count` hand-written examples.
 *
 * Under prefers-reduced-motion it never auto-advances. It rests on a finished ("applied")
 * example, and `toggle` moves to the next one on demand.
 */
export function useVoiceDemo(count: number): VoiceDemoState {
  const reducedMotion = usePrefersReducedMotion()
  const [phase, setPhase] = useState<VoicePhase>('listening')
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const playing = !paused && !reducedMotion

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (phase === 'applied') setIndex((current) => (current + 1) % count)
      setPhase(NEXT_PHASE[phase])
    }, PHASE_MS[phase])
    return () => window.clearTimeout(timer)
  }, [playing, phase, count])

  function toggle() {
    if (reducedMotion) {
      setIndex((current) => (current + 1) % count)
      return
    }
    setPaused((current) => !current)
  }

  function jumpTo(next: number) {
    setIndex(next)
    setPhase('heard')
    setPaused(false)
  }

  return { phase: reducedMotion ? 'applied' : phase, index, playing, reducedMotion, toggle, jumpTo }
}
