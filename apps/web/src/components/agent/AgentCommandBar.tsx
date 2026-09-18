import { useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { MicButton } from './MicButton'

/** Hinglish examples of edits the agent's tools can express (no zoom: there is no tool for it). */
const SUGGESTIONS = [
  'bekaar ko angry bana do',
  'saare captions MrBeast style mein kar do',
  'hello ko thoda lamba khicho',
  'sunta wala word bada kar do',
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
    <div className="shrink-0 border-t border-hairline bg-surface/70 px-4 py-3 backdrop-blur-xl">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <MicButton status={micStatus} onToggle={onToggleMic} />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={micStatus === 'listening' ? 'Listening…' : 'Bolo ya type karo — e.g. “bekaar ko angry bana do”'}
          aria-label="Command"
          className="h-10 flex-1 rounded-full px-4 font-mono text-[13px]"
        />
        <Button type="submit" size="icon" disabled={!value.trim()} aria-label="Send command" className="size-10 rounded-full">
          <Send />
        </Button>
      </form>
      <div className="mt-2 flex gap-2 overflow-x-auto pl-12 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setValue(suggestion)}
            className="shrink-0 rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:border-precision/40 hover:bg-precision-dim hover:text-precision"
          >
            “{suggestion}”
          </button>
        ))}
      </div>
    </div>
  )
}
