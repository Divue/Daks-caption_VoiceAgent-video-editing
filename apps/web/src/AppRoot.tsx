import { lazy, Suspense } from 'react'
import { useRoute } from '@/router'
import { ProjectSyncProvider } from '@/state/sync-context'

const LandingPage = lazy(() => import('@/pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const EditorBootstrap = lazy(() =>
  import('@/components/editor/EditorBootstrap').then((module) => ({ default: module.EditorBootstrap })),
)
const EmptyEditor = lazy(() =>
  import('@/components/editor/EmptyEditor').then((module) => ({ default: module.EmptyEditor })),
)

/**
 * Landing page vs. editor, by route. The editor's providers only mount for /editor, and
 * ProjectProvider only mounts once a real project exists — see plan §4.6: the project is
 * non-nullable, so the mount is gated rather than the value made optional.
 */
export function AppRoot() {
  const { route, projectId } = useRoute()

  if (route !== '/editor') {
    return (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={null}>
      <ProjectSyncProvider initialProjectId={projectId}>
        {projectId ? <EditorBootstrap /> : <EmptyEditor />}
      </ProjectSyncProvider>
    </Suspense>
  )
}
