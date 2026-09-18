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
    <div className="shrink-0 border-t border-border/60 bg-card px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {/*
          Voice is the product's headline interaction, so the bar reads as one object — mic,
          field and send inside a single bordered shell that lights up on focus — rather than as
          three separate controls sharing a row.
        */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-1.5 rounded-lg border border-input bg-background py-1.5 pr-1.5 pl-1.5 transition-colors focus-within:border-primary/60"
        >
          <MicButton status={micStatus} onToggle={onToggleMic} />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask the editor to do something…"
            className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!value.trim()}
            aria-label="Send command"
            className="shrink-0"
          >
            <Send />
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1 text-muted-foreground/70">Try</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setValue(suggestion)}
              className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-[0.98]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
