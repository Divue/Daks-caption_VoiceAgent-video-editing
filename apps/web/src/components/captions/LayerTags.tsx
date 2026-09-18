import type { Word } from '@captions/shared'
import { cn } from '@/lib/utils'
import { LAYER_COLORS, withAlpha } from './caption-effects'

/** The caption layers a word carries, as tiny tags coloured like the hero's effects. */
export function LayerTags({ word, className }: { word: Word; className?: string }) {
  const tags: { label: string; color: string }[] = []
  if (word.emotion === 'angry') tags.push({ label: 'angry', color: LAYER_COLORS.angry })
  if (word.emotion === 'excited') tags.push({ label: 'excited', color: LAYER_COLORS.excited })
  if (word.emphasis) tags.push({ label: 'emph', color: LAYER_COLORS.emphasis })

  if (tags.length === 0) return null

  return (
    <span className={cn('flex shrink-0 gap-1', className)}>
      {tags.map((tag) => (
        <span
          key={tag.label}
          className="rounded-full border px-1.5 py-px font-mono text-[10px] leading-[1.4]"
          style={{ color: tag.color, borderColor: withAlpha(tag.color, 0.35), backgroundColor: withAlpha(tag.color, 0.1) }}
        >
          {tag.label}
        </span>
      ))}
    </span>
  )
}
