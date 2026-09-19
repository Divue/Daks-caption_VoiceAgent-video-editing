import { Loader2, Mic, MicOff, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MicStatus } from '@/hooks/useAgentActivity'

interface MicButtonProps {
  status: MicStatus
  onToggle: () => void
}

const LABELS: Record<MicStatus, string> = {
  idle: 'Start voice input',
  connecting: 'Connecting — click to cancel',
  listening: 'Stop voice input',
  processing: 'Stop voice input (the agent keeps working)',
  success: 'Start voice input',
  error: 'Voice input failed — try again',
  denied: 'Microphone blocked — enable it in your browser',
}

/**
 * The mic control, and — while the mic is open — the STOP control.
 *
 * It used to show the same microphone glyph whether you were idle or live, distinguished only by
 * a fill and a pulse, so nothing on screen said "click here to disconnect". While the mic is open
 * it now shows a stop square: the universal sign for "end this", readable at a glance and without
 * knowing the button is a toggle. It is never disabled — stopping the mic is the one control that
 * must always work, and mid-turn is exactly when someone reaches for it.
 */
export function MicButton({ status, onToggle }: MicButtonProps) {
  const isLive = status === 'listening' || status === 'processing'
  const isConnecting = status === 'connecting'
  const isDenied = status === 'denied'
  const isError = status === 'error'

  return (
    <div className="relative shrink-0">
      {isLive && <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />}
      <Button
        type="button"
        variant={isLive || isConnecting ? 'default' : isDenied || isError ? 'destructive' : 'outline'}
        size="icon"
        aria-label={LABELS[status]}
        title={LABELS[status]}
        aria-pressed={isLive || isConnecting}
        onClick={onToggle}
        className="relative rounded-full"
      >
        {isConnecting ? (
          <Loader2 className="animate-spin" />
        ) : isLive ? (
          <Square className="size-3.5 fill-current" />
        ) : isDenied ? (
          <MicOff />
        ) : (
          <Mic />
        )}
      </Button>
    </div>
  )
}
