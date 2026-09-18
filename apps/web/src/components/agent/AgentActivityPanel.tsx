import { AudioLines, Check } from 'lucide-react'
import { PanelLabel } from '@/components/layout/PanelLabel'
import type { AgentLogEntry } from '@/hooks/useAgentActivity'

interface AgentActivityPanelProps {
  entries: AgentLogEntry[]
}

/** The agent's step log, in the landing page's log style: mono lines, success checks, mono time. */
export function AgentActivityPanel({ entries }: AgentActivityPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-signal-dim text-signal">
          <AudioLines className="size-4" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Agent</p>
          <p className="font-mono text-[11px] text-faint">Ready · type or speak a command</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <PanelLabel>Recent activity</PanelLabel>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your editing activity will appear here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="fade-up flex items-start gap-2 font-mono text-[12px] leading-[1.5]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2} />
                <span className="flex-1 text-muted-foreground">{entry.message}</span>
                <span className="shrink-0 text-[11px] text-faint tabular-nums">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
