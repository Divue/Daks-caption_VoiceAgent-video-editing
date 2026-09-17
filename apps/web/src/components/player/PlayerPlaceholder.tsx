import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { useProject } from '@/state/project-context'
import { CaptionPreviewOverlay } from './CaptionPreviewOverlay'
import { VideoControlBar } from './VideoControlBar'

/**
 * Live caption-styling preview — the frame stands in for real video (no
 * player engine exists yet, Step 10), but the overlaid captions are real
 * project data rendered with the real active preset, live and reactive.
 */
export function PlayerPlaceholder() {
  const { project } = useProject()
  const [captionsEnabled, setCaptionsEnabled] = useState(true)

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden bg-muted/30 p-0">
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          className="relative w-full max-w-xs overflow-hidden rounded-md border bg-neutral-900 shadow-sm"
          style={{ aspectRatio: `${project.width} / ${project.height}` }}
        >
          {captionsEnabled && <CaptionPreviewOverlay />}
        </div>
      </div>
      <VideoControlBar
        durationMs={project.durationMs}
        width={project.width}
        height={project.height}
        captionsEnabled={captionsEnabled}
        onToggleCaptions={() => setCaptionsEnabled((value) => !value)}
      />
    </Card>
  )
}
