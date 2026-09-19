import type { LayerItem, PresetId, PresetOverride, Project, Style, Word } from '@captions/shared'
import { overrideDelta } from '@/lib/override-delta'

/** One word's change in the shape `PATCH /projects/{id}/words` takes. */
export interface WordDiff {
  wordId: string
  text?: string
  startMs?: number
  endMs?: number
  emphasis?: boolean
  emotion?: Word['emotion']
  stretch?: number
  single?: true | null
  emoji?: string | null
  style?: Partial<Record<keyof Style, unknown>>
}

export interface ProjectDiff {
  words: WordDiff[]
  project: {
    presetId?: PresetId
    settings?: Project['settings']
    presetOverride?: Partial<PresetOverride> | null
    layers?: LayerItem[]
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The writes that make the SERVER hold `after`, given that it holds `before`.
 *
 * This exists for undo and redo. They move the editor between two whole documents in one step,
 * with no edit of their own to send — so for a long time they sent nothing, and the server kept the
 * change the user had just undone. A reload brought it back; so did an export, which renders the
 * SAVED project. Every other write in the editor already speaks this API; this translates "go back
 * to that document" into it, under the same rules: a value sets a key, a null removes it.
 *
 * Words are matched by id. The editor cannot add or delete words, so both documents have the same
 * ids; a word only one side has is skipped rather than guessed at.
 */
export function diffProjects(before: Project, after: Project): ProjectDiff {
  const previous = new Map(before.words.map((word) => [word.id, word]))
  const words: WordDiff[] = []

  for (const word of after.words) {
    const old = previous.get(word.id)
    if (!old || same(old, word)) continue
    const diff: WordDiff = { wordId: word.id }
    if (old.text !== word.text) diff.text = word.text
    if (old.startMs !== word.startMs) diff.startMs = word.startMs
    if (old.endMs !== word.endMs) diff.endMs = word.endMs
    if (old.emphasis !== word.emphasis) diff.emphasis = word.emphasis
    if (old.emotion !== word.emotion) diff.emotion = word.emotion
    if (old.stretch !== word.stretch) diff.stretch = word.stretch
    if ((old.single === true) !== (word.single === true)) diff.single = word.single === true ? true : null
    if ((old.emoji || null) !== (word.emoji || null)) diff.emoji = word.emoji || null
    if (!same(old.style ?? {}, word.style ?? {})) {
      const style: Record<string, unknown> = { ...(word.style ?? {}) }
      for (const key of Object.keys(old.style ?? {})) if (!(key in style)) style[key] = null
      diff.style = style as WordDiff['style']
    }
    if (Object.keys(diff).length > 1) words.push(diff)
  }

  const project: ProjectDiff['project'] = {}
  if (before.presetId !== after.presetId) project.presetId = after.presetId
  if (!same(before.settings, after.settings)) project.settings = after.settings
  if (!same(before.presetOverride ?? null, after.presetOverride ?? null)) {
    project.presetOverride = overrideDelta(before.presetOverride, after.presetOverride)
  }
  if (!same(before.layers ?? [], after.layers ?? [])) project.layers = after.layers ?? []

  return { words, project }
}
