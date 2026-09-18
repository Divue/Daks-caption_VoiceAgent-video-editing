import { useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DEFAULT_CHIPS, DEMO_PROMPTS, isRefusalPrompt } from '@/lib/demo-prompts'
import type { MicStatus } from '@/hooks/useAgentActivity'
import { MicButton } from './MicButton'

/**
 * The chips are the eleven prompts from `lib/demo-prompts.ts`, which mirror the ones
 * `services/api/scripts/agent_demo.py` runs against the real agent. Two rules hold here:
 * suggesting a feature we do not have is the same sin as drawing a timeline for an editor we are
 * not building (audit 16 §1, §2.16), and a reworded prompt is an untested prompt — so a chip
 * inserts the tested string verbatim, and the one prompt the agent is meant to REFUSE is labelled
 * as a refusal instead of being dressed up as a capability.
 */
const REFUSAL_LABEL = "won't work — on purpose"

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
  const [showAll, setShowAll] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmitCommand(trimmed)
    setValue('')
    setShowAll(false)
  }

  /** A chip loads the command; it never sends it. The presenter presses enter themselves. */
  function pick(command: string) {
    setValue(command)
    setShowAll(false)
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
          /* Three chips inline — the bar is the headline control and must stay one line tall.
             The other eight (including the refusal) are one click away in a list that closes as
             soon as a command is loaded. */
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1 text-muted-foreground/70">Try</span>
              {DEFAULT_CHIPS.map((prompt) => (
                <button
                  key={prompt.n}
                  type="button"
                  onClick={() => pick(prompt.command)}
                  title={prompt.title}
                  className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-[0.98]"
                >
                  {prompt.command}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowAll((open) => !open)}
                aria-expanded={showAll}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/80 transition-colors hover:text-foreground"
              >
                {showAll ? 'Fewer' : `All ${DEMO_PROMPTS.length}`}
                <ChevronDown
                  className={cn('size-3 transition-transform', showAll && 'rotate-180')}
                />
              </button>
            </div>

            {showAll ? (
              <ul className="max-h-44 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-1">
                {DEMO_PROMPTS.map((prompt) => {
                  const refusal = isRefusalPrompt(prompt)
                  return (
                    <li key={prompt.n}>
                      <button
                        type="button"
                        onClick={() => pick(prompt.command)}
                        className="flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted/60"
                      >
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground/50">
                          {prompt.n}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate',
                            refusal ? 'text-muted-foreground/70' : 'text-foreground/90',
                          )}
                        >
                          {prompt.command}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[11px]',
                            refusal ? 'text-muted-foreground' : 'text-muted-foreground/60',
                          )}
                        >
                          {refusal ? REFUSAL_LABEL : prompt.title}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
