import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { CaptionEffect, CaptionEffectId } from '@/components/captions/caption-effects'

/** Stage coordinate system: 16:9, matching the stage's aspect ratio so nothing distorts. */
const VIEW_W = 1600
const VIEW_H = 900
/** Orb centre and the radius where lines stop, in stage units (see HeroSection's orb box). */
const ORB = { x: 800, y: 405, stopAt: 200 }

interface EffectConnectorsProps {
  effects: CaptionEffect[]
  activeId: CaptionEffectId | null
  className?: string
  style?: CSSProperties
}

/**
 * Dashed lines from each effect chip's node into the orb, fading toward the orb. The active
 * effect's line brightens and its dashes flow inward (`dash-flow`, off under reduced motion).
 */
export function EffectConnectors({ effects, activeId, className, style }: EffectConnectorsProps) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-0 size-full overflow-visible', className)}
      style={style}
    >
      <defs>
        {effects.map((effect) => {
          const { start, end } = endpoints(effect)
          return (
            <linearGradient
              key={effect.id}
              id={`fx-line-${effect.id}`}
              gradientUnits="userSpaceOnUse"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            >
              <stop offset="0%" stopColor={effect.color} stopOpacity="0.9" />
              <stop offset="100%" stopColor={effect.color} stopOpacity="0.15" />
            </linearGradient>
          )
        })}
      </defs>

      {effects.map((effect) => {
        const { start, end } = endpoints(effect)
        const active = effect.id === activeId
        return (
          <g
            key={effect.id}
            className="transition-opacity duration-300"
            style={{ opacity: activeId === null || active ? 1 : 0.45 }}
          >
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={`url(#fx-line-${effect.id})`}
              strokeWidth={active ? 2.5 : 1.75}
              strokeDasharray="4 7"
              strokeLinecap="round"
              className={active ? 'dash-flow' : undefined}
            />
            <circle cx={start.x} cy={start.y} r={6} fill={effect.color} />
            <circle cx={end.x} cy={end.y} r={3} fill={effect.color} opacity={active ? 0.9 : 0.5} />
          </g>
        )
      })}
    </svg>
  )
}

/** Line from the effect's node (percent of stage) to where it meets the orb's edge. */
function endpoints(effect: CaptionEffect) {
  const start = { x: (effect.node.x / 100) * VIEW_W, y: (effect.node.y / 100) * VIEW_H }
  const dx = ORB.x - start.x
  const dy = ORB.y - start.y
  const length = Math.hypot(dx, dy)
  const end = { x: ORB.x - (dx / length) * ORB.stopAt, y: ORB.y - (dy / length) * ORB.stopAt }
  return { start, end }
}
