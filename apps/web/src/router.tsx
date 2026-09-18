import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type Route = '/' | '/editor'

function resolveRoute(pathname: string): Route {
  return pathname === '/editor' ? '/editor' : '/'
}

/** The open project is identified by `?id=` — there is no project picker (plan §8.12). */
function resolveProjectId(search: string): string | null {
  return new URLSearchParams(search).get('id')
}

/**
 * `?demo=1` opens the bundled fixture instead of a stored project, and only does anything when
 * VITE_USE_FIXTURE is set. It is a URL the developer types, NOT a mode that changes what `/editor`
 * means: without it, `/editor` with no `?id=` is still the upload screen. Making the env flag
 * alone hijack the route took the upload flow away from anyone running with it on.
 */
function resolveDemo(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1'
}

interface Location {
  route: Route
  projectId: string | null
  demo: boolean
}

interface RouterContextValue extends Location {
  navigate: (route: Route, projectId?: string | null) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function readLocation(): Location {
  return {
    route: resolveRoute(window.location.pathname),
    projectId: resolveProjectId(window.location.search),
    demo: resolveDemo(window.location.search),
  }
}

/** Minimal history-API router — only two destinations exist, so no library is needed. */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(readLocation)

  useEffect(() => {
    function handlePopState() {
      setLocation(readLocation())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((route: Route, projectId?: string | null) => {
    const next = projectId ? `${route}?id=${encodeURIComponent(projectId)}` : route
    if (next !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', next)
    }
    // Navigating always leaves demo mode: it is reachable only by typing the URL.
    setLocation({ route, projectId: projectId ?? null, demo: false })
  }, [])

  return <RouterContext.Provider value={{ ...location, navigate }}>{children}</RouterContext.Provider>
}

export function useRoute(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRoute must be used within a RouterProvider')
  }
  return context
}
