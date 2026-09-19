import { Project } from '@captions/shared'
import type { LayerItem, Overlay, PresetId, PresetOverride, Word } from '@captions/shared'
import { applyStyleChange } from '@/lib/style-change'
import type { StyleChange } from '@/lib/style-change'

export interface ProjectHistoryState {
  past: Project[]
  present: Project
  future: Project[]
}

export type ProjectAction =
  | { type: 'SET_PROJECT'; project: Project }
  | { type: 'REPLACE_PRESENT'; project: Project }
  | { type: 'UPDATE_WORD'; wordId: string; patch: Partial<Word> }
  | { type: 'UPDATE_WORDS'; wordIds: string[]; patch: Partial<Word> }
  | { type: 'PATCH_WORDS_STYLE'; wordIds: string[]; change: StyleChange }
  | { type: 'SET_PRESET'; presetId: PresetId }
  | { type: 'SET_SETTINGS'; settings: Partial<Project['settings']> }
  | { type: 'SET_PRESET_OVERRIDE'; override: Partial<PresetOverride> | null }
  | { type: 'ADD_OVERLAY'; overlay: Overlay }
  /** The media layers as the whole list they should now be — a split or a delete has no clean
   *  per-item expression. `[]` removes the key, so absent and empty stay the same thing. */
  | { type: 'SET_LAYERS'; layers: LayerItem[] }
  | { type: 'APPLY_AGENT_PATCHES'; patches: AgentPatch[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }

/**
 * The subset of actions the agent is allowed to emit. It mirrors
 * services/api/app/agent/contracts.py's `AgentPatch` union field-for-field, which is why a
 * response's `patches` can be applied with no remapping. The agent can never dispatch UNDO,
 * REPLACE_PRESENT or SET_PROJECT — history and server sync belong to the editor.
 */
export type AgentPatch = Extract<
  ProjectAction,
  {
    type: 'UPDATE_WORD' | 'SET_PRESET' | 'SET_SETTINGS' | 'SET_PRESET_OVERRIDE' | 'ADD_OVERLAY' | 'SET_LAYERS'
  }
>

export function createInitialState(project: Project): ProjectHistoryState {
  return { past: [], present: project, future: [] }
}

/** Validates a candidate project before it becomes the new present state. */
function validate(candidate: Project): Project | null {
  const result = Project.safeParse(candidate)
  if (!result.success) {
    console.error('Rejected project update — failed schema validation:', result.error)
    return null
  }
  return result.data
}

function commit(state: ProjectHistoryState, candidate: Project): ProjectHistoryState {
  const validated = validate(candidate)
  if (!validated) return state
  return { past: [...state.past, state.present], present: validated, future: [] }
}


/**
 * Preset overrides merge KEY BY KEY, and an explicit null on a key removes that one override —
 * the same contract style overrides use, and for the same reason: `undefined` is dropped by
 * JSON.stringify, so a removal expressed that way would never reach the server. A whole-object
 * null clears every override ("put it back to the preset").
 */
function mergePresetOverride(
  current: PresetOverride | undefined,
  change: Partial<PresetOverride> | null,
): PresetOverride | undefined {
  // `undefined` too, not just null: the key is meant to arrive as an explicit JSON null, and a
  // serializer that drops it (exactly what `response_model_exclude_none=True` did on the first
  // version of the agent's reset) would otherwise reach `Object.entries(undefined)` and throw
  // inside the reducer. Absent and null have the same only real producer, so they mean the same.
  if (change === null || change === undefined) return undefined
  const merged: Record<string, unknown> = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(change)) {
    if (value === null || value === undefined) delete merged[key]
    else merged[key] = value
  }
  return Object.keys(merged).length > 0 ? (merged as PresetOverride) : undefined
}

function updateWord(project: Project, wordId: string, patch: Partial<Word>): Project {
  return {
    ...project,
    words: project.words.map((word) => (word.id === wordId ? { ...word, ...patch } : word)),
  }
}

/**
 * One agent patch onto a project, as a pure function. Shared by the single-action cases and by
 * APPLY_AGENT_PATCHES so a batch can never drift from what the same patch would do on its own.
 */
export function applyAgentPatch(project: Project, patch: AgentPatch): Project {
  switch (patch.type) {
    case 'UPDATE_WORD':
      return updateWord(project, patch.wordId, patch.patch)
    case 'SET_PRESET':
      return { ...project, presetId: patch.presetId }
    case 'SET_SETTINGS':
      return { ...project, settings: { ...project.settings, ...patch.settings } }
    case 'SET_PRESET_OVERRIDE': {
      const presetOverride = mergePresetOverride(project.presetOverride, patch.override)
      if (presetOverride === undefined) {
        const { presetOverride: _dropped, ...rest } = project
        return rest as Project
      }
      return { ...project, presetOverride }
    }
    case 'ADD_OVERLAY':
      return { ...project, overlays: [...project.overlays, patch.overlay] }
    case 'SET_LAYERS': {
      if (patch.layers.length > 0) return { ...project, layers: patch.layers }
      const { layers: _dropped, ...rest } = project
      return rest as Project
    }
  }
}

export function projectReducer(state: ProjectHistoryState, action: ProjectAction): ProjectHistoryState {
  switch (action.type) {
    case 'SET_PROJECT': {
      const validated = validate(action.project)
      if (!validated) return state
      return { past: [], present: validated, future: [] }
    }

    // Server state wins, but the undo history survives. SET_PROJECT clears past and future,
    // which is right when a project is first loaded and wrong after a 409 conflict refetch —
    // that would silently destroy the user's undo stack. Same commit() path, same validation.
    case 'REPLACE_PRESENT': {
      return commit(state, action.project)
    }

    case 'UPDATE_WORD': {
      return commit(state, updateWord(state.present, action.wordId, action.patch))
    }

    // Setting a whole line's emotion touches N words but is ONE user action, so it is one
    // commit and therefore one undo step. N separate UPDATE_WORDs would make the user press
    // Ctrl+Z once per word to take back a single click.
    case 'UPDATE_WORDS': {
      const targets = new Set(action.wordIds)
      return commit(state, {
        ...state.present,
        words: state.present.words.map((word) =>
          targets.has(word.id) ? { ...word, ...action.patch } : word,
        ),
      })
    }

    // A style override merges KEY BY KEY, so it cannot go through UPDATE_WORDS: that spreads one
    // identical patch over every target, which would replace each word's whole override with the
    // same object and wipe whatever else it held. Each word merges the change onto its own style.
    case 'PATCH_WORDS_STYLE': {
      const targets = new Set(action.wordIds)
      return commit(state, {
        ...state.present,
        words: state.present.words.map((word) => {
          if (!targets.has(word.id)) return word
          const style = applyStyleChange(word.style, action.change)
          if (style === undefined) {
            // Drop the key rather than storing `style: undefined` — the zod schema's .optional()
            // accepts an absent key, and this object is round-tripped through JSON.
            const { style: _dropped, ...rest } = word
            return rest
          }
          return { ...word, style }
        }),
      })
    }

    case 'SET_PRESET': {
      return commit(state, { ...state.present, presetId: action.presetId })
    }

    case 'SET_SETTINGS': {
      return commit(state, {
        ...state.present,
        settings: { ...state.present.settings, ...action.settings },
      })
    }

    case 'ADD_OVERLAY': {
      return commit(state, {
        ...state.present,
        overlays: [...state.present.overlays, action.overlay],
      })
    }

    case 'SET_PRESET_OVERRIDE':
    case 'SET_LAYERS': {
      return commit(state, applyAgentPatch(state.present, action))
    }

    // One utterance is one undo step. The agent returns a list of patches that are ONE user
    // intent ("make that line angry" is four words), so they fold into a single candidate and
    // commit once. Dispatching them individually would make the user press Ctrl+Z once per word
    // to take back one sentence they said — the same rule UPDATE_WORDS exists for.
    //
    // Folding also means validation runs once, on the finished result, so a batch that is only
    // valid as a whole is accepted and a batch that is invalid is dropped entirely rather than
    // applied halfway.
    case 'APPLY_AGENT_PATCHES': {
      if (action.patches.length === 0) return state
      const candidate = action.patches.reduce(applyAgentPatch, state.present)
      return commit(state, candidate)
    }

    case 'UNDO': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      }
    }

    case 'REDO': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return { past: [...state.past, state.present], present: next, future: rest }
    }

    default:
      return state
  }
}
