import { useCallback, useEffect } from 'react'
import { Project } from '@captions/shared'
import { getProject, isApiError } from '@/lib/api'
import type { StatusResponse } from '@/lib/api'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'

/**
 * Headless. The single place that both READS sync state and DISPATCHES project changes.
 *
 * It has to be here: usePipelineStatus must dispatch when a job finishes, and
 * ProjectSyncProvider sits ABOVE ProjectProvider so it has no dispatch (plan §4.1,
 * audit finding A2). Mounted inside both providers, this component can use both.
 */
export function ProjectLoader({ onReloaded }: { onReloaded?: () => void }) {
  const { projectId, lifecycle, setLifecycle, setVersion, setLastError } = useSync()
  const { dispatch } = useProject()

  const isProcessing = lifecycle.k === 'processing' || lifecycle.k === 'queued'

  const handleSettled = useCallback(
    (status: StatusResponse) => {
      if (status.state === 'failed') {
        const failedStage = Object.entries(status.stages).find(([, stage]) => stage.state === 'failed')
        setLifecycle({
          k: 'failed',
          stage: failedStage?.[0],
          message: failedStage?.[1]?.error ?? status.error ?? 'The pipeline failed.',
        })
        return
      }

      // Job done → fetch the finished project exactly once, then hand it to the reducer.
      if (!projectId) return
      getProject(projectId)
        .then(({ project, version }) => {
          const parsed = Project.safeParse(project)
          if (!parsed.success) {
            setLifecycle({
              k: 'failed',
              message: `The finished project failed schema validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
            })
            return
          }
          dispatch({ type: 'SET_PROJECT', project: parsed.data })
          setVersion(version)
          setLifecycle({ k: 'ready' })
          onReloaded?.()
        })
        .catch((cause) => {
          setLastError(isApiError(cause) ? cause : { code: 'network', status: 0, body: cause })
          setLifecycle({ k: 'unreachable', since: Date.now() })
        })
    },
    [projectId, dispatch, setLifecycle, setVersion, setLastError, onReloaded],
  )

  const { status, unreachable } = usePipelineStatus(projectId, isProcessing, handleSettled)

  // Feed live stage data back into the lifecycle so ProcessingPanel can render it.
  useEffect(() => {
    if (!status) return
    if (lifecycle.k === 'processing' || lifecycle.k === 'queued') {
      if (status.state === 'running' || status.state === 'not_started') {
        setLifecycle({ k: 'processing', status })
      }
    }
  }, [status, lifecycle.k, setLifecycle])

  useEffect(() => {
    if (unreachable && lifecycle.k === 'processing') {
      setLifecycle({ k: 'unreachable', since: Date.now() })
    }
  }, [unreachable, lifecycle.k, setLifecycle])

  return null
}
