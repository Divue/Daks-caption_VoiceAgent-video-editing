import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type Route = '/' | '/editor'

function resolveRoute(pathname: string): Route {
  return pathname === '/editor' ? '/editor' : '/'
}

interface RouterContextValue {
  route: Route
  navigate: (route: Route) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

/** Minimal history-API router — only two destinations exist, so no library is needed. */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => resolveRoute(window.location.pathname))

  useEffect(() => {
    function handlePopState() {
      setRoute(resolveRoute(window.location.pathname))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(next: Route) {
    if (next !== window.location.pathname) {
      window.history.pushState({}, '', next)
    }
    setRoute(next)
  }

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
}

export function useRoute(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRoute must be used within a RouterProvider')
  }
  return context
}
