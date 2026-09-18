import type { Style } from '@captions/shared'

/**
 * A per-key edit to a `Style` override. A value sets that key; an explicit `null` REMOVES it.
 *
 * Null is the whole point. The old `StyleOverrideFields.withField` built the next style with
 * `{ ...style, [key]: undefined }` for a cleared field — and `JSON.stringify` drops undefined
 * keys, so the removal never reached the server and clearing any override silently did not
 * persist (audit 13 §6, integration review blocker 1). The API has always supported per-key
 * removal on an explicit null; this type is what makes the editor actually send one.
 */
export type StyleChange = Partial<Record<keyof Style, unknown>>

/**
 * Apply a change to a style override, locally.
 *
 * Deliberately mirrors `_merge_style` in services/api/app/store/projects.py, including collapsing
 * an emptied override to `undefined` so the word loses its `style` key entirely rather than
 * carrying `{}` forever. The optimistic local result and the server's result have to agree, or
 * the next reload silently changes what the user sees.
 */
export function applyStyleChange(
  current: Partial<Style> | undefined,
  change: StyleChange,
): Partial<Style> | undefined {
  const next: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(change)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  return Object.keys(next).length > 0 ? (next as Partial<Style>) : undefined
}

/** `null` for every key named, i.e. "remove all of these overrides". */
export function clearKeys(keys: Array<keyof Style>): StyleChange {
  return Object.fromEntries(keys.map((key) => [key, null]))
}
