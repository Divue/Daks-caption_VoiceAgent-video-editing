import { Project } from '@captions/shared'
import type { Overlay, PresetId, Word } from '@captions/shared'

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
  | { type: 'SET_PRESET'; presetId: PresetId }
  | { type: 'ADD_OVERLAY'; overlay: Overlay }
  | { type: 'UNDO' }
  | { type: 'REDO' }

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
      return commit(state, {
        ...state.present,
        words: state.present.words.map((word) =>
          word.id === action.wordId ? { ...word, ...action.patch } : word,
        ),
      })
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

    case 'SET_PRESET': {
      return commit(state, { ...state.present, presetId: action.presetId })
    }

    case 'ADD_OVERLAY': {
      return commit(state, {
        ...state.present,
        overlays: [...state.present.overlays, action.overlay],
      })
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
