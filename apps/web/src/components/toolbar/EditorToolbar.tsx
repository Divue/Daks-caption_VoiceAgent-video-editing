import { Gauge, Link, Magnet, Music, Scissors, Shuffle, Sticker, Wand2 } from 'lucide-react'
import { SplitSquareHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InertControl } from '@/components/layout/InertControl'

const OUT_OF_SCOPE = 'not built yet'

/**
 * The timeline tools.
 *
 * Every one of these is INERT and looks it — `InertControl` gives them a disabled attribute, a
 * muted foreground, a not-allowed cursor and a tooltip saying so, because `.claude/INDEX.md`
 * forbids faking behaviour. They are here so the affordances exist and have somewhere obvious to
 * be wired, not to imply they work.
 *
 * Grouped rather than run together: nine identical icons in a row was the version that read as a
 * picture of a toolbar (audit 16 §2.1). The separators are what turn it into three short lists.
 */
const GROUPS: { label: string; icon: LucideIcon }[][] = [
  [
    { label: 'Split', icon: Scissors },
    { label: 'Trim', icon: SplitSquareHorizontal },
  ],
  [
    { label: 'Snapping', icon: Magnet },
    { label: 'Link tracks', icon: Link },
  ],
  [
    { label: 'Transitions', icon: Shuffle },
    { label: 'Effects', icon: Wand2 },
    { label: 'Stickers', icon: Sticker },
    { label: 'Music', icon: Music },
    { label: 'Speed', icon: Gauge },
  ],
]

export function EditorToolbar() {
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {GROUPS.map((group, index) => (
        <div key={group[0].label} className="flex shrink-0 items-center gap-0.5">
          {index > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-border/60" aria-hidden />}
          {group.map(({ label, icon }) => (
            <InertControl
              key={label}
              label={label}
              icon={icon}
              reason={OUT_OF_SCOPE}
              className="px-1.5 py-1"
            />
          ))}
        </div>
      ))}
    </div>
  )
}
