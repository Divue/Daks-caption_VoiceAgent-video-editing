import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MicStatus } from '@/hooks/useAgentActivity'

interface MicButtonProps {
  status: MicStatus
  onToggle: () => void
}

export function MicButton({ status, onToggle }: MicButtonProps) {
  const isListening = status === 'listening'

  return (
    <div className="relative shrink-0">
      {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />}
      <Button
        type="button"
        variant={isListening ? 'default' : 'outline'}
        size="icon"
        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
        aria-pressed={isListening}
        onClick={onToggle}
        className={cn('relative rounded-full', isListening && 'animate-pulse')}
      >
        <Mic />
      </Button>
    </div>
  )
}
