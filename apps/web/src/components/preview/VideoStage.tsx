import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mediaKey } from '@/lib/media-key'
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
  /** Media layers, drawn OVER the video and UNDER the captions. Shown even with captions off. */
  mediaLayer?: (frameWidth: number, frameHeight: number) => ReactNode
  /** Selection handles for the media layers, drawn over EVERYTHING so they can be grabbed. */
  editLayer?: (frameWidth: number, frameHeight: number) => ReactNode
  /**
   * A fresh link to the same file. Presigned URLs expire after an hour; without this an editor
   * left open simply dies with a "reload the project" message. Resolves null when unavailable.
   */
  getFreshSrc?: () => Promise<string | null>
}

const AUTO_RECOVERY_WINDOW_MS = 30_000
const FAILED = "Couldn't load this video."

/**
 * Owns the ONE <video> element in the app and hands it to the playback clock.
 * Everything on screen here is real: real frames, real transport, real duration.
 */
export function VideoStage({ src, width, height, captionLayer, mediaLayer, editLayer, getFreshSrc }: VideoStageProps) {
  const { attachVideo, ready, buffering, isPlaying, playError, timeMs } = usePlayback()
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [frameWidth, setFrameWidth] = useState(0)
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)
  const wellRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // --- one file, one <video src> ---------------------------------------------------------------
  // The project is re-fetched after any write that races another (a 409 resync), and every fetch
  // mints a new presigned URL for the SAME file. Passing that straight to <video src> made the
  // browser reload it — playback jumped to 0:00 and stopped, mid-sentence. Hold the URL we are
  // playing until the FILE changes. (Adjusting state during render is React's own pattern for
  // "derive state from a prop"; it avoids a frame of the wrong video.)
  const [held, setHeld] = useState(src)
  if (mediaKey(held) !== mediaKey(src)) {
    setHeld(src)
    setError(null) // a different file starts clean
  }

  // Where to pick up after a recovery reload replaces the element's source.
  const resumeRef = useRef<{ seconds: number; play: boolean } | null>(null)
  const lastAutoRef = useRef<{ key: string | null; at: number }>({ key: null, at: 0 })
  const timeRef = useRef(timeMs)
  useEffect(() => {
    timeRef.current = timeMs
  }, [timeMs])

  const recover = useCallback(
    async (automatic: boolean) => {
      const key = mediaKey(held)
      // One automatic attempt per file per window: a link that is bad for a reason a fresh one
      // cannot fix (a deleted object, an unsupported codec) must not loop forever.
      if (automatic) {
        const last = lastAutoRef.current
        if (last.key === key && Date.now() - last.at < AUTO_RECOVERY_WINDOW_MS) {
          setError(FAILED)
          return
        }
        lastAutoRef.current = { key, at: Date.now() }
      }
      // A local preview (a blob: URL) has no server link to swap in; a fresh one would be a
      // different file and the source-tracking above would flip straight back.
      if (!getFreshSrc || held?.startsWith('blob:')) {
        setError(FAILED)
        return
      }
      const video = videoRef.current
      const seconds = video && Number.isFinite(video.currentTime) ? video.currentTime : timeRef.current / 1000
      const wasPlaying = video ? !video.paused && !video.ended : false
      setRecovering(true)
      try {
        const fresh = await getFreshSrc()
        if (!fresh) throw new Error('no link')
        resumeRef.current = { seconds, play: wasPlaying }
        setError(null)
        if (fresh === held && videoRef.current) {
          // Two links minted within the same second are byte-for-byte identical, and so is a link
          // that was fine all along (the failure was the network, not the signature). Setting the
          // same string changes nothing and React would never reload the element — the user would
          // sit on "Loading video…" forever — so ask the element to try again itself.
          videoRef.current.load()
        } else {
          setHeld(fresh)
        }
      } catch {
        setError(FAILED)
      } finally {
        setRecovering(false)
      }
    },
    [held, getFreshSrc],
  )

  const onLoadedMetadata = useCallback(() => {
    const resume = resumeRef.current
    const video = videoRef.current
    if (!resume || !video) return
    resumeRef.current = null
    video.currentTime = resume.seconds
    if (resume.play) void video.play().catch(() => undefined)
  }, [])

  const setVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element
      attachVideo(element)
    },
    [attachVideo],
  )

  // --- fit any aspect ratio into whatever room the layout gives us -------------------------------
  // The old CSS (height: 100% + aspect-ratio + max-width: 100%) drops the aspect ratio the moment
  // max-width clamps, so a 16:9 clip got a box of the wrong shape. Work it out instead: the
  // largest box of the source's shape that fits the space.
  useLayoutEffect(() => {
    const well = wellRef.current
    if (!well || !width || !height) return
    const measure = (availableWidth: number, availableHeight: number) => {
      if (availableWidth <= 0 || availableHeight <= 0) return
      const scale = Math.min(availableWidth / width, availableHeight / height)
      setFit({ w: Math.floor(width * scale), h: Math.floor(height * scale) })
    }
    const styles = getComputedStyle(well)
    measure(
      well.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight),
      well.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom),
    )
    // contentRect is the content box: padding already excluded.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) measure(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(well)
    return () => observer.disconnect()
  }, [width, height])

  // Caption font sizes are "px at 1080p width", so they need the real rendered width — including
  // in fullscreen, where the frame is stretched by the browser rather than by `fit`.
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
  }, [])

  const requestFullscreen = useCallback(() => {
    void frameRef.current?.requestFullscreen?.().catch(() => undefined)
  }, [])

  const loading = !!held && !error && !ready && !recovering
  const showBuffering = buffering && isPlaying && !recovering

  return (
    // One container, not three. It was a card, holding a well, holding a rounded frame — three
    // nested boxes around the one thing the user is looking at (audit 16 §2.12). The well IS the
    // container now, and the frame sits directly in it.
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[oklch(0.125_0.004_62)]">
      <div ref={wellRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
        <div
          ref={frameRef}
          className="shadow-stage relative overflow-hidden rounded-xl bg-black ring-1 ring-white/8"
          // Until the first measurement lands, fall back to the CSS fit so nothing flashes at the
          // wrong size; from then on the measured box is exact for every aspect ratio.
          style={
            fit
              ? { width: fit.w, height: fit.h }
              : { aspectRatio: `${width} / ${height}`, height: '100%', maxWidth: '100%' }
          }
        >
          {held && !error ? (
            <video
              ref={setVideo}
              src={held}
              // The presigned GET serves 206 Partial Content with Accept-Ranges: bytes,
              // so seeking works straight against S3 — no proxy, no crossorigin attribute.
              playsInline
              preload="auto"
              className="size-full object-contain"
              onLoadedMetadata={onLoadedMetadata}
              onError={() => void recover(true)}
            />
          ) : (
            // Unmounting the <video> on a FINAL failure is deliberate: a failed element stays
            // attached as the playback clock and reports duration NaN, which freezes the transport
            // and the caption preview at 0. Detaching hands the clock to PlaybackProvider's
            // fallback, so the captions can still be reviewed and demoed.
            <div className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              {error ? '' : 'No video yet'}
            </div>
          )}

          {frameWidth > 0 && mediaLayer?.(frameWidth, (frameWidth * height) / width)}
          {captionsEnabled && frameWidth > 0 && captionLayer?.(frameWidth)}
          {frameWidth > 0 && editLayer?.(frameWidth, (frameWidth * height) / width)}

          {/* Loading: a frame that is not there yet must not look like a broken one. */}
          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-white/[0.04] to-white/[0.09] text-xs text-muted-foreground"
            >
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              Loading video…
            </div>
          )}

          {(showBuffering || recovering) && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-xs text-white/90"
            >
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              {recovering ? 'Reconnecting to the video…' : 'Buffering…'}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center"
            >
              <p className="text-xs text-white/90">
                {error} The link may have expired, or the file can’t be played by this browser.
              </p>
              <Button type="button" size="sm" variant="secondary" disabled={recovering} onClick={() => void recover(false)}>
                <RefreshCw className={recovering ? 'animate-spin' : undefined} />
                Try again
              </Button>
            </div>
          )}

          {playError && !error && (
            <div role="alert" className="absolute inset-x-0 bottom-0 bg-black/75 p-2 text-center text-[11px] text-white/90">
              {playError}
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
    </div>
  )
}
