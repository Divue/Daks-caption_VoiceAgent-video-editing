import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PRESETS } from '@captions/shared'
import type { Preset, PresetSegment } from '@captions/shared'
import { resolvePreset } from '@/lib/resolve-preset'
import type { PresetOverride } from '@/lib/resolve-preset'
import { usePresetSegments } from '@/hooks/usePresetSegments'
import { mergePresetOverride } from '@/state/project-reducer'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'

/**
 * Tweaks to the ACTIVE preset — some now stored, some still session-only.
 *
 * `Preset` is not part of the stored Project; only `presetId` is. Every field here is a
 * CONDITIONAL layer: `emphasis` applies only to emphasised words, `emotion` only to a tone run,
 * `reveal` only to words ahead of the playhead, `stretch` only to held words. None has a per-word
 * home in `Style`, so unlike the base look they cannot be written onto words.
 *
 * Four of them now have a home on the Project (`Project.presetOverride`, added with schema.py in
 * the same change): `wordsPerLine`, `emphasis`, `emphasisScale`, `reveal` and `emotion`. Those
 * PERSIST — "fewer words per line" and "make the emphasised words bigger" survive a reload and
 * are what the agent's set_preset_override tool writes.
 *
 * The rest (`glowLayers`, `stretch`, `align`) still have nowhere to be stored. They tune the live
 * preview for this session and the panel says so, on every section that uses them. That is the
 * honest version; silently pretending they save is not.
 *
 * Unconditional look changes (family, size, colour, spacing, effects, position) do NOT come
 * through here — they are written onto every word via `patchStyle` and genuinely persist.
 */
export type { PresetOverride }

/** The keys that have a home on the Project. Everything else stays session-only. */
const STORED_KEYS = ['baseFontSize', 'base', 'wordsPerLine', 'emphasis', 'emphasisScale', 'reveal', 'emotion'] as const

function splitOverride(patch: PresetOverride): { stored: PresetOverride; session: PresetOverride } {
  const stored: Record<string, unknown> = {}
  const session: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if ((STORED_KEYS as readonly string[]).includes(key)) stored[key] = value
    else session[key] = value
  }
  return { stored: stored as PresetOverride, session: session as PresetOverride }
}

interface PresetOverrideValue {
  /** The preset with the stored overrides AND this session's merged over it, AT THE PLAYHEAD. */
  preset: Preset
  /** The unmodified preset, for "reset" and for showing what a control is departing from. */
  basePreset: Preset
  override: PresetOverride
  setOverride: (patch: PresetOverride) => void
  reset: () => void
  isOverridden: boolean
  /** True for a key that genuinely saves, so the panel can stop badging it "session only". */
  isStoredKey: (key: keyof PresetOverride) => boolean
  /**
   * The preset segment everything above is scoped to, or undefined when the playhead is on the
   * project's own preset. The panel and the picker say which of the two they are editing.
   */
  activeSegment: PresetSegment | undefined
  /**
   * The SESSION half of the override on its own — the keys with nowhere to be stored (glowLayers,
   * stretch, align), which the panel badges as session-only.
   *
   * The preview layers these onto the preset of the BLOCK ON SCREEN rather than using `preset`
   * above. The two are the same everywhere except the tail of a block whose last word starts
   * before a segment boundary and ends after it: there the playhead is already in the next
   * segment while the caption being drawn still belongs to the previous one. The renderer has to
   * follow the block, because that is what the export does (remotion/src/CaptionVideo.tsx) and
   * the preview and the MP4 must not differ for those frames. Editing stays on the playhead,
   * which is a rule a user can predict from where the playhead is.
   */
  sessionOverride: PresetOverride
}

const PresetOverrideContext = createContext<PresetOverrideValue | null>(null)

/** Module-level so "no tweaks" is a STABLE reference — a fresh {} per render would defeat useMemo. */
const NO_OVERRIDE: PresetOverride = Object.freeze({})

export function PresetOverrideProvider({ children }: { children: ReactNode }) {
  const { project } = useProject()
  const { patchProjectFields } = useWordPatch()
  const { activeSegment, setSegment } = usePresetSegments()

  // THE PLAYHEAD PICKS THE SCOPE. With `presetSegments` there is no longer one active preset, so
  // "the preset you are editing" has to be a question about a time. The playhead is that time:
  // it is also the block the preview is drawing, so what this panel changes is what is on screen.
  // Outside every segment the scope is the project's own preset, exactly as before.
  const basePreset = PRESETS[activeSegment?.presetId ?? project.presetId]
  const storedOverride = (activeSegment ? activeSegment.presetOverride : project.presetOverride) as
    | PresetOverride
    | undefined
  // A segment's id, or the project — the scope the session tweaks below belong to.
  const scopeKey = `${activeSegment?.id ?? 'project'}:${basePreset.id}`

  // The tweaks are stamped with the SCOPE they were made against. Moving the playhead into
  // another segment, or switching preset, therefore drops them DURING RENDER rather than in an
  // effect — an effect would paint one frame of, say, Chamak's 2.19x emphasis scale applied to
  // Nazm, a look that is neither preset and that no reload could reproduce.
  const [state, setState] = useState<{ scopeKey: string; override: PresetOverride }>({
    scopeKey,
    override: NO_OVERRIDE,
  })
  const override = state.scopeKey === scopeKey ? state.override : NO_OVERRIDE

  const setOverride = useCallback(
    (patch: PresetOverride) => {
      const { stored, session } = splitOverride(patch)

      // Storable keys go to the Project, through the editor's ONE write queue, so an agent turn
      // and a drag of this panel's slider cannot race each other on the version counter. Inside a
      // segment they go to THAT segment — the whole list is rewritten, like every segment edit.
      if (Object.keys(stored).length > 0) {
        if (activeSegment) {
          const merged = mergePresetOverride(activeSegment.presetOverride, stored)
          setSegment({ ...activeSegment, presetOverride: merged })
        } else {
          void patchProjectFields({ presetOverride: stored })
        }
      }
      if (Object.keys(session).length > 0) {
        setState((current) => ({
          scopeKey,
          override: current.scopeKey === scopeKey ? { ...current.override, ...session } : session,
        }))
      }
    },
    [scopeKey, activeSegment, setSegment, patchProjectFields],
  )

  const reset = useCallback(() => {
    setState({ scopeKey, override: NO_OVERRIDE })
    if (!storedOverride) return
    if (activeSegment) setSegment({ ...activeSegment, presetOverride: undefined })
    else void patchProjectFields({ presetOverride: null })
  }, [scopeKey, storedOverride, activeSegment, setSegment, patchProjectFields])

  // Stored first, then this session's on top: a slider you are dragging right now should win
  // over what was saved, and switching scope drops only the session half (the stored half is
  // the user's explicit, persisted choice).
  const merged = useMemo<PresetOverride>(
    () => ({ ...(storedOverride ?? {}), ...override }),
    [storedOverride, override],
  )

  // The merge itself lives in lib/resolve-preset.ts so the exported video applies overrides the
  // exact same way the preview does.
  const preset = useMemo<Preset>(() => resolvePreset(basePreset, merged), [basePreset, merged])

  const isStoredKey = useCallback(
    (key: keyof PresetOverride) => (STORED_KEYS as readonly string[]).includes(key as string),
    [],
  )

  const value = useMemo<PresetOverrideValue>(
    () => ({
      preset,
      basePreset,
      override: merged,
      setOverride,
      reset,
      isOverridden: Object.keys(merged).length > 0,
      isStoredKey,
      activeSegment,
      sessionOverride: override,
    }),
    [preset, basePreset, merged, setOverride, reset, isStoredKey, activeSegment, override],
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
