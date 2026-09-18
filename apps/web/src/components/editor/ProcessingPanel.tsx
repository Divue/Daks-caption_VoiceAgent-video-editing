import { CheckCircle2, Circle, Loader2, XCircle, WifiOff } from 'lucide-react'
import { STAGE_ORDER, STAGE_LABELS } from '@/lib/api'
import type { Stage, StageState, StatusResponse } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface ProcessingPanelProps {
  status: StatusResponse | null
  filename?: string
  unreachable?: boolean
  onCancel: () => void
}

export function ProcessingPanel({ status, filename, unreachable, onCancel }: ProcessingPanelProps) {
  const elapsed = status?.elapsedMs

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-5 bg-background p-6 text-foreground">
      <div className="text-center">
        <h1 className="text-lg font-semibold">
          Processing{filename ? `: ${filename}` : '…'}
        </h1>
        {elapsed != null && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(elapsed / 1000).toFixed(1)}s elapsed
          </p>
        )}
      </div>

      {unreachable && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600">
          <WifiOff className="size-4 shrink-0" />
          <span>Connection lost — retrying automatically…</span>
        </div>
      )}

      <div className="w-full max-w-sm space-y-1">
        {STAGE_ORDER.map((name) => (
          <StageRow key={name} label={STAGE_LABELS[name]} stage={status?.stages[name]} />
        ))}
      </div>

      {!status && (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      )}

      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

function StageRow({ label, stage }: { label: string; stage?: Stage }) {
  const state: StageState = stage?.state ?? 'pending'

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm">
      <StageIcon state={state} />
      <span className={state === 'pending' ? 'text-muted-foreground' : ''}>
        {label}
      </span>
      {stage?.ms != null && state === 'done' && (
        <span className="ml-auto text-xs text-muted-foreground">
          {(stage.ms / 1000).toFixed(1)}s
        </span>
      )}
      {state === 'failed' && stage?.error && (
        <span
          className="ml-auto max-w-[200px] truncate text-xs text-destructive"
          title={stage.error}
        >
          {stage.error}
        </span>
      )}
    </div>
  )
}

function StageIcon({ state }: { state: StageState }) {
  switch (state) {
    case 'done':
    case 'skipped':
      return <CheckCircle2 className="size-4 shrink-0 text-green-500" />
    case 'running':
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
    case 'failed':
      return <XCircle className="size-4 shrink-0 text-destructive" />
    default:
      return <Circle className="size-4 shrink-0 text-muted-foreground/40" />
  }
}
