import { Card } from '@/components/ui/card'
import { useProject } from '@/state/project-context'

/**
 * Occupies the Player's layout slot until remotion/ has a real composition
 * to render (Step 10). Sized to the project's actual aspect ratio so the
 * surrounding layout won't shift once the real <Player> is wired in.
 */
export function PlayerPlaceholder() {
  const { project } = useProject()

  return (
    <Card className="flex h-full items-center justify-center bg-muted/30 p-6">
      <div
        className="flex w-full max-w-xs flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center"
        style={{ aspectRatio: `${project.width} / ${project.height}` }}
      >
        <span className="font-medium text-foreground">Preview coming soon</span>
        <span className="text-sm text-muted-foreground">
          {project.width}×{project.height} · {(project.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
    </Card>
  )
}
