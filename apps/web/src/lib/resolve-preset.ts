import type { Preset, Style } from '@captions/shared'

/**
 * Tweaks to the ACTIVE preset. See `state/preset-override-context.tsx` for which of these are
 * stored on the Project and which are session-only; this file only defines the shape and the merge.
 */
export type PresetOverride = Partial<
  Pick<Preset, 'emphasis' | 'emphasisScale' | 'reveal' | 'glowLayers' | 'emotion' | 'stretch' | 'align'>
> & { wordsPerLine?: number; baseFontSize?: number; base?: Partial<Style> }

/**
 * A base preset with an override merged over it — the ONE definition of what the captions look like.
 *
 * Pure and dependency-free on purpose. The editor's preview and the exported video must apply an
 * override identically, so this used to be the body of a React `useMemo` that only the editor could
 * call; the renderer would have needed its own copy, and a copy drifts.
 */
export function resolvePreset(basePreset: Preset, merged: PresetOverride): Preset {
  return {
    ...basePreset,
    ...merged,
    // A base-size override belongs INSIDE `base`, where the resolver reads it. Putting it on
    // the preset root would be ignored, and writing it onto every word instead would beat
    // `emphasisScale` and flatten the emphasis hierarchy — the bug this field exists to fix.
    // The same goes for the rest of the base face (`base`): it changes what every word starts from,
    // and the emphasis and emotion layers still land on top of it. `baseFontSize` stays the one
    // home for size, so there is never a question of which of two base sizes wins.
    base:
      merged.baseFontSize || merged.base
        ? {
            ...basePreset.base,
            ...merged.base,
            ...(merged.baseFontSize ? { fontSize: merged.baseFontSize } : {}),
          }
        : basePreset.base,
    // `emphasis` is a Partial<Style>, so a shallow spread of the override would replace the
    // whole face instead of changing one of its keys.
    emphasis: { ...basePreset.emphasis, ...merged.emphasis },
    emotion: merged.emotion ?? basePreset.emotion,
  }
}
