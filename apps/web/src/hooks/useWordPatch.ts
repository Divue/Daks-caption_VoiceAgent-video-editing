import { useCallback, useRef, useState } from 'react'
import { Project } from '@captions/shared'
import type { Word } from '@captions/shared'
import { getProject, isApiError, patchWord } from '@/lib/api'
import type { ApiError, WordPatch } from '@/lib/api'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'

export interface PatchState {
  saving: boolean
  error: string | null
}

/**
 * Optimistic word edit with server sync.
 *
 * 1. Dispatch UPDATE_WORD immediately (optimistic).
 * 2. PATCH /words/{id} with the current version.
 * 3. On success: bump version.
 * 4. On 409 (conflict): refetch the project, REPLACE_PRESENT (server wins, undo survives).
 * 5. On 422 (validation): show error, UNDO the optimistic update.
 * 6. On network error: show error, leave the optimistic update (user can retry).
 */
export function useWordPatch(): PatchState & {
  patch: (wordId: string, fields: Partial<Word>) => void
  clearError: () => void
} {
  const { dispatch } = useProject()
  const { projectId, version, setVersion } = useSync()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inflightRef = useRef<AbortController | null>(null)

  const patch = useCallback(
    (wordId: string, fields: Partial<Word>) => {
      dispatch({ type: 'UPDATE_WORD', wordId, patch: fields })
      setError(null)

      if (!projectId) return

      inflightRef.current?.abort()
      const controller = new AbortController()
      inflightRef.current = controller

      setSaving(true)

      const apiPatch: WordPatch = {}
      if (fields.text !== undefined) apiPatch.text = fields.text
      if (fields.emphasis !== undefined) apiPatch.emphasis = fields.emphasis
      if (fields.emotion !== undefined) apiPatch.emotion = fields.emotion
      if (fields.stretch !== undefined) apiPatch.stretch = fields.stretch
      if (fields.emoji !== undefined) apiPatch.emoji = fields.emoji
      if (fields.style !== undefined) apiPatch.style = fields.style ?? null

      patchWord(projectId, wordId, apiPatch, version, controller.signal)
        .then(({ version: newVersion }) => {
          setVersion(newVersion)
          setSaving(false)
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setSaving(false)

          if (!isApiError(cause)) {
            setError(String(cause))
            return
          }

          const apiErr = cause as ApiError

          if (apiErr.status === 409) {
            refetchProject(projectId, controller.signal)
            return
          }

          if (apiErr.status === 422) {
            dispatch({ type: 'UNDO' })
            setError(apiErr.detail ?? 'Validation failed')
            return
          }

          setError(apiErr.detail ?? `${apiErr.code} (HTTP ${apiErr.status})`)
        })
    },
    [projectId, version, dispatch, setVersion],
  )

  function refetchProject(id: string, signal: AbortSignal) {
    getProject(id, signal)
      .then(({ project, version: newVersion }) => {
        const parsed = Project.safeParse(project)
        if (parsed.success) {
          dispatch({ type: 'REPLACE_PRESENT', project: parsed.data })
          setVersion(newVersion)
        }
      })
      .catch(() => {
        setError('Could not sync after conflict — save again to retry.')
      })
  }

  const clearError = useCallback(() => setError(null), [])

  return { saving, error, patch, clearError }
}
