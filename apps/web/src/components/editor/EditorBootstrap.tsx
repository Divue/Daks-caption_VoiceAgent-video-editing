import { useCallback, useEffect, useState } from 'react'
import { Project } from '@captions/shared'
import App from '@/App'
import { EditorMessage } from '@/components/editor/EditorMessage'
import { getProject, isApiError, startProcess } from '@/lib/api'
import type { ApiError } from '@/lib/api'
import { ProjectLoader } from '@/components/editor/ProjectLoader'
import { PlaybackProvider } from '@/state/playback-context'
import { ProjectProvider } from '@/state/project-context'
import { useSync } from '@/state/sync-context'
import { WordPatchProvider } from '@/state/word-patch-context'

type BootstrapState =
  | { k: 'loading' }
  | { k: 'loaded'; project: Project; version: number }
  | { k: 'error'; error: ApiError }

/**
 * Fetches the project ONCE so ProjectProvider can mount with a real `initial` project.
 *
 * Deviation from plan §4.1, which put every fetch in ProjectLoader: the very first GET
 * cannot live there, because ProjectLoader is mounted *inside* ProjectProvider and
 * ProjectProvider needs the project to exist before it mounts. This component owns that
 * one bootstrap GET; ProjectLoader owns every fetch after it.
 */
export function EditorBootstrap() {
  const { projectId, setVersion, setLifecycle } = useSync()
  const [state, setState] = useState<BootstrapState>({ k: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setState({ k: 'loading' })

    getProject(projectId, controller.signal)
      .then(({ project, version }) => {
        const parsed = Project.safeParse(project)
        if (!parsed.success) {
          // The server sent something the shared schema rejects. Say so rather than
          // rendering a half-valid project — the schema is the contract.
          setState({
            k: 'error',
            error: {
              code: 'schema_mismatch',
              status: 200,
              detail: parsed.error.issues[0]?.message ?? 'Project failed schema validation.',
              body: project,
            },
          })
          return
        }
        setState({ k: 'loaded', project: parsed.data, version })
        setVersion(version)
        setLifecycle({ k: 'ready' })
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        const error: ApiError = isApiError(cause)
          ? cause
          : { code: 'network', status: 0, detail: String(cause), body: cause }
        setState({ k: 'error', error })
        if (error.code === 'not_ready') setLifecycle({ k: 'processing', status: null })
        else setLifecycle({ k: 'unreachable', since: Date.now() })
      })

    return () => controller.abort()
  }, [projectId, reloadToken, setVersion, setLifecycle])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (!projectId) return null

  if (state.k === 'loading') {
    return <EditorMessage title="Loading project…" detail={projectId} />
  }

  if (state.k === 'error') {
    return <BootstrapError error={state.error} projectId={projectId} onRetry={reload} />
  }

  return (
    <ProjectProvider initial={state.project}>
      <PlaybackProvider>
        <WordPatchProvider>
          <ProjectLoader onReloaded={reload} />
          <App />
        </WordPatchProvider>
      </PlaybackProvider>
    </ProjectProvider>
  )
}

function BootstrapError({
  error,
  projectId,
  onRetry,
}: {
  error: ApiError
  projectId: string
  onRetry: () => void
}) {
  const { setLifecycle } = useSync()
  const [processError, setProcessError] = useState<string | null>(null)

  // 409 not_ready is not a failure: the project exists, it just has no successful run yet.
  if (error.code === 'not_ready') {
    return (
      <EditorMessage
        title="No captions yet"
        detail={error.detail ?? 'This project has not been processed yet.'}
        actionLabel="Run the pipeline"
        onAction={() => {
          setProcessError(null)
          startProcess(projectId)
            .then(() => setLifecycle({ k: 'processing', status: null }))
            .then(onRetry)
            .catch((cause) => setProcessError(isApiError(cause) ? (cause.detail ?? cause.code) : String(cause)))
        }}
        error={processError}
      />
    )
  }

  if (error.code === 'not_found') {
    return (
      <EditorMessage
        title="Project not found"
        detail={`No project with id "${projectId}". It may have been deleted.`}
        actionLabel="Start a new project"
        onAction={() => {
          window.history.pushState({}, '', '/editor')
          window.location.reload()
        }}
      />
    )
  }

  return (
    <EditorMessage
      title={error.code === 'network' ? 'Cannot reach the API' : 'Could not load this project'}
      detail={error.detail ?? `${error.code} (HTTP ${error.status})`}
      actionLabel="Retry"
      onAction={onRetry}
    />
  )
}
