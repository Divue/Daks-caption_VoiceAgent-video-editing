import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PRESETS } from '@captions/shared'
import type { Preset, PresetId } from '@captions/shared'
import { useProject } from '@/state/project-context'

/**
 * Session-level tweaks to the ACTIVE preset.
 *
 * Why this exists, and why it is deliberately not persisted:
 *
 * `Preset` is not part of the stored Project — only `presetId` is. The fields below are all
 * CONDITIONAL layers: `emphasis` applies only to emphasised words, `emotion` only to a tone run,
 * `reveal` only to words ahead of the playhead, `stretch` only to held words. None of them has a
 * per-word home in `Style`, so unlike the base look they cannot be written onto the words and
 * saved. Storing them would mean a new stored field on `Project`, which is a schema change this
 * task does not carry.
 *
 * So they tune the live preview for this session and the panel says so, in the UI, on every
 * section that uses them. That is the honest version; silently pretending they save is not.
 * Unconditional look changes (family, size, colour, spacing, effects, position) do NOT come
 * through here — they are written onto every word via `patchStyle` and genuinely persist.
 */
export type PresetOverride = Partial<
  Pick<Preset, 'emphasis' | 'emphasisScale' | 'reveal' | 'glowLayers' | 'emotion' | 'stretch' | 'align'>
>

interface PresetOverrideValue {
  /** The stored preset with this session's overrides merged over it. Render from this. */
  preset: Preset
  /** The unmodified preset, for "reset" and for showing what a control is departing from. */
  basePreset: Preset
  override: PresetOverride
  setOverride: (patch: PresetOverride) => void
  reset: () => void
  isOverridden: boolean
}

const PresetOverrideContext = createContext<PresetOverrideValue | null>(null)

/** Module-level so "no tweaks" is a STABLE reference — a fresh {} per render would defeat useMemo. */
const NO_OVERRIDE: PresetOverride = Object.freeze({})

export function PresetOverrideProvider({ children }: { children: ReactNode }) {
  const { project } = useProject()
  const presetId = project.presetId
  const basePreset = PRESETS[presetId]

  // The tweaks are stamped with the preset they were made against. Switching preset therefore
  // drops them DURING RENDER rather than in an effect — an effect would paint one frame of, say,
  // Chamak's 2.19x emphasis scale applied to Nazm, a look that is neither preset and that no
  // reload could reproduce.
  const [state, setState] = useState<{ presetId: PresetId; override: PresetOverride }>({
    presetId,
    override: NO_OVERRIDE,
  })
  const override = state.presetId === presetId ? state.override : NO_OVERRIDE

  const setOverride = useCallback(
    (patch: PresetOverride) => {
      setState((current) => ({
        presetId,
        override: current.presetId === presetId ? { ...current.override, ...patch } : patch,
      }))
    },
    [presetId],
  )

  const reset = useCallback(() => setState({ presetId, override: NO_OVERRIDE }), [presetId])

  const preset = useMemo<Preset>(
    () => ({
      ...basePreset,
      ...override,
      // `emphasis` is a Partial<Style>, so a shallow spread of the override would replace the
      // whole face instead of changing one of its keys.
      emphasis: { ...basePreset.emphasis, ...override.emphasis },
      emotion: override.emotion ?? basePreset.emotion,
    }),
    [basePreset, override],
  )

  const value = useMemo<PresetOverrideValue>(
    () => ({
      preset,
      basePreset,
      override,
      setOverride,
      reset,
      isOverridden: Object.keys(override).length > 0,
    }),
    [preset, basePreset, override, setOverride, reset],
  )

  return <PresetOverrideContext.Provider value={value}>{children}</PresetOverrideContext.Provider>
}

export function usePresetOverride(): PresetOverrideValue {
  const context = useContext(PresetOverrideContext)
  if (!context) {
    throw new Error('usePresetOverride must be used within a PresetOverrideProvider')
  }
  return context
}
