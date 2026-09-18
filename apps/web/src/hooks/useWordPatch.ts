import { useCallback, useEffect, useRef, useState } from 'react'
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
 * Optimistic word edits with server sync. Mounted ONCE, by WordPatchProvider —
 * state/word-patch-context.tsx explains why this must not be per-component.
 *
 * Every write goes through ONE promise queue, in order. That is not tidiness — it is
 * required. `version` is a single counter the server bumps on each write, and the next
 * write must carry the version the previous one returned. Firing two PATCHes concurrently
 * (or firing the next while aborting the last, which does NOT cancel the server-side write)
 * sends a version the server has already moved past, and every write after the first 409s.
 * Setting a line's emotion is N writes in a row, so this path is now the normal one.
 *
 * 1. Dispatch the optimistic change immediately (one commit = one undo step).
 * 2. Enqueue one PATCH per word, threading `version` through the chain.
 * 3. On success: publish the final version.
 * 4. On any failure: refetch and REPLACE_PRESENT. A multi-word edit can fail halfway, so the
 *    server is the only honest answer about which words actually changed — guessing would
 *    leave the editor showing words it never saved.
 */
export function useWordPatchState(): PatchState & {
  patch: (wordId: string, fields: Partial<Word>) => void
  patchWords: (wordIds: string[], fields: Partial<Word>) => void
  clearError: () => void
} {
  const { dispatch } = useProject()
  const { projectId, version, setVersion } = useSync()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    return () => controller.abort()
  }, [])

  // The version the NEXT write must carry. Held in a ref because a queued write needs the
  // value produced by the write before it, which no re-render has published yet.
  const versionRef = useRef(version)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingRef = useRef(0)

  // Adopt a version that came from elsewhere (bootstrap, ProjectLoader, a conflict refetch)
  // only while the queue is idle. Mid-chain, `version` is a stale render value and would
  // walk the counter backwards.
  useEffect(() => {
    if (pendingRef.current === 0) versionRef.current = version
  }, [version])

  const resync = useCallback(async () => {
    if (!projectId) return
    const { project, version: fresh } = await getProject(projectId, controllerRef.current?.signal)
    const parsed = Project.safeParse(project)
    if (!parsed.success) return
    dispatch({ type: 'REPLACE_PRESENT', project: parsed.data })
    versionRef.current = fresh
    setVersion(fresh)
  }, [projectId, dispatch, setVersion])

  const enqueue = useCallback(
    (job: () => Promise<void>) => {
      pendingRef.current += 1
      setSaving(true)

      queueRef.current = queueRef.current
        .then(job)
        .catch(async (cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(describe(cause))
          // The optimistic state and the server have diverged; take the server's answer.
          await resync().catch(() => {
            setError('Saved changes could not be verified — reload to sync.')
          })
        })
        .finally(() => {
          pendingRef.current -= 1
          if (pendingRef.current === 0) setSaving(false)
        })
    },
    [resync],
  )

  /** One word, one PATCH. */
  const patch = useCallback(
    (wordId: string, fields: Partial<Word>) => {
      dispatch({ type: 'UPDATE_WORD', wordId, patch: fields })
      setError(null)
      if (!projectId) return

      const body = toWordPatch(fields)
      if (Object.keys(body).length === 0) return // nothing the API accepts; local-only field

      enqueue(async () => {
        const { version: next } = await patchWord(
          projectId,
          wordId,
          body,
          versionRef.current,
          controllerRef.current?.signal,
        )
        versionRef.current = next
        setVersion(next)
      })
    },
    [projectId, dispatch, setVersion, enqueue],
  )

  /**
   * The same fields onto several words — a whole caption line's emotion. One optimistic
   * commit, then N PATCHes in order. There is no bulk endpoint; if one lands later, this is
   * the single call site to swap.
   */
  const patchWords = useCallback(
    (wordIds: string[], fields: Partial<Word>) => {
      if (wordIds.length === 0) return
      dispatch({ type: 'UPDATE_WORDS', wordIds, patch: fields })
      setError(null)
      if (!projectId) return

      const body = toWordPatch(fields)
      if (Object.keys(body).length === 0) return

      enqueue(async () => {
        for (const wordId of wordIds) {
          const { version: next } = await patchWord(
            projectId,
            wordId,
            body,
            versionRef.current,
            controllerRef.current?.signal,
          )
          versionRef.current = next
        }
        setVersion(versionRef.current)
      })
    },
    [projectId, dispatch, setVersion, enqueue],
  )

  const clearError = useCallback(() => setError(null), [])

  return { saving, error, patch, patchWords, clearError }
}

/**
 * Word fields → the PATCH body the API accepts. Only keys actually present are sent, so a
 * patch never overwrites a field the caller did not touch.
 *
 * `single: false` is sent as null: the API removes a key on an explicit null, which keeps the
 * stored word clean rather than accumulating `"single": false` on every word ever toggled.
 */
function toWordPatch(fields: Partial<Word>): WordPatch {
  const body: WordPatch = {}
  if (fields.text !== undefined) body.text = fields.text
  if (fields.startMs !== undefined) body.startMs = fields.startMs
  if (fields.endMs !== undefined) body.endMs = fields.endMs
  if (fields.emphasis !== undefined) body.emphasis = fields.emphasis
  if (fields.emotion !== undefined) body.emotion = fields.emotion
  if (fields.stretch !== undefined) body.stretch = fields.stretch
  if (fields.single !== undefined) body.single = fields.single === true ? true : null
  if (fields.emoji !== undefined) body.emoji = fields.emoji
  if (fields.style !== undefined) body.style = fields.style ?? null
  return body
}

function describe(cause: unknown): string {
  if (!isApiError(cause)) return String(cause)
  const apiErr = cause as ApiError
  if (apiErr.status === 409) return 'Someone else changed this project — reloaded from the server.'
  if (apiErr.status === 422) return apiErr.detail ?? 'The server rejected that change.'
  return apiErr.detail ?? `${apiErr.code} (HTTP ${apiErr.status})`
}
