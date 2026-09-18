import { lazy, Suspense } from 'react'
import { BrandLoader } from '@/components/loading/BrandLoader'
import { EditorSkeleton } from '@/components/loading/EditorSkeleton'
import { useRoute } from '@/router'
import { ProjectProvider } from '@/state/project-context'

const LandingPage = lazy(() => import('@/pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const App = lazy(() => import('@/App'))

/**
 * Decides landing page vs. editor by route. ProjectProvider only mounts for /editor.
 * While a route's code loads, each shows its own loading state instead of a blank page.
 */
export function AppRoot() {
  const { route } = useRoute()

  if (route === '/editor') {
    return (
      <Suspense fallback={<EditorSkeleton />}>
        <ProjectProvider>
          <App />
        </ProjectProvider>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<BrandLoader />}>
      <LandingPage />
    </Suspense>
  )
}
