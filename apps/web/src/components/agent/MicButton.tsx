import { Loader2, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MicStatus } from '@/hooks/useAgentActivity'

interface MicButtonProps {
  status: MicStatus
  onToggle: () => void
}

const LABELS: Record<MicStatus, string> = {
  idle: 'Start voice input',
  listening: 'Stop voice input',
  processing: 'Working on what you said',
  success: 'Start voice input',
  error: 'Voice input failed — try again',
  denied: 'Microphone blocked — enable it in your browser',
}

export function MicButton({ status, onToggle }: MicButtonProps) {
  const isListening = status === 'listening'
  const isProcessing = status === 'processing'
  // A blocked mic is a state the user has to fix in the browser, so it stays visible rather than
  // collapsing back to "idle" and inviting an identical click that will fail the same way.
  const isDenied = status === 'denied'
  const isError = status === 'error'

  return (
    <div className="relative shrink-0">
      {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />}
      <Button
        type="button"
        variant={isListening ? 'default' : isDenied || isError ? 'destructive' : 'outline'}
        size="icon"
        aria-label={LABELS[status]}
        title={LABELS[status]}
        aria-pressed={isListening}
        disabled={isProcessing}
        onClick={onToggle}
        className={cn('relative rounded-full', isListening && 'animate-pulse')}
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : isDenied ? <MicOff /> : <Mic />}
      </Button>
    </div>
  )
}
