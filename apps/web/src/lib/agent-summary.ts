// Turns an agent patch list into short human sentences for the activity panel.
//
// The panel must show a CHANGE, not JSON. "3 words -> red" is reviewable; a serialised
// StylePatch is not, and a user who cannot read what the agent did cannot trust it.
import { PRESETS } from '@captions/shared'
import type { Project, Word } from '@captions/shared'
import type { AgentPatch } from '@/state/project-reducer'

/** Preset-override keys, named the way the panel names them. */
const OVERRIDE_LABELS: Record<string, string> = {
  wordsPerLine: 'Words per line',
  emphasis: 'Emphasised words',
  emphasisScale: 'Emphasis size',
  reveal: 'Reveal',
  emotion: 'Emotion styling',
}

/** Style keys rendered with a value, in the order a human would say them. */
const STYLE_LABELS: Record<string, (value: unknown) => string> = {
  color: (v) => `colour ${String(v)}`,
  gradient: () => 'a gradient',
  gradientStops: () => 'a gradient',
  fontFamily: (v) => `font ${String(v)}`,
  fontSize: (v) => `size ${String(v)}`,
  weight: (v) => `weight ${String(v)}`,
  italic: (v) => (v ? 'italic' : 'not italic'),
  textCase: (v) => `${String(v)}case`,
  glow: (v) => (Number(v) > 0 ? `glow ${String(v)}` : 'no glow'),
  glowColor: (v) => `glow colour ${String(v)}`,
  strokeWidth: (v) => (Number(v) > 0 ? `outline ${String(v)}` : 'no outline'),
  strokeColor: (v) => `outline colour ${String(v)}`,
  letterSpacing: (v) => `letter spacing ${String(v)}`,
  lineHeight: (v) => `line height ${String(v)}`,
  shake: (v) => (Number(v) > 0 ? `shake ${String(v)}` : 'no shake'),
  x: (v) => `x ${String(v)}%`,
  y: (v) => `y ${String(v)}%`,
}

function quote(word: Word | undefined, fallback: string): string {
  return word ? `“${word.text}”` : fallback
}

/** Describes what one UPDATE_WORD patch does, without naming the word. */
function describeWordPatch(patch: Record<string, unknown>): string[] {
  const parts: string[] = []
  if ('text' in patch) parts.push(`text -> “${String(patch.text)}”`)
  if ('emphasis' in patch) parts.push(patch.emphasis ? 'emphasised' : 'no longer emphasised')
  if ('emotion' in patch) parts.push(`${String(patch.emotion)}`)
  if ('stretch' in patch) parts.push(`stretch ${String(patch.stretch)}`)
  if ('single' in patch) parts.push(patch.single ? 'on its own line' : 'back in its line')
  if ('emoji' in patch) parts.push(patch.emoji ? `emoji ${String(patch.emoji)}` : 'emoji removed')
  if ('startMs' in patch || 'endMs' in patch) parts.push('timing')

  const style = patch.style as Record<string, unknown> | null | undefined
  if (style === null) {
    parts.push('styling cleared')
  } else if (style) {
    for (const [key, value] of Object.entries(style)) {
      if (value === null) {
        parts.push(`${key} cleared`)
        continue
      }
      const label = STYLE_LABELS[key]
      parts.push(label ? label(value) : `${key} ${String(value)}`)
    }
  }
  return parts
}

/**
 * One line per distinct change, collapsing words that got the same change:
 *   "3 words -> colour #ff2d55"
 *   "“bekaar” -> emphasised"
 *   "Preset -> Chamak"
 */
export function summarisePatches(patches: AgentPatch[], project: Project): string[] {
  const byId = new Map(project.words.map((word) => [word.id, word]))
  const grouped = new Map<string, string[]>() // description -> word ids
  const lines: string[] = []

  for (const patch of patches) {
    switch (patch.type) {
      case 'UPDATE_WORD': {
        const description = describeWordPatch(patch.patch as Record<string, unknown>).join(', ')
        if (!description) break
        const ids = grouped.get(description) ?? []
        ids.push(patch.wordId)
        grouped.set(description, ids)
        break
      }
      case 'SET_PRESET':
        lines.push(`Preset → ${PRESETS[patch.presetId]?.name ?? patch.presetId}`)
        break
      case 'SET_SETTINGS': {
        for (const [key, value] of Object.entries(patch.settings)) {
          const name = key === 'emojis' ? 'Emojis' : key === 'emotionLayer' ? 'Emotion colours' : key
          lines.push(`${name} → ${value ? 'on' : 'off'}`)
        }
        break
      }
      case 'SET_PRESET_OVERRIDE': {
        if (patch.override === null) {
          lines.push('Caption rules → back to the preset')
          break
        }
        for (const [key, value] of Object.entries(patch.override)) {
          const name = OVERRIDE_LABELS[key] ?? key
          if (value === null) {
            lines.push(`${name} → back to the preset`)
          } else if (key === 'wordsPerLine') {
            lines.push(`${value} words per line`)
          } else if (key === 'emphasis' || key === 'emotion') {
            lines.push(`${name} → ${describeWordPatch({ style: value } as Record<string, unknown>).join(', ') || 'changed'}`)
          } else {
            lines.push(`${name} → ${String(value)}`)
          }
        }
        break
      }
      case 'ADD_OVERLAY':
        lines.push(`Overlay “${patch.overlay.text}” added`)
        break
    }
  }

  for (const [description, ids] of grouped) {
    const subject =
      ids.length === 1 ? quote(byId.get(ids[0]), 'A word') : `${ids.length} words`
    lines.push(`${subject} → ${description}`)
  }

  return lines
}

/** One short sentence for the turn as a whole, e.g. "4 changes applied". */
export function summariseTurn(patches: AgentPatch[]): string {
  if (patches.length === 0) return 'No changes'
  const words = patches.filter((p) => p.type === 'UPDATE_WORD').length
  if (words === patches.length) {
    return words === 1 ? '1 word changed' : `${words} words changed`
  }
  return patches.length === 1 ? '1 change applied' : `${patches.length} changes applied`
}
