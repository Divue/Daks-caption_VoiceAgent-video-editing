import { Activity, Maximize, MoveHorizontal, Sparkle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type CaptionEffectId = 'shake' | 'stretch' | 'scale' | 'glow'

/**
 * The four caption effects the hero orbits. Each maps to a real caption layer:
 * shake = angry emotion, stretch = held word, scale = emphasis, glow = style glow.
 *
 * Colours follow the landing hero reference and are used only for these effects:
 * shake shares the design.md signal coral; the other three are effect-only hues.
 */
export interface CaptionEffect {
  id: CaptionEffectId
  label: string
  icon: LucideIcon
  color: string
  /** Example Hinglish voice command that would apply this effect. */
  command: string
  /** What the editor would do, in plain words, for the demo log. */
  result: string
  /** Stage position (percent of the hero stage) of the chip and of its connector node. */
  chip: { x: number; y: number }
  node: { x: number; y: number }
}

export const CAPTION_EFFECTS: CaptionEffect[] = [
  {
    id: 'shake',
    label: 'Shake',
    icon: Activity,
    color: '#FF6B4A',
    command: 'bekaar ko angry bana do',
    result: 'bekaar → angry',
    chip: { x: 23, y: 24 },
    node: { x: 29.5, y: 30 },
  },
  {
    id: 'stretch',
    label: 'Stretch',
    icon: MoveHorizontal,
    color: '#7C82F0',
    command: 'hello ko thoda lamba khicho',
    result: 'hello → hellooo',
    chip: { x: 74, y: 20 },
    node: { x: 67.5, y: 27 },
  },
  {
    id: 'scale',
    label: 'Scale up',
    icon: Maximize,
    color: '#9A7CF0',
    command: 'sunta wala word bada kar do',
    result: 'sunta → emphasis',
    chip: { x: 22, y: 80 },
    node: { x: 28.5, y: 73 },
  },
  {
    id: 'glow',
    label: 'Glow',
    icon: Sparkle,
    color: '#EC5B93',
    command: 'saare captions pe glow daalo',
    result: 'all words → glow',
    chip: { x: 75, y: 83 },
    node: { x: 69, y: 76 },
  },
]

/**
 * Colour for each caption layer, borrowed from the effect that expresses it
 * (angry -> shake, excited -> stretch, emphasis -> scale). Used for tags in the editor.
 */
export const LAYER_COLORS = {
  angry: '#FF6B4A',
  excited: '#7C82F0',
  emphasis: '#9A7CF0',
} as const

/** `#RRGGBB` + alpha -> `rgba()`, for tints of an effect colour in inline styles. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
