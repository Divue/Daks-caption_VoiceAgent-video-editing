import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LayerItem } from '@captions/shared'
import { MAX_LAYER_ITEMS } from '@captions/shared'
import { LAYER_MEDIA_TYPES, createMedia, describeError, isApiError, mediaUrl, uploadToS3 } from '@/lib/api'
import { newLayerItem, nextLayerId, replaceItem, splitItem } from '@/lib/layers'
import { probeMedia } from '@/lib/media-probe'
import { usePlayback } from '@/state/playback-context'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'
import { useWordPatch } from '@/state/word-patch-context'

/**
 * The media-layer editor: which item is selected, and every way an item changes.
 *
 * Every change is ONE write of the whole layer list through `patchProjectFields`, which is the
 * one serialised write queue and one reducer commit — so a drag, a split or a delete is exactly one
 * Ctrl+Z and can never race a caption edit in flight (audit 13 §5). The timeline, the preview's
 * handles, the inspector, the toolbar and the keyboard all call these; none of them writes on its
 * own. The agent reaches the same state through SET_LAYERS patches.
 */
interface LayerEditorValue {
  layers: LayerItem[]
  selectedLayerId: string | null
  selected: LayerItem | null
  selectLayer: (id: string | null) => void
  /** Commit one item's new state (after a drag ends, or an inspector change). */
  update: (item: LayerItem) => void
  /** Cut the selected item at the playhead. Returns why not, or null when it worked. */
  splitAtPlayhead: () => string | null
  remove: (id: string) => void
  duplicate: (id: string) => void
  /** Upload a file and place it at the playhead. Resolves to the new item's id, or null. */
  addFile: (file: File) => Promise<string | null>
  uploading: { name: string; pct: number } | null
  error: string | null
  clearError: () => void
  /** `src` for an item's media. Stable: the API redirects to a fresh presigned URL. */
  urlOf: (item: LayerItem) => string
  /** False when there is no saved project to put media in (the bundled demo). */
  canAddMedia: boolean
}

const LayerEditorContext = createContext<LayerEditorValue | null>(null)

export function LayerEditorProvider({ children }: { children: ReactNode }) {
  const { project } = useProject()
  const { projectId } = useSync()
  const { patchProjectFields } = useWordPatch()
  const { timeMs } = usePlayback()

  const layers = useMemo(() => project.layers ?? [], [project.layers])
  const [chosenLayerId, setSelectedLayerId] = useState<string | null>(null)
  // An undo can remove the selected item; a selection pointing at nothing would be a lie in the
  // panel, so it is derived away rather than cleared in an effect.
  const selectedLayerId = chosenLayerId && layers.some((item) => item.id === chosenLayerId) ? chosenLayerId : null
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read at action time so a keyboard shortcut or a button never acts on a stale list or playhead.
  const layersRef = useRef(layers)
  const timeRef = useRef(timeMs)
  useEffect(() => {
    layersRef.current = layers
    timeRef.current = timeMs
  })


  const commit = useCallback(
    (next: LayerItem[]) => {
      void patchProjectFields({ layers: next })
    },
    [patchProjectFields],
  )

  const update = useCallback(
    (item: LayerItem) => commit(replaceItem(layersRef.current, item)),
    [commit],
  )

  const splitAtPlayhead = useCallback(() => {
    const items = layersRef.current
    const target = items.find((item) => item.id === selectedLayerId)
    if (!target) return 'Select a layer item first.'
    if (items.length >= MAX_LAYER_ITEMS) return `A project can hold ${MAX_LAYER_ITEMS} layer items.`
    const halves = splitItem(target, timeRef.current, nextLayerId(items))
    if (!halves) return 'Move the playhead inside the item, away from its ends, to split it there.'
    const index = items.findIndex((item) => item.id === target.id)
    commit([...items.slice(0, index), ...halves, ...items.slice(index + 1)])
    setSelectedLayerId(halves[1].id)
    return null
  }, [commit, selectedLayerId])

  const remove = useCallback(
    (id: string) => {
      commit(layersRef.current.filter((item) => item.id !== id))
      setSelectedLayerId((current) => (current === id ? null : current))
    },
    [commit],
  )

  const duplicate = useCallback(
    (id: string) => {
      const items = layersRef.current
      const source = items.find((item) => item.id === id)
      if (!source || items.length >= MAX_LAYER_ITEMS) return
      const length = source.endMs - source.startMs
      const startMs = Math.min(source.endMs, Math.max(0, project.durationMs - length))
      const copy: LayerItem = { ...source, id: nextLayerId(items), startMs, endMs: startMs + length }
      commit([...items, copy])
      setSelectedLayerId(copy.id)
    },
    [commit, project.durationMs],
  )

  const addFile = useCallback(
    async (file: File) => {
      setError(null)
      if (!projectId) {
        setError('Media can only be added to a saved project — upload a video first.')
        return null
      }
      if (!(LAYER_MEDIA_TYPES as readonly string[]).includes(file.type)) {
        setError(`"${file.name}" isn't a supported image or video (PNG, JPEG, WebP, GIF, MP4, MOV, WebM).`)
        return null
      }
      if (layersRef.current.length >= MAX_LAYER_ITEMS) {
        setError(`A project can hold ${MAX_LAYER_ITEMS} layer items.`)
        return null
      }
      setUploading({ name: file.name, pct: 0 })
      try {
        // Measure first: a file the browser cannot read should fail here, before it costs an upload.
        const probe = await probeMedia(file)
        const created = await createMedia(projectId, { filename: file.name, contentType: file.type })
        await uploadToS3(created.upload, file, (pct) => setUploading({ name: file.name, pct }))
        const item = newLayerItem(
          { mediaId: created.mediaId, kind: created.kind, name: file.name, ...probe },
          layersRef.current,
          timeRef.current,
          project.durationMs,
        )
        commit([...layersRef.current, item])
        setSelectedLayerId(item.id)
        return item.id
      } catch (cause) {
        setError(isApiError(cause) ? describeError(cause) : cause instanceof Error ? cause.message : String(cause))
        return null
      } finally {
        setUploading(null)
      }
    },
    [commit, projectId, project.durationMs],
  )

  const urlOf = useCallback(
    (item: LayerItem) => (projectId ? mediaUrl(projectId, item.mediaId) : ''),
    [projectId],
  )

  const value = useMemo<LayerEditorValue>(
    () => ({
      layers,
      selectedLayerId,
      selected: layers.find((item) => item.id === selectedLayerId) ?? null,
      selectLayer: setSelectedLayerId,
      update,
      splitAtPlayhead,
      remove,
      duplicate,
      addFile,
      uploading,
      error,
      clearError: () => setError(null),
      urlOf,
      canAddMedia: projectId !== null,
    }),
    [layers, selectedLayerId, update, splitAtPlayhead, remove, duplicate, addFile, uploading, error, urlOf, projectId],
  )

  return <LayerEditorContext.Provider value={value}>{children}</LayerEditorContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLayerEditor(): LayerEditorValue {
  const value = useContext(LayerEditorContext)
  if (!value) throw new Error('useLayerEditor must be used within a LayerEditorProvider')
  return value
}
