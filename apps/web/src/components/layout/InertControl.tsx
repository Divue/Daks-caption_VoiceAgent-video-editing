import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InertControlProps {
  label: string
  icon: LucideIcon
  /** Why it does nothing, and whose job it is. Shown on hover. */
  reason: string
  showLabel?: boolean
  className?: string
}

/**
 * A control that is present, correctly labelled and correctly iconed — and visibly does
 * nothing.
 *
 * `.claude/INDEX.md` forbids faking backend or AI behaviour, so a button for an unbuilt
 * feature must LOOK unbuilt. There is deliberately no onClick prop: not a toast, not a
 * "coming soon" dialog, nothing. A disabled attribute, muted foreground, a
 * not-allowed cursor and a tooltip naming the reason.
 */
export function InertControl({ label, icon: Icon, reason, showLabel = false, className }: InertControlProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title={`${label} — ${reason}`}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium',
        'cursor-not-allowed text-muted-foreground/60',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {showLabel && <span className="hidden truncate xl:inline">{label}</span>}
      <span className="sr-only">{label} (not available)</span>
    </button>
  )
}
