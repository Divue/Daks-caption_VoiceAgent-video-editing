import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useWordPatchState } from '@/hooks/useWordPatch'
import type { AgentApplyResult, PatchState, ProjectFieldPatch } from '@/hooks/useWordPatch'
import type { Word } from '@captions/shared'
import type { StyleChange } from '@/lib/style-change'
import type { AgentPatch } from '@/state/project-reducer'

/**
 * One writer for the whole editor.
 *
 * useWordPatchState serialises writes so each PATCH carries the `version` the previous one
 * returned. That guarantee is per hook INSTANCE, so calling the hook in two components gives
 * two independent queues that race each other straight back into the 409s the queue exists to
 * prevent — and there are already two writers (the word inspector and the caption list).
 * Mounting it once and sharing it through context is what makes the serialisation real.
 *
 * It lives inside ProjectProvider (it dispatches) and under ProjectSyncProvider (it reads and
 * publishes `version`), so EditorBootstrap mounts it between them.
 */
interface WordPatchValue extends PatchState {
  patch: (wordId: string, fields: Partial<Word>) => void
  patchWords: (wordIds: string[], fields: Partial<Word>) => void
  /** Per-key style override edit; an explicit null in `change` removes that key. */
  patchStyle: (wordIds: string[], change: StyleChange) => void
  /**
   * A whole agent turn: one optimistic commit (one undo step) and one queued write. It shares
   * this same queue and version counter, which is the entire reason the agent goes through here
   * rather than dispatching to the reducer itself — a reducer dispatch renders but never saves.
   */
  applyAgentPatches: (patches: AgentPatch[]) => Promise<AgentApplyResult>
  /** Preset and settings writes, on the same queue and version counter as word writes. */
  patchProjectFields: (patch: ProjectFieldPatch) => Promise<string | null>
  clearError: () => void
}

const WordPatchContext = createContext<WordPatchValue | null>(null)

export function WordPatchProvider({ children }: { children: ReactNode }) {
  const value = useWordPatchState()
  return <WordPatchContext.Provider value={value}>{children}</WordPatchContext.Provider>
}

export function useWordPatch(): WordPatchValue {
  const context = useContext(WordPatchContext)
  if (!context) {
    throw new Error('useWordPatch must be used within a WordPatchProvider')
  }
  return context
}
