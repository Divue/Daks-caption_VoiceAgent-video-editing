import { useState } from 'react'
import { ArrowLeft, Download, Pencil, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { startRender, isApiError } from '@/lib/api'
import { useSync } from '@/state/sync-context'
import { InertControl } from './InertControl'
import { UndoRedoControls } from './UndoRedoControls'

interface AppHeaderProps {
  projectId: string
}

export function AppHeader({ projectId }: AppHeaderProps) {
  const { navigate } = useRoute()
  const { projectId: syncProjectId } = useSync()
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  function handleExport() {
    const id = syncProjectId ?? projectId
    setExportError(null)
    setExporting(true)
    startRender(id)
      .then(() => setExportError(null))
      .catch((cause) => {
        if (isApiError(cause) && cause.status === 501) {
          setExportError('Export is not implemented yet (P2).')
        } else {
          setExportError(isApiError(cause) ? (cause.detail ?? cause.code) : String(cause))
        }
      })
      .finally(() => setExporting(false))
  }

  return (
    <header className="shrink-0">
      <div className="flex h-14 items-center justify-between gap-4 bg-background px-4">
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
        <UndoRedoControls />
        <div className="mx-1 h-5 w-px bg-border" />
        <InertControl
          label="Share"
          icon={Share2}
          reason="Share is not built yet"
          showLabel
        />
        <div className="relative">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={exporting}
            onClick={handleExport}
          >
            <Download className="size-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          {exportError && (
            <div className="absolute top-full right-0 z-50 mt-1 w-56 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
              {exportError}
            </div>
          )}
        </div>
      </div>
      </div>
      {/* The sunset stripe. DESIGN.md's brand recognizer — it closes a surface, so it sits under
          the header rather than being sprayed across the chrome. */}
      <div className="sunset-stripe h-0.5 w-full" />
    </header>
  )
}
