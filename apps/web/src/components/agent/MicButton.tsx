import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MicStatus } from '@/hooks/useAgentActivity'

interface MicButtonProps {
  status: MicStatus
  onToggle: () => void
}

/**
 * Round mic toggle with the design.md §7 listening pulse (coral ring, scale 1 → 1.4,
 * 1.6s; static under reduced motion) — the same treatment as the landing hero's mic.
 */
export function MicButton({ status, onToggle }: MicButtonProps) {
  const isListening = status === 'listening'

  return (
    <button
      type="button"
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={isListening}
      onClick={onToggle}
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        isListening
          ? 'border-signal bg-signal-dim text-signal'
          : 'border-hairline-strong bg-surface text-muted-foreground hover:text-foreground',
      )}
    >
      {isListening && <span aria-hidden className="listening-pulse absolute inset-0 rounded-full border border-signal" />}
      <Mic className="size-4" strokeWidth={1.5} />
    </button>
  )
}
