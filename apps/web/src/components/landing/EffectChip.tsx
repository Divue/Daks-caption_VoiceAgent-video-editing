import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { withAlpha } from '@/components/captions/caption-effects'
import type { CaptionEffect } from '@/components/captions/caption-effects'

interface EffectChipProps {
  effect: CaptionEffect
  active?: boolean
  /** When given, the chip is a button (e.g. "play this effect's demo"). */
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

/**
 * A caption effect as a pill: tinted icon disc + mono label, the effect's colour kept to a
 * hairline at rest. `active` lights the border and adds a soft glow in the same hue.
 * Clickable chips lift slightly on hover and press in on click.
 */
export function EffectChip({ effect, active = false, onClick, className, style }: EffectChipProps) {
  const Icon = effect.icon
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      {...(onClick && { type: 'button' as const, onClick, 'aria-pressed': active })}
      className={cn(
        'flex items-center gap-3 rounded-full border bg-surface/90 py-1.5 pr-5 pl-1.5 transition-[border-color,box-shadow,color,translate,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        active ? 'text-foreground' : 'text-muted-foreground',
        onClick &&
          'cursor-pointer hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97]',
        className,
      )}
      style={{
        borderColor: withAlpha(effect.color, active ? 0.75 : 0.28),
        boxShadow: active ? `0 0 32px -6px ${withAlpha(effect.color, 0.45)}` : 'none',
        ...style,
      }}
    >
      <span
        className="flex size-9 items-center justify-center rounded-full transition-colors duration-200"
        style={{ backgroundColor: withAlpha(effect.color, active ? 0.26 : 0.14), color: effect.color }}
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </span>
      <span className="font-mono text-[13px] leading-none tracking-[0.08em] uppercase">{effect.label}</span>
    </Tag>
  )
}
