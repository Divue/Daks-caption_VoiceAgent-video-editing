import { Eye, Lock, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InertControl } from '@/components/layout/InertControl'

/** Matches the gutter the lanes are offset by. One constant so they cannot drift apart. */
export const TRACK_HEADER_WIDTH = 168

interface TrackHeaderProps {
  name: string
  icon: LucideIcon
  height: number
}

/**
 * A lane's name and its per-lane controls.
 *
 * Mute / lock / hide are INERT and look it — `InertControl` gives them a disabled attribute, a
 * muted foreground, a not-allowed cursor and a tooltip saying so, because `.claude/INDEX.md`
 * forbids faking behaviour. They are here so the affordances exist and have an obvious place to be
 * wired later, not to imply they work now.
 *
 * What changed from the version audit 16 §2.3 graded an F: the gutter is wide enough for the lane
 * NAME to fit. Previously six glyphs were crammed into 110px and the name was truncated to "C.",
 * "V.", "A." to make room — the controls were squeezing out the one piece of text that was real.
 * They also rest at low opacity and come up on hover, so a resting timeline reads as three named
 * lanes rather than as fifteen buttons.
 */
export function TrackHeader({ name, icon: Icon, height }: TrackHeaderProps) {
  return (
    <div
      className="group/track flex shrink-0 items-center gap-2 border-b border-border/40 px-3"
      style={{ height }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/80">
        {name}
      </span>
      <div className="flex shrink-0 items-center opacity-30 transition-opacity group-hover/track:opacity-100">
        <InertControl label={`Mute ${name}`} icon={Volume2} reason="not built yet" className="p-0.5 [&_svg]:size-3" />
        <InertControl label={`Lock ${name}`} icon={Lock} reason="not built yet" className="p-0.5 [&_svg]:size-3" />
        <InertControl label={`Hide ${name}`} icon={Eye} reason="not built yet" className="p-0.5 [&_svg]:size-3" />
      </div>
    </div>
  )
}
