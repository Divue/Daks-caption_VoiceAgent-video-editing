import type { Preset, Project, Style, Word } from '@captions/shared'
import { resolvePresetLayers } from '@/lib/caption-style'
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
 * The preset scope's "current" value for a key.
 *
 * It is an override only when EVERY word carries the same one — otherwise the words disagree and
 * the honest answer is the preset's own value, with the control showing un-overridden. Claiming a
 * single value for a key that differs word to word would make the next drag silently flatten them.
 */
function sharedOverride(words: Word[]): Partial<Style> {
  const withStyle = words.filter((word) => word.style)
  if (withStyle.length === 0 || withStyle.length !== words.length) return {}

  const first = withStyle[0].style as Partial<Style>
  const shared: Partial<Style> = {}
  for (const key of Object.keys(first) as (keyof Style)[]) {
    const value = JSON.stringify(first[key])
    if (withStyle.every((word) => JSON.stringify(word.style?.[key]) === value)) {
      Object.assign(shared, { [key]: first[key] })
    }
  }
  return shared
}

export function presetScope(
  project: Project,
  preset: Preset,
  write: (wordIds: string[], change: StyleChange) => void,
): StyleScope {
  const wordIds = project.words.map((word) => word.id)
  return {
    kind: 'preset',
    wordIds,
    override: sharedOverride(project.words),
    fallback: preset.base,
    write: (change) => write(wordIds, change),
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
