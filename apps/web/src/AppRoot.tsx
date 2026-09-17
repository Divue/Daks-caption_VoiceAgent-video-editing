import { lazy, Suspense } from 'react'
import { useRoute } from '@/router'
import { ProjectProvider } from '@/state/project-context'

const LandingPage = lazy(() => import('@/pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const App = lazy(() => import('@/App'))

/** Decides landing page vs. editor by route. ProjectProvider only mounts for /editor. */
export function AppRoot() {
  const { route } = useRoute()

  return (
    <Suspense fallback={null}>
      {route === '/editor' ? (
        <ProjectProvider>
          <App />
        </ProjectProvider>
      ) : (
        <LandingPage />
      )}
    </Suspense>
  )
}
