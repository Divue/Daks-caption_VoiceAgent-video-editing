import { Eye, GripVertical, Lock, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InertControl } from '@/components/layout/InertControl'
import { cn } from '@/lib/utils'

export const TRACK_HEADER_WIDTH = 132

interface TrackHeaderProps {
  name: string
  icon: LucideIcon
  /** Tailwind text colour for the type icon — all three sit on the brand sunset ramp. */
  iconClassName: string
}

/**
 * Track name + type icon, and three controls that are deliberately inert.
 *
 * Mute / lock / visibility are OUR addition — the reference product has no such buttons
 * in its track headers. Since nothing behind them exists, they are rendered inert rather
 * than wired to a no-op.
 */
export function TrackHeader({ name, icon: Icon, iconClassName }: TrackHeaderProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-r border-b bg-background px-1.5"
      style={{ width: TRACK_HEADER_WIDTH }}
    >
      <GripVertical className="size-3 shrink-0 cursor-not-allowed text-muted-foreground/40" aria-hidden />
      <Icon className={cn('size-3.5 shrink-0', iconClassName)} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
      <InertControl label={`Mute ${name}`} icon={Volume2} reason="not implemented" className="px-0.5" />
      <InertControl label={`Lock ${name}`} icon={Lock} reason="not implemented" className="px-0.5" />
      <InertControl label={`Hide ${name}`} icon={Eye} reason="not implemented" className="px-0.5" />
    </div>
  )
}
