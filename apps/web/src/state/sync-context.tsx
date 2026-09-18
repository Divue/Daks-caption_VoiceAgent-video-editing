import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiError, StatusResponse } from '@/lib/api'

/**
 * Server identity for the open project: which project, which version, where it is in the
 * upload/process lifecycle. Deliberately NOT the Project itself — that stays in
 * ProjectProvider, behind project-reducer, which remains the only mutation site.
 *
 * This provider is a plain state holder. It fetches nothing: it sits ABOVE ProjectProvider
 * and so has no dispatch, and a hook that both polls and dispatches could never live here
 * (plan §4.1, audit finding A2). All fetching lives in ProjectLoader, mounted inside both.
 */

/** Every arm is a real rendered state — there is no catch-all spinner. */
export type Lifecycle =
  | { k: 'idle' } // no project: full-bleed dropzone
  | { k: 'creating' } // POST /projects in flight
  | { k: 'uploading'; pct: number } // real XHR byte progress to S3
  | { k: 'queued' } // POST /process accepted
  | { k: 'processing'; status: StatusResponse | null } // polling; the 7-stage map
  | { k: 'ready' } // project loaded
  | { k: 'failed'; stage?: string; message: string } // the server said the job failed
  | { k: 'unreachable'; since: number } // WE cannot reach the API (distinct from failed)

interface SyncContextValue {
  projectId: string | null
  version: number | undefined
  lifecycle: Lifecycle
  lastError: ApiError | null
  /** objectURL of the dropped file. Shown while processing, when no Project exists yet. */
  localPreviewUrl: string | null
  setProjectId: (id: string | null) => void
  setVersion: (version: number | undefined) => void
  setLifecycle: (lifecycle: Lifecycle) => void
  setLastError: (error: ApiError | null) => void
  setLocalPreviewUrl: (url: string | null) => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function ProjectSyncProvider({
  children,
  initialProjectId = null,
}: {
  children: ReactNode
  initialProjectId?: string | null
}) {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [version, setVersion] = useState<number | undefined>(undefined)
  const [lifecycle, setLifecycle] = useState<Lifecycle>(initialProjectId ? { k: 'processing', status: null } : { k: 'idle' })
  const [lastError, setLastError] = useState<ApiError | null>(null)
  const [localPreviewUrl, setLocalPreviewUrlState] = useState<string | null>(null)

  // Revoking the previous objectURL on replace is what stops the blob leaking.
  const previousUrl = useRef<string | null>(null)
  const setLocalPreviewUrl = useCallback((url: string | null) => {
    if (previousUrl.current && previousUrl.current !== url) {
      URL.revokeObjectURL(previousUrl.current)
    }
    previousUrl.current = url
    setLocalPreviewUrlState(url)
  }, [])

  const value = useMemo<SyncContextValue>(
    () => ({
      projectId,
      version,
      lifecycle,
      lastError,
      localPreviewUrl,
      setProjectId,
      setVersion,
      setLifecycle,
      setLastError,
      setLocalPreviewUrl,
    }),
    [projectId, version, lifecycle, lastError, localPreviewUrl, setLocalPreviewUrl],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSync must be used within a ProjectSyncProvider')
  }
  return context
}
