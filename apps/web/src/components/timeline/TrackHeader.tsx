import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Matches the gutter the lanes are offset by. One constant so they cannot drift apart. */
export const TRACK_HEADER_WIDTH = 112

interface TrackHeaderProps {
  name: string
  icon: LucideIcon
  /** Right-aligned secondary text — resolution, block count. Real data only. */
  detail?: string
  height: number
}

/**
 * A lane's name. Deliberately just that.
 *
 * The previous version crammed six glyphs into 110px — a drag handle, a type icon, mute, lock,
 * visibility — of which four did nothing and never would, and then truncated the track name to
 * "C.", "V.", "A." to make room. That was the ugly part, not the lanes themselves: controls that
 * are pictures of controls, squeezing out the one piece of text that was real.
 */
export function TrackHeader({ name, icon: Icon, detail, height }: TrackHeaderProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3"
      style={{ height }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/80">
        {name}
      </span>
      {detail && (
        <span className={cn('shrink-0 font-mono text-[9px] text-muted-foreground/60 tabular-nums')}>
          {detail}
        </span>
      )}
    </div>
  )
}
