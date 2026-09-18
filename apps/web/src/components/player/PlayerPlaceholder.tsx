import { useState } from 'react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project-context'
import { CaptionPreviewOverlay } from './CaptionPreviewOverlay'
import { VideoControlBar } from './VideoControlBar'

/** Hairline grid behind the frame, the same "precision" texture as the landing hero. */
const STAGE_GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
}

interface PlayerPlaceholderProps {
  selectedWordId: string | null
}

/**
 * Live caption-styling preview — the frame stands in for real video (no player engine
 * exists yet, Step 10), but the overlaid captions are real project data rendered with the
 * real preset and layers, live and reactive. The frame keeps the project's aspect ratio and
 * is a size container, so caption sizes scale with it.
 */
export function PlayerPlaceholder({ selectedWordId }: PlayerPlaceholderProps) {
  const { project } = useProject()
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  // Fill the stage along the frame's long edge; the other edge follows the aspect ratio.
  const isLandscape = project.width > project.height

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-hairline bg-background">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6" style={STAGE_GRID}>
        <div
          className={cn(
            'relative max-h-full max-w-full overflow-hidden rounded-2xl bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] ring-1 ring-white/8',
            isLandscape ? 'w-full' : 'h-full',
          )}
          style={{ aspectRatio: `${project.width} / ${project.height}`, containerType: 'size' }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(90% 70% at 30% 20%, rgb(255 255 255 / 0.06), transparent 60%), linear-gradient(160deg, #1A1A21 0%, #0E0E12 100%)',
            }}
          />
          {captionsEnabled && <CaptionPreviewOverlay selectedWordId={selectedWordId} />}
        </div>
      </div>
      <VideoControlBar
        durationMs={project.durationMs}
        width={project.width}
        height={project.height}
        captionsEnabled={captionsEnabled}
        onToggleCaptions={() => setCaptionsEnabled((value) => !value)}
      />
    </div>
  )
}
