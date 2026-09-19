import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircleQuestion,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react'
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

/**
 * One treatment per status, all distinct. `info` has no icon of its own — it is not a turn, it
 * is a note the editor made about itself ("Transcript loaded"), and it is drawn as a margin line
 * rather than as a result.
 */
const ICONS: Record<Exclude<AgentEntryStatus, 'info'>, typeof CheckCircle2> = {
  pending: Loader2,
  question: MessageCircleQuestion,
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
}

const ICON_TONE: Record<Exclude<AgentEntryStatus, 'info'>, string> = {
  pending: 'text-primary animate-spin',
  // A question is neither success nor failure, and adds no hue: full-strength neutral, which
  // reads as live against the muted body text without spending the orange budget (audit 16 §3.3).
  question: 'text-foreground',
  ok: 'text-emerald-600',
  // An "I can't do that" is not a failure and not a success. Amber says so without alarming.
  warn: 'text-amber-600',
  error: 'text-destructive',
}

function headline(busy: boolean, micStatus: MicStatus): string {
  if (micStatus === 'connecting') return 'Connecting the microphone…'
  if (micStatus === 'listening') return 'Listening…'
  if (micStatus === 'denied') return 'Microphone blocked'
  if (busy || micStatus === 'processing') return 'Working…'
  return 'Ready to help'
}

function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * The agent's own tool log (`AgentLogEntry.trace`, e.g. "Tool 'find_words' executed.").
 *
 * Shown inline, never behind a disclosure: what the agent reached for is the most interesting
 * thing about a turn, and hiding it made the panel look like it did nothing. It stays
 * subordinate to the headline — smaller, muted, indented behind a rule — because it is how the
 * result happened, not the result.
 *
 * It only ever renders what is really there. The backend hands the whole `log[]` back when the
 * turn ENDS, so a running turn usually has no steps yet; in that case this renders nothing at
 * all rather than inventing progress. Nothing here is streamed and nothing here is simulated.
 */
function ToolSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-0.5 border-l border-border pl-2.5">
      {steps.map((step, index) => (
        // Untrusted string from the agent's log — a React text node, never markup.
        <li key={index} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <span className="tabular-nums text-muted-foreground/60">{index + 1}</span>
          <span className="min-w-0 flex-1">{step}</span>
        </li>
      ))}
    </ol>
  )
}

/** A turn is anything that is not an editor note, i.e. anything with a real agent status. */
type TurnLogEntry = AgentLogEntry & { status: Exclude<AgentEntryStatus, 'info'> }

function isTurn(entry: AgentLogEntry): entry is TurnLogEntry {
  return entry.status !== 'info'
}

/** One agent turn: what it says happened, the steps it took, and what changed. */
function TurnEntry({
  entry,
  onUndoTurn,
}: {
  entry: TurnLogEntry
  onUndoTurn: (steps: number) => void
}) {
  const status = entry.status
  const Icon = ICONS[status]

  const open = status === 'pending' || status === 'question'

  return (
    // The panel sits on `bg-card`, so a turn lifts off it with the warm neutral `muted` — no
    // accent colour: orange is budgeted to the playhead, primary action and selection (audit 16 §3.3).
    // An OPEN turn (still running, or waiting on an answer) is drawn with a dashed edge: unfinished
    // is a shape here, not a colour, so `question` never borrows the success or the error palette.
    <li
      className={cn(
        'animate-in rounded-md border border-border/60 bg-muted/50 p-2.5 fade-in-0 slide-in-from-bottom-1',
        open && 'border-dashed border-foreground/25',
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 size-3.5 shrink-0', ICON_TONE[status])} />
        {/* Agent text and word text are untrusted strings — rendered as text nodes, never as
            markup. A video's transcript can say anything. The agent's question is one of them. */}
        <span
          className={cn(
            'min-w-0 flex-1 text-sm leading-snug text-foreground',
            // While a turn runs, `message` is still the command as spoken/typed.
            status === 'pending' && 'text-muted-foreground italic',
          )}
        >
          {entry.message}
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground/70 tabular-nums">
          {clockTime(entry.timestamp)}
        </span>
      </div>

      {status === 'question' && (
        // Says only what the status already means: the turn stopped and is waiting on the user.
        <p className="mt-1 pl-5.5 text-[11px] text-muted-foreground">Waiting for your answer</p>
      )}

      {/* The agent's own sentence is the headline; this is the mechanical count beside it, so
          the user can see both what it said and what it actually touched. */}
      {entry.summary && (
        <p className="mt-0.5 pl-5.5 text-[11px] text-muted-foreground tabular-nums">{entry.summary}</p>
      )}

      {/* What the user actually said, once the headline has become the agent's reply — without
          it a finished turn shows an answer with no question above it. */}
      {entry.command && entry.command !== entry.message && status !== 'pending' && (
        <p className="mt-0.5 pl-5.5 text-[11px] text-muted-foreground/70 italic">
          you said: “{entry.command}”
        </p>
      )}

      <EntryDetail
        entry={entry}
        onUndoTurn={onUndoTurn}
        indent="pl-5.5"
        // A turn that asked a question changed nothing, so there is nothing to take back.
        allowUndo={status !== 'question'}
      />
    </li>
  )
}

/**
 * Everything an entry carries below its headline: the agent's steps first (how), then the
 * change lines (what), then the undo. Shared by both entry kinds so an entry can never carry
 * detail the panel silently drops — a cancelled turn, for instance, ends up an `info` entry.
 */
function EntryDetail({
  entry,
  onUndoTurn,
  indent,
  allowUndo = true,
}: {
  entry: AgentLogEntry
  onUndoTurn: (steps: number) => void
  indent: string
  /** False for a status that cannot have changed anything, whatever the entry happens to carry. */
  allowUndo?: boolean
}) {
  const hasTrace = entry.trace !== undefined && entry.trace.length > 0
  const hasLines = entry.lines !== undefined && entry.lines.length > 0
  const undoSteps = allowUndo ? entry.undoSteps : undefined
  if (!hasTrace && !hasLines && undoSteps === undefined) return null

  return (
    <div className={cn('mt-2 flex flex-col gap-2', indent)}>
      {entry.trace && hasTrace && <ToolSteps steps={entry.trace} />}

      {entry.lines && hasLines && (
        <ul className="flex flex-col gap-0.5">
          {entry.lines.map((line, index) => (
            // Untrusted, like every other string here — a text node, never markup.
            <li key={index} className="flex gap-1.5 text-xs leading-snug text-foreground/80">
              <span aria-hidden className="text-muted-foreground/60">
                ·
              </span>
              <span className="min-w-0 flex-1">{line}</span>
            </li>
          ))}
        </ul>
      )}

      {undoSteps !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-ml-1.5 w-fit text-muted-foreground"
          onClick={() => onUndoTurn(undoSteps)}
        >
          <Undo2 />
          Undo that
        </Button>
      )}
    </div>
  )
}

/** An editor note, not a turn — kept in the thread for context, drawn as one quiet line. */
function NoteEntry({ entry, onUndoTurn }: { entry: AgentLogEntry; onUndoTurn: (steps: number) => void }) {
  return (
    <li className="animate-in px-0.5 fade-in-0 slide-in-from-bottom-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span aria-hidden className="size-1 shrink-0 self-center rounded-full bg-border" />
        <span className="min-w-0 flex-1 text-muted-foreground">{entry.message}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
          {clockTime(entry.timestamp)}
        </span>
      </div>
      <EntryDetail entry={entry} onUndoTurn={onUndoTurn} indent="pl-3" />
    </li>
  )
}

export function AgentActivityPanel({ entries, busy, micStatus, onUndoTurn }: AgentActivityPanelProps) {
  const endRef = useRef<HTMLLIElement | null>(null)

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
        <p className="eyebrow text-muted-foreground">History</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your AI editing activity will appear here.</p>
        ) : (
          <ol
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 pb-1"
          >
            {entries.map((entry) =>
              isTurn(entry) ? (
                <TurnEntry key={entry.id} entry={entry} onUndoTurn={onUndoTurn} />
              ) : (
                <NoteEntry key={entry.id} entry={entry} onUndoTurn={onUndoTurn} />
              ),
            )}
            {/* Scroll anchor. An <li> rather than a <div> so the list stays valid markup. */}
            <li ref={endRef} aria-hidden className="h-px shrink-0" />
          </ol>
        )}
      </div>
    </div>
  )
}
