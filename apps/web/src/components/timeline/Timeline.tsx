import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioLines, Film, Minus, Plus, Type } from 'lucide-react'
import type { CaptionBlock, Word } from '@captions/shared'
import { CaptionRibbon } from './CaptionRibbon'
import { MediaLane } from './MediaLane'
import { Playhead } from './Playhead'
import { TimeRuler } from './TimeRuler'
import { TRACK_HEADER_WIDTH, TrackHeader } from './TrackHeader'
import { usePlayback } from '@/state/playback-context'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

const MAX_PX_PER_MS = 0.5
/** Auto-scroll re-centres once the playhead leaves this central band of the viewport. */
const KEEP_VISIBLE_BAND = 0.6
/** How long manual scrolling suspends auto-scroll. */
const MANUAL_SCROLL_PAUSE_MS = 2500
/** One press of the zoom buttons. */
const ZOOM_STEP = 1.6

/** Lane heights, shared by the gutter and the lanes so the two stay aligned. */
const CAPTIONS_H = 52
const MEDIA_H = 26

interface TimelineProps {
  durationMs: number
  /** Frame size, shown on the video lane. Real data from the Project. */
  width: number
  height: number
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  emphasisIds: Set<string>
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  /** Set when a caption row is clicked, so the timeline can scroll that block into view. */
  revealBlockId: string | null
}

/**
 * The caption ribbon: where the captions are, what tone they carry, where the playhead is.
 *
 * It owns zoom and scroll and nothing else; time comes from PlaybackContext.
 *
 * Three lanes: captions (the one that matters), then the video and audio the captions sit on.
 * What it does NOT have is the part that was actually ugly — an eight-button editing toolbar for
 * operations that are out of scope, and a header gutter of mute/lock/visibility controls that did
 * nothing and squeezed the lane names down to "C." / "V." / "A.".
 */
export function Timeline({
  durationMs,
  width,
  height,
  blocks,
  wordsOf,
  emphasisIds,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  revealBlockId,
}: TimelineProps) {
  const { timeMs, isPlaying, seek } = usePlayback()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [pxPerMs, setPxPerMs] = useState<number | null>(null)
  const manualScrollUntil = useRef(0)

  // Fit-to-width is the default zoom, and the floor: there is no reason to zoom out past
  // the whole clip fitting on screen.
  const fitPxPerMs = viewportWidth > 0 && durationMs > 0 ? viewportWidth / durationMs : 0.02
  const effectiveZoom = pxPerMs ?? fitPxPerMs

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setViewportWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setViewportWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const handleSeek = useCallback(
    (ms: number) => seek(Math.max(0, Math.min(durationMs, ms))),
    [seek, durationMs],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      setPxPerMs((current) =>
        Math.max(fitPxPerMs, Math.min(MAX_PX_PER_MS, (current ?? fitPxPerMs) * factor)),
      )
    },
    [fitPxPerMs],
  )

  // Auto-scroll while playing, suspended for a moment after any manual scroll so the two
  // do not fight each other.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !isPlaying) return
    if (Date.now() < manualScrollUntil.current) return

    const playheadX = timeMs * effectiveZoom
    const left = element.scrollLeft
    const visible = element.clientWidth
    const margin = (visible * (1 - KEEP_VISIBLE_BAND)) / 2

    if (playheadX < left + margin || playheadX > left + visible - margin) {
      element.scrollTo({ left: Math.max(0, playheadX - visible / 2), behavior: 'auto' })
    }
  }, [timeMs, isPlaying, effectiveZoom])

  // Clicking a caption row scrolls that block into view.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !revealBlockId) return
    const block = blocks.find((candidate) => candidate.id === revealBlockId)
    if (!block) return
    manualScrollUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
    element.scrollTo({
      left: Math.max(0, block.startMs * effectiveZoom - element.clientWidth / 3),
      behavior: 'smooth',
    })
  }, [revealBlockId, blocks, effectiveZoom])

  const isZoomed = effectiveZoom > fitPxPerMs * 1.01

  return (
    <div className="flex min-h-0 shrink-0 flex-col border-t border-border/60 bg-card">
      <div className="flex h-8 shrink-0 items-center justify-between gap-3 px-3">
        <span className="eyebrow text-muted-foreground">Captions over time</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatTimestamp(timeMs)}
          </span>
          <div className="flex items-center rounded-md border border-border/70">
            <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!isZoomed}>
              <Minus className="size-3" />
            </ZoomButton>
            <button
              type="button"
              onClick={() => setPxPerMs(null)}
              disabled={!isZoomed}
              className="h-6 border-x border-border/70 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Fit
            </button>
            <ZoomButton
              label="Zoom in"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={effectiveZoom >= MAX_PX_PER_MS}
            >
              <Plus className="size-3" />
            </ZoomButton>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Fixed gutter of lane names, aligned to the lanes by matching heights. */}
        <div
          className="flex shrink-0 flex-col border-r border-border/60"
          style={{ width: TRACK_HEADER_WIDTH }}
        >
          <div className="h-6 shrink-0 border-b border-border/50" />
          {/* No block count here: the captions panel already shows it, and squeezing it in is
              what truncated the lane name to "Ca…" — the exact failure this rebuild was fixing. */}
          <TrackHeader name="Captions" icon={Type} height={CAPTIONS_H} />
          <TrackHeader name="Video" icon={Film} height={MEDIA_H} />
          <TrackHeader name="Audio" icon={AudioLines} height={MEDIA_H} />
        </div>

        <div
          ref={scrollRef}
          data-timeline-content
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={() => {
            manualScrollUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
          }}
        >
          <div className="relative" style={{ width: durationMs * effectiveZoom }}>
            <TimeRuler durationMs={durationMs} pxPerMs={effectiveZoom} onSeek={handleSeek} />
            <CaptionRibbon
              blocks={blocks}
              wordsOf={wordsOf}
              emphasisIds={emphasisIds}
              pxPerMs={effectiveZoom}
              durationMs={durationMs}
              height={CAPTIONS_H}
              activeBlockId={activeBlockId}
              selectedWordId={selectedWordId}
              onSelectWord={onSelectWord}
              onSeek={handleSeek}
            />
            <MediaLane
              durationMs={durationMs}
              pxPerMs={effectiveZoom}
              variant="video"
              label={`${width}×${height}`}
              height={MEDIA_H}
              onSeek={handleSeek}
            />
            <MediaLane
              durationMs={durationMs}
              pxPerMs={effectiveZoom}
              variant="audio"
              height={MEDIA_H}
              onSeek={handleSeek}
            />
            <Playhead
              timeMs={timeMs}
              pxPerMs={effectiveZoom}
              durationMs={durationMs}
              onSeek={handleSeek}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors',
        'hover:text-foreground disabled:opacity-40',
      )}
    >
      {children}
    </button>
  )
}
