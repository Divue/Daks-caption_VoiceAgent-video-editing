import { CheckCircle2, Sparkles } from 'lucide-react'
import type { AgentLogEntry } from '@/hooks/useAgentActivity'

interface AgentActivityPanelProps {
  entries: AgentLogEntry[]
}

export function AgentActivityPanel({ entries }: AgentActivityPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Agent</p>
          <p className="text-xs text-muted-foreground">Ready to help</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent activity</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your AI editing activity will appear here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex animate-in items-start gap-2 fade-in-0 slide-in-from-bottom-1 text-sm"
              >
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span className="flex-1 text-foreground">{entry.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
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
