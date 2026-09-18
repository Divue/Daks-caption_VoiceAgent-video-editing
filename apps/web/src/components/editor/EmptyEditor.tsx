import { useEffect, useState } from 'react'
import { useRoute } from '@/router'
import { Button } from '@/components/ui/button'
import { readRecentProjects } from '@/lib/recents'
import type { RecentProject } from '@/lib/recents'

/**
 * The editor with no project open. There is no project picker (plan §8.12) — projects are
 * addressed by `?id=`, and recent ids are kept in localStorage as a convenience.
 *
 * Grows an upload dropzone in Task 6a; today it is the honest "nothing open" state.
 */
export function EmptyEditor() {
  const { navigate } = useRoute()
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => setRecents(readRecentProjects()), [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <div>
        <h1 className="text-lg font-semibold">No project open</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Open a project with <code className="rounded bg-muted px-1 py-0.5 text-xs">/editor?id=…</code>
        </p>
      </div>

      {recents.length > 0 && (
        <div className="w-full max-w-sm text-left">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Recent</p>
          <ul className="flex flex-col gap-1">
            {recents.map((recent) => (
              <li key={recent.projectId}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-normal"
                  onClick={() => navigate('/editor', recent.projectId)}
                >
                  <span className="truncate">{recent.filename}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">{recent.projectId}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
