import { useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { MicButton } from './MicButton'

const SUGGESTIONS = [
  'Make this word more dramatic',
  'Highlight key moments',
  'Add a zoom effect',
  'Change to karaoke style',
]

interface AgentCommandBarProps {
  micStatus: MicStatus
  onToggleMic: () => void
  onSubmitCommand: (command: string) => void
}

export function AgentCommandBar({ micStatus, onToggleMic, onSubmitCommand }: AgentCommandBarProps) {
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmitCommand(trimmed)
    setValue('')
  }

  return (
    <div className="shrink-0 border-t bg-background px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <MicButton status={micStatus} onToggle={onToggleMic} />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask the editor to do something..."
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!value.trim()} aria-label="Send command">
          <Send />
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setValue(suggestion)}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-[0.98]"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
