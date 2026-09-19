import { ArrowLeft, FilePlus2, Pencil, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { useSync } from '@/state/sync-context'
import { ExportButton } from './ExportButton'
import { InertControl } from './InertControl'
import { UndoRedoControls } from './UndoRedoControls'

interface AppHeaderProps {
  projectId: string
}

export function AppHeader({ projectId }: AppHeaderProps) {
  const { navigate } = useRoute()
  const { projectId: syncProjectId } = useSync()

  return (
    <header className="shrink-0">
      <div className="flex h-12 items-center justify-between gap-4 bg-card px-3">
      <div className="flex min-w-0 items-center gap-3">
        {/*
          `/editor` with no `?id=` IS the projects screen — dropzone plus recent projects
          (EmptyEditor). This used to go to `/`, the marketing landing page, which made the label
          a lie and left the editor with no route to uploading a different video at all.
        */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate('/editor')}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Projects</span>
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-display truncate text-lg text-foreground">
            {projectId}
          </span>
          <InertControl
            label="Rename"
            icon={Pencil}
            reason="Rename is not built yet"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate('/editor')}
          title="Upload a different video"
        >
          <FilePlus2 className="size-4" />
          <span className="hidden md:inline">New video</span>
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <UndoRedoControls />
        <div className="mx-1 h-5 w-px bg-border" />
        <InertControl
          label="Share"
          icon={Share2}
          reason="Share is not built yet"
          showLabel
        />
        <ExportButton projectId={syncProjectId ?? projectId} />
      </div>
      </div>
      <div className="h-px w-full bg-border/60" />
    </header>
  )
}
