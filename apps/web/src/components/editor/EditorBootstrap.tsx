import { useCallback, useEffect, useState } from 'react'
import { Project } from '@captions/shared'
import { API_BASE } from '@/lib/api'
import demoProject from '@captions/shared/fixtures/normal-project.json'
import App from '@/App'
import { EditorMessage } from '@/components/editor/EditorMessage'
import { getProject, isApiError, startProcess } from '@/lib/api'
import type { ApiError } from '@/lib/api'
import { ProjectLoader } from '@/components/editor/ProjectLoader'
import { PlaybackProvider } from '@/state/playback-context'
import { PresetOverrideProvider } from '@/state/preset-override-context'
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
/**
 * `fixture` loads the bundled demo project instead of fetching one, so the editor renders with no
 * API running — which is what makes UI work and an offline demo possible. It is reached only by
 * `/editor?demo=1` on a build with VITE_USE_FIXTURE set (router.tsx), never by the env flag alone:
 * letting the flag decide meant `/editor` stopped being the upload screen for anyone running with
 * it on, and there was then no route to the dropzone at all.
 *
 * It is not a fake backend. `projectId` stays null, and every writer already checks it
 * (`if (!projectId) return` in useWordPatch), so edits stay local and honest rather than
 * pretending to save. Nothing here simulates a server response.
 */
export function EditorBootstrap({ fixture = false }: { fixture?: boolean }) {
  const { projectId, setVersion, setLifecycle } = useSync()
  const [state, setState] = useState<BootstrapState>({ k: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (fixture) {
      // The fixture carries a bare filename ("Normal.mp4"), which is not a URL: the <video>
      // would never load and `analyze_frame` would refuse it, so vision could not run in the
      // app at all. The API serves the bake-off clips at /demo-media/<name> in dev, so the
      // demo gets a real, playable, analysable video instead of an empty stage.
      //
      // If that URL is wrong the <video> never loads and stays attached as the playback clock
      // at currentTime 0, which freezes the transport, the timeline and the caption preview —
      // so this must point at something that really serves, not merely at something plausible.
      const demoVideoUrl = `${API_BASE}/demo-media/${demoProject.videoUrl}`
      const parsed = Project.safeParse({ ...demoProject, videoUrl: demoVideoUrl })
      if (parsed.success) {
        setState({ k: 'loaded', project: parsed.data, version: 0 })
        setLifecycle({ k: 'ready' })
      }
      return
    }
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
  }, [projectId, fixture, reloadToken, setVersion, setLifecycle])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (!projectId && !fixture) return null

  if (state.k === 'loading') {
    return <EditorMessage title="Loading project…" detail={projectId ?? ''} />
  }

  if (state.k === 'error') {
    return <BootstrapError error={state.error} projectId={projectId ?? ''} onRetry={reload} />
  }

  return (
    <ProjectProvider initial={state.project}>
      <PlaybackProvider fallbackDurationMs={state.project.durationMs}>
        <WordPatchProvider>
          {/* Reads project.presetId, so it mounts inside ProjectProvider. */}
          <PresetOverrideProvider>
            <ProjectLoader onReloaded={reload} />
            <App />
          </PresetOverrideProvider>
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
