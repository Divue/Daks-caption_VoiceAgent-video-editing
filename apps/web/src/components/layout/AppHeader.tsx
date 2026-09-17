import { ArrowLeft, Download, Pencil, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { UndoRedoControls } from './UndoRedoControls'

interface AppHeaderProps {
  projectId: string
}

/** Rename, Share and Export are visual only — no backend exists yet. "Back" returns to the landing page. */
export function AppHeader({ projectId }: AppHeaderProps) {
  const { navigate } = useRoute()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Back to Projects</span>
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{projectId}</span>
          <button
            type="button"
            aria-label="Rename project"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <UndoRedoControls />
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Share2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
        <Button type="button" size="sm" className="gap-1.5">
          <Download className="size-4" />
          Export
        </Button>
      </div>
    </header>
  )
}
