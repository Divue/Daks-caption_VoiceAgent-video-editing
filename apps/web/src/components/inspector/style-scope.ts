import type { Preset, PresetOverride, Project, Style, Word } from '@captions/shared'
import { resolvePresetLayers } from '@/lib/caption-style'
import { applyStyleChange } from '@/lib/style-change'
import type { StyleChange } from '@/lib/style-change'

/**
 * One end of the panel's "which words does this control edit?" question.
 *
 * Every control in the shared sections (TEXT, POSITION, SPACING, EFFECTS) is written once and
 * bound to a scope: PRESET writes the same key onto every word, WORD writes it onto one. Both go
 * through `patchStyle`, so both are real persisted edits and both share the single write queue.
 *
 * `fallback` is what the control shows when the scope has no override of its own — the value the
 * user would be departing from. For a word that is what the preset layers actually resolve to
 * (the emphasis face on an emphasised word, not the base face), which is why it is not simply
 * `preset.base`.
 */
export interface StyleScope {
  kind: 'preset' | 'word'
  /** The words a write touches. */
  wordIds: string[]
  /** The override this scope currently holds, if any. */
  override: Partial<Style>
  /** What the override sits on top of. */
  fallback: Partial<Style>
  write: (change: StyleChange) => void
}

export const STYLE_DEFAULTS = {
  italic: false,
  textCase: 'none',
  glow: 0,
  strokeWidth: 0,
  strokeColor: '#000000',
  letterSpacing: 0,
  lineHeight: 1.1,
  shake: 0,
} as const

export function scopeValue<K extends keyof Style>(scope: StyleScope, key: K): Style[K] | undefined {
  return (scope.override[key] ?? scope.fallback[key]) as Style[K] | undefined
}

export function isOverridden(scope: StyleScope, key: keyof Style): boolean {
  return scope.override[key] !== undefined
}

/**
 * "All captions" edits the preset's BASE face — `presetOverride.base` (and `baseFontSize` for size) —
 * never a copy of the key on every word.
 *
 * It used to write every key onto every word. That is not the same thing: a per-word value beats
 * the emphasis and emotion layers (`resolveWordStyle`), so picking a colour here turned the
 * emphasised words and the angry words that colour too, flattening the exact hierarchy the preset
 * exists to draw — and it did it as one PATCH per word, 94 round trips for one click. Writing the
 * base keeps the layers on top, and is one project write.
 *
 * `fallback` is the preset as it SHIPS, so a control shows what it is departing from.
 */
export function presetScope(
  stored: PresetOverride | undefined,
  basePreset: Preset,
  wordIds: string[],
  writeOverride: (patch: Record<string, unknown>) => void,
): StyleScope {
  const base = stored?.base ?? {}
  const override: Partial<Style> = {
    ...base,
    ...(stored?.baseFontSize !== undefined ? { fontSize: stored.baseFontSize } : {}),
  }
  return {
    kind: 'preset',
    wordIds,
    override,
    fallback: basePreset.base,
    write: (change) => {
      const { fontSize, ...rest } = change as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      // Size has one home, the same one the agent writes, so the two can never disagree.
      if ('fontSize' in change) patch.baseFontSize = fontSize ?? null
      if (Object.keys(rest).length > 0) patch.base = applyStyleChange(base, rest) ?? null
      if (Object.keys(patch).length > 0) writeOverride(patch)
    },
  }
}

export function wordScope(
  word: Word,
  preset: Preset,
  settings: Project['settings'],
  write: (wordIds: string[], change: StyleChange) => void,
): StyleScope {
  return {
    kind: 'word',
    wordIds: [word.id],
    override: word.style ?? {},
    fallback: resolvePresetLayers(word, preset, settings).style,
    write: (change) => write([word.id], change),
  }
}
