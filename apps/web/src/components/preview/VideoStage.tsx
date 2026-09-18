import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { usePlayback } from '@/state/playback-context'
import { TransportBar } from './TransportBar'

interface VideoStageProps {
  /** Presigned S3 GET, or the local objectURL of a file still being processed. */
  src: string | null
  width: number
  height: number
  /**
   * The caption layer, given the frame's real rendered width so styles can scale from the
   * schema's "px at 1080p". Passed as a render prop, not imported here: this is P2's swap
   * point — replacing our CaptionRenderer with Remotion's <Player> is one JSX element.
   */
  captionLayer?: (frameWidth: number) => ReactNode
}

/**
 * Owns the ONE <video> element in the app and hands it to the playback clock.
 * Everything on screen here is real: real frames, real transport, real duration.
 */
export function VideoStage({ src, width, height, captionLayer }: VideoStageProps) {
  const { attachVideo } = usePlayback()
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const frameRef = useRef<HTMLDivElement | null>(null)

  // Caption font sizes are "px at 1080p width", so they need the real rendered width.
  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setFrameWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setFrameWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [src])

  useEffect(() => setError(null), [src])

  const requestFullscreen = useCallback(() => {
    void frameRef.current?.requestFullscreen?.().catch(() => undefined)
  }, [])

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/60 bg-background p-0">
      {/* A darker well behind the frame: the reel should be the brightest thing on screen, and a
          card-coloured backdrop puts the chrome and the footage at the same value. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[oklch(0.125_0.004_62)] p-4">
        <div
          ref={frameRef}
          className="shadow-stage relative max-h-full overflow-hidden rounded-xl bg-black ring-1 ring-white/8"
          // Letterboxing: the frame keeps the source aspect ratio and shrinks to fit its box,
          // so a 9:16 reel and a 16:9 clip both sit correctly inside the same stage.
          style={{ aspectRatio: `${width} / ${height}`, height: '100%', maxWidth: '100%' }}
        >
          {src && !error ? (
            <video
              ref={attachVideo}
              src={src}
              // The presigned GET serves 206 Partial Content with Accept-Ranges: bytes,
              // so seeking works straight against S3 — no proxy, no crossorigin attribute.
              playsInline
              preload="metadata"
              className="size-full object-contain"
              onError={() =>
                setError('Could not play this video. The link may have expired — reload the project.')
              }
            />
          ) : (
            // Unmounting the <video> on error is deliberate, not just a tidier empty state: a
            // failed element stays attached as the playback clock and reports duration NaN, which
            // freezes the transport and the caption preview at 0. Detaching hands the clock to
            // PlaybackProvider's fallback, so the captions can still be reviewed and demoed.
            <div className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              {error ? '' : 'No video yet'}
            </div>
          )}

          {captionsEnabled && frameWidth > 0 && captionLayer?.(frameWidth)}

          {error && (
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-center text-[11px] text-muted-foreground">
              {error}
            </div>
          )}
        </div>
      </div>

      <TransportBar
        width={width}
        height={height}
        captionsEnabled={captionsEnabled}
        onToggleCaptions={() => setCaptionsEnabled((value) => !value)}
        onFullscreen={requestFullscreen}
      />
    </Card>
  )
}
