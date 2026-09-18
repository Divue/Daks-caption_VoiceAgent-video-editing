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
/** `?demo=1`, and only when the build opted in. See `resolveDemo` in router.tsx. */
const FIXTURE_AVAILABLE = import.meta.env.VITE_USE_FIXTURE === 'true'

export function AppRoot() {
  const { route, projectId, demo } = useRoute()
  const fixture = demo && FIXTURE_AVAILABLE

  if (route !== '/editor') {
    return (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    )
  }

  // The editor runs dark and the landing page stays light, so the theme is scoped to this
  // subtree rather than toggled on <html>. See index.css for why the editor is dark at all.
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Suspense fallback={null}>
        <ProjectSyncProvider initialProjectId={projectId}>
          {/* No project and no demo flag means the upload screen — always. */}
          {projectId || fixture ? <EditorBootstrap fixture={fixture} /> : <EmptyEditor />}
        </ProjectSyncProvider>
      </Suspense>
    </div>
  )
}
