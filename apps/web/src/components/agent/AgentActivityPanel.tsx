import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Loader2, Sparkles, Undo2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentEntryStatus, AgentLogEntry, MicStatus } from '@/hooks/useAgentActivity'

interface AgentActivityPanelProps {
  entries: AgentLogEntry[]
  busy: boolean
  micStatus: MicStatus
  /** Dispatches `steps` UNDOs — the same undo the toolbar and Ctrl+Z use. */
  onUndoTurn: (steps: number) => void
}

const ICONS: Record<AgentEntryStatus, typeof CheckCircle2> = {
  info: Circle,
  pending: Loader2,
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
}

const ICON_TONE: Record<AgentEntryStatus, string> = {
  info: 'text-muted-foreground/60',
  pending: 'text-primary animate-spin',
  ok: 'text-emerald-600',
  // An "I can't do that" is not a failure and not a success. Amber says so without alarming.
  warn: 'text-amber-600',
  error: 'text-destructive',
}

function headline(busy: boolean, micStatus: MicStatus): string {
  if (micStatus === 'listening') return 'Listening…'
  if (micStatus === 'denied') return 'Microphone blocked'
  if (busy || micStatus === 'processing') return 'Working…'
  return 'Ready to help'
}

export function AgentActivityPanel({ entries, busy, micStatus, onUndoTurn }: AgentActivityPanelProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  // A turn appends while the user is watching, so the newest entry should never be below the fold.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className={cn('size-4 text-primary', busy && 'animate-pulse')} />
        <div>
          <p className="text-sm font-semibold text-foreground">Agent</p>
          <p className="text-xs text-muted-foreground">{headline(busy, micStatus)}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent activity</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your AI editing activity will appear here.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const Icon = ICONS[entry.status]
              return (
                <li
                  key={entry.id}
                  className="flex animate-in items-start gap-2 fade-in-0 slide-in-from-bottom-1 text-sm"
                >
                  <Icon className={cn('mt-0.5 size-3.5 shrink-0', ICON_TONE[entry.status])} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* Agent text and word text are untrusted strings — rendered as text nodes,
                        never as markup. A video's transcript can say anything. */}
                    <span
                      className={cn(
                        'text-foreground',
                        entry.status === 'pending' && 'text-muted-foreground italic',
                      )}
                    >
                      {entry.message}
                    </span>

                    {entry.lines && entry.lines.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {entry.lines.map((line, index) => (
                          <li key={index} className="text-xs text-muted-foreground">
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}

                    {entry.trace && entry.trace.length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-xs text-muted-foreground/70 transition-colors hover:text-foreground">
                          <span className="group-open:hidden">Show steps</span>
                          <span className="hidden group-open:inline">Hide steps</span>
                        </summary>
                        <ol className="mt-1 flex flex-col gap-0.5 border-l border-border/60 pl-2">
                          {entry.trace.map((step, index) => (
                            <li key={index} className="text-xs text-muted-foreground/80">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}

                    {entry.undoSteps !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="-ml-1 w-fit text-muted-foreground"
                        onClick={() => onUndoTurn(entry.undoSteps ?? 1)}
                      >
                        <Undo2 />
                        Undo that
                      </Button>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              )
            })}
            <div ref={endRef} />
          </ul>
        )}
      </div>
    </div>
  )
}
