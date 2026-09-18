import { useCallback, useEffect, useRef, useState } from 'react'
import { Project } from '@captions/shared'
import type { PresetId, PresetOverride, Word } from '@captions/shared'
import { getProject, isApiError, patchProject, patchWord, patchWordsBulk } from '@/lib/api'
import type { ApiError, BulkWordPatch, WordPatch } from '@/lib/api'
import type { AgentPatch } from '@/state/project-reducer'
import type { StyleChange } from '@/lib/style-change'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'

export interface PatchState {
  saving: boolean
  error: string | null
}

/** The project-level fields the API accepts on PATCH /projects/{id}. */
export interface ProjectFieldPatch {
  presetId?: PresetId
  settings?: Partial<Project['settings']>
  /** Merges per key; an explicit null on a key removes that one override. */
  presetOverride?: Partial<PresetOverride> | null
}

/** What actually happened to one agent turn, so the activity log can be honest about it. */
export interface AgentApplyResult {
  /** Patches whose write reached the server. Less than `total` means a partial turn. */
  applied: number
  total: number
  error: string | null
  /**
   * True when the write failed and the editor refetched. The refetch is itself a commit, so the
   * turn then costs TWO undo steps, not one — "Undo that" has to know.
   */
  resynced: boolean
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
  patchStyle: (wordIds: string[], change: StyleChange) => void
  applyAgentPatches: (patches: AgentPatch[]) => Promise<AgentApplyResult>
  patchProjectFields: (patch: ProjectFieldPatch) => Promise<string | null>
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

  // Returns the tail of the queue so a caller can await ITS OWN job. The chain still never
  // rejects — a failure is absorbed here and reported through `error` — so awaiting is safe and
  // one failed write can never poison the writes queued behind it.
  const enqueue = useCallback(
    (job: () => Promise<void>): Promise<string | null> => {
      pendingRef.current += 1
      setSaving(true)

      let failure: string | null = null
      const chained = queueRef.current
        .then(job)
        .catch(async (cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          failure = describe(cause)
          setError(failure)
          // The optimistic state and the server have diverged; take the server's answer.
          await resync().catch(() => {
            failure = 'Saved changes could not be verified — reload to sync.'
            setError(failure)
          })
        })
        .finally(() => {
          pendingRef.current -= 1
          if (pendingRef.current === 0) setSaving(false)
        })

      queueRef.current = chained
      return chained.then(() => failure)
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

  /**
   * A per-key edit to the style override of one or more words.
   *
   * Separate from `patchWords` because a style override MERGES per key on both sides — the
   * reducer and the server — while every other word field replaces. Passing a whole `style`
   * object through `patchWords` cannot express "remove this one key": the old panel wrote
   * `undefined` for a cleared field, `JSON.stringify` dropped it, and the removal never left the
   * browser. `StyleChange` carries an explicit `null` instead, which survives serialisation and
   * is exactly what the API's `_merge_style` treats as a removal.
   *
   * It shares the one queue, so a preset-scope edit across N words is still N ordered PATCHes
   * carrying the version each previous write returned.
   */
  const patchStyle = useCallback(
    (wordIds: string[], change: StyleChange) => {
      if (wordIds.length === 0 || Object.keys(change).length === 0) return
      dispatch({ type: 'PATCH_WORDS_STYLE', wordIds, change })
      setError(null)
      if (!projectId) return

      enqueue(async () => {
        for (const wordId of wordIds) {
          const { version: next } = await patchWord(
            projectId,
            wordId,
            { style: change },
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

  /**
   * A whole agent turn: ONE optimistic commit (so one utterance is one undo step) and ONE
   * queued job that persists every change in order on the same version counter.
   *
   * This is deliberately NOT a loop of `patch()` calls. Each of those is its own commit and its
   * own queue entry, which would make the user press Ctrl+Z once per word to take back one
   * sentence they said, and would interleave with any manual edit already in flight.
   *
   * Word changes go out as ONE bulk PATCH: all-or-nothing server-side, one version bump. The
   * per-word route would be N sequential round trips sharing one counter — fine for a click,
   * fatal for a voice command that restyles a whole transcript.
   */
  const applyAgentPatches = useCallback(
    async (patches: AgentPatch[]): Promise<AgentApplyResult> => {
      if (patches.length === 0) return { applied: 0, total: 0, error: null, resynced: false }

      dispatch({ type: 'APPLY_AGENT_PATCHES', patches })
      setError(null)
      if (!projectId) return { applied: patches.length, total: patches.length, error: null, resynced: false }

      // Collapse repeated edits to the same word so the bulk body carries one entry per word,
      // last write winning — the same result the folded optimistic commit produced.
      const wordPatches = new Map<string, BulkWordPatch>()
      let projectPatch: { presetId?: PresetId; settings?: Partial<Project['settings']> } = {}
      let unpersistable = 0

      for (const patch of patches) {
        switch (patch.type) {
          case 'UPDATE_WORD': {
            const body = toWordPatch(patch.patch)
            if (Object.keys(body).length === 0) break // local-only fields; nothing to send
            const existing = wordPatches.get(patch.wordId)
            wordPatches.set(patch.wordId, { ...(existing ?? { wordId: patch.wordId }), ...body })
            break
          }
          case 'SET_PRESET':
            projectPatch = { ...projectPatch, presetId: patch.presetId }
            break
          case 'SET_SETTINGS':
            projectPatch = {
              ...projectPatch,
              settings: { ...(projectPatch.settings ?? {}), ...patch.settings },
            }
            break
          case 'ADD_OVERLAY':
            // No endpoint exists for overlays, so this cannot be saved. Counted and reported
            // rather than silently dropped — see the honest-failure rule in CLAUDE.md.
            unpersistable += 1
            break
        }
      }

      const writes = wordPatches.size + (Object.keys(projectPatch).length > 0 ? 1 : 0)
      if (writes === 0) {
        return {
          applied: patches.length - unpersistable,
          total: patches.length,
          error: unpersistable > 0 ? 'Some changes cannot be saved yet.' : null,
          resynced: false,
        }
      }

      let landed = 0
      const failure = await enqueue(async () => {
        if (wordPatches.size > 0) {
          const { version: next } = await patchWordsBulk(
            projectId,
            [...wordPatches.values()],
            versionRef.current,
            controllerRef.current?.signal,
          )
          versionRef.current = next
          landed += wordPatches.size
        }
        if (Object.keys(projectPatch).length > 0) {
          const { version: next } = await patchProject(
            projectId,
            projectPatch,
            versionRef.current,
            controllerRef.current?.signal,
          )
          versionRef.current = next
          landed += 1
        }
        setVersion(versionRef.current)
      })

      return {
        applied: failure ? landed : patches.length - unpersistable,
        total: patches.length,
        error:
          failure ??
          (unpersistable > 0 ? 'Some changes cannot be saved yet.' : null),
        resynced: failure !== null,
      }
    },
    [projectId, dispatch, setVersion, enqueue],
  )

  /**
   * Project-level fields (preset, settings) on the SAME queue as word writes.
   *
   * These used to be written by PresetPicker with its own `patchProject` call, which is a second
   * writer against one version counter — exactly the race the queue exists to prevent, and now
   * reachable for real because the agent can change the preset while a word write is in flight.
   * Routing them here also drops the picker's REPLACE_PRESENT-on-response, which was costing a
   * second undo step for one click.
   */
  const patchProjectFields = useCallback(
    (patch: ProjectFieldPatch): Promise<string | null> => {
      if (patch.presetId !== undefined) dispatch({ type: 'SET_PRESET', presetId: patch.presetId })
      if (patch.settings !== undefined) dispatch({ type: 'SET_SETTINGS', settings: patch.settings })
      if (patch.presetOverride !== undefined)
        dispatch({ type: 'SET_PRESET_OVERRIDE', override: patch.presetOverride })
      setError(null)
      if (!projectId) return Promise.resolve(null)

      return enqueue(async () => {
        const { version: next } = await patchProject(
          projectId,
          patch,
          versionRef.current,
          controllerRef.current?.signal,
        )
        versionRef.current = next
        setVersion(next)
      })
    },
    [projectId, dispatch, setVersion, enqueue],
  )

  const clearError = useCallback(() => setError(null), [])

  return { saving, error, patch, patchWords, patchStyle, applyAgentPatches, patchProjectFields, clearError }
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
  // '' is the editor's "cleared" value; null is what the API removes a key on. Same shape as
  // `single` above, and for the same reason: undefined would be dropped by JSON.stringify.
  if (fields.emoji !== undefined) body.emoji = fields.emoji === '' ? null : fields.emoji
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
