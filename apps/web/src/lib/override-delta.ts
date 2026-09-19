import type { PresetOverride } from '@captions/shared'

/**
 * The PATCH body that turns the stored override `before` into `after`, under the server's merge
 * rule (a value sets a key, a null removes it, an absent key is untouched). `after` undefined is a
 * whole-object null — "back to the preset". Otherwise every key `after` has is sent, and every key
 * only `before` had is sent as null, so the stored result is exactly `after` whatever order the
 * turn's patches came in.
 */
export function overrideDelta(
  before: PresetOverride | undefined,
  after: PresetOverride | undefined,
): Partial<PresetOverride> | null {
  if (after === undefined) return null
  const delta: Record<string, unknown> = { ...after }
  for (const key of Object.keys(before ?? {})) if (!(key in after)) delta[key] = null
  return delta as Partial<PresetOverride>
}
