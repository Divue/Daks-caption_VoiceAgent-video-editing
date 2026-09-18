import { useState } from 'react'
import type { FormEvent } from 'react'
import { Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { MicButton } from './MicButton'

/**
 * Things this app can actually do. Suggesting a feature we do not have is the same sin as drawing
 * a timeline for an editor we are not building (audit 16 §1, §2.16), so every chip here maps to a
 * real tool the agent can call.
 */
const SUGGESTIONS = [
  'Make that line angry',
  'Emphasise the loudest word in each line',
  'Switch to the Chamak preset',
  'Push the captions 200ms later',
]

interface AgentCommandBarProps {
  micStatus: MicStatus
  busy: boolean
  /** The command currently running, echoed back so the user sees what was heard. */
  pendingCommand: string | null
  /** Live, not-yet-final speech. Shown, never submitted — an interim guess is not a command. */
  interimTranscript: string | null
  onToggleMic: () => void
  onSubmitCommand: (command: string) => void
  onCancel: () => void
}

export function AgentCommandBar({
  micStatus,
  busy,
  pendingCommand,
  interimTranscript,
  onToggleMic,
  onSubmitCommand,
  onCancel,
}: AgentCommandBarProps) {
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmitCommand(trimmed)
    setValue('')
  }

  const status = busy
    ? { text: pendingCommand ?? 'Working…', tone: 'text-muted-foreground' as const }
    : interimTranscript
      ? { text: interimTranscript, tone: 'text-muted-foreground/70' as const }
      : micStatus === 'listening'
        ? { text: 'Listening…', tone: 'text-primary' as const }
        : micStatus === 'denied'
          ? {
              text: 'Microphone blocked. Allow it in your browser to use voice.',
              tone: 'text-destructive' as const,
            }
          : null

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
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-input bg-background py-1.5 pr-1.5 pl-1.5 transition-colors focus-within:border-primary/60',
            micStatus === 'listening' && 'border-primary/60',
          )}
        >
          <MicButton status={micStatus} onToggle={onToggleMic} />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={busy ? 'Working on it…' : 'Ask the editor to do something…'}
            className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onCancel}
              aria-label="Cancel command"
              className="shrink-0"
            >
              <X />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              disabled={!value.trim()}
              aria-label="Send command"
              className="shrink-0"
            >
              <Send />
            </Button>
          )}
        </form>

        {/* One line that is either what we are hearing or what we are doing — never both, and
            never a fabricated "thinking" message when nothing is running. */}
        {status ? (
          <p className={cn('truncate px-1 text-xs', status.tone)} aria-live="polite">
            {status.text}
          </p>
        ) : (
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
        )}
      </div>
    </div>
  )
}
