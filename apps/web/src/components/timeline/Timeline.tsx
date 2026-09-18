import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioLines, Camera, Type } from 'lucide-react'
import type { CaptionBlock, Word } from '@captions/shared'
import { EditorToolbar } from '@/components/toolbar/EditorToolbar'
import { CaptionTrack } from './CaptionTrack'
import { MediaTrack } from './MediaTrack'
import { Playhead } from './Playhead'
import { TimeRuler } from './TimeRuler'
import { TRACK_HEADER_WIDTH, TrackHeader } from './TrackHeader'
import { usePlayback } from '@/state/playback-context'

const MAX_PX_PER_MS = 0.5
/** Auto-scroll re-centres once the playhead leaves this central band of the viewport. */
const KEEP_VISIBLE_BAND = 0.6
/** How long manual scrolling suspends auto-scroll. */
const MANUAL_SCROLL_PAUSE_MS = 2500

interface TimelineProps {
  durationMs: number
  width: number
  height: number
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  /** Set when a caption row is clicked, so the timeline can scroll that block into view. */
  revealBlockId: string | null
}

/** Owns zoom and scroll, and nothing else. Time comes from PlaybackContext. */
export function Timeline({
  durationMs,
  width,
  height,
  blocks,
  wordsOf,
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

  const handleSeek = useCallback((ms: number) => seek(Math.max(0, Math.min(durationMs, ms))), [seek, durationMs])

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
    element.scrollTo({ left: Math.max(0, block.startMs * effectiveZoom - element.clientWidth / 3), behavior: 'smooth' })
  }, [revealBlockId, blocks, effectiveZoom])

  const contentWidth = durationMs * effectiveZoom

  return (
    <div className="flex min-h-0 flex-col border-t bg-background">
      <EditorToolbar
        zoom={effectiveZoom}
        minZoom={fitPxPerMs}
        maxZoom={MAX_PX_PER_MS}
        onZoomChange={(zoom) => setPxPerMs(zoom)}
      />

      <div className="flex min-h-0 flex-1">
        {/* Fixed gutter of track headers, aligned to the tracks by matching heights. */}
        <div className="flex shrink-0 flex-col" style={{ width: TRACK_HEADER_WIDTH }}>
          <div className="h-7 shrink-0 border-r border-b bg-muted/40" />
          <TrackHeader name="Captions" icon={Type} iconClassName="text-amber-600" />
          <TrackHeader name="Video 1" icon={Camera} iconClassName="text-sunset-amber" />
          <TrackHeader name="Audio 1" icon={AudioLines} iconClassName="text-sunset-red" />
        </div>

        <div
          ref={scrollRef}
          data-timeline-content
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={() => {
            manualScrollUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
          }}
        >
          <div className="relative" style={{ width: contentWidth }}>
            <TimeRuler durationMs={durationMs} pxPerMs={effectiveZoom} onSeek={handleSeek} />
            <CaptionTrack
              blocks={blocks}
              wordsOf={wordsOf}
              pxPerMs={effectiveZoom}
              durationMs={durationMs}
              activeBlockId={activeBlockId}
              selectedWordId={selectedWordId}
              onSelectWord={onSelectWord}
              onSeek={handleSeek}
            />
            <MediaTrack
              label="Video 1"
              durationMs={durationMs}
              pxPerMs={effectiveZoom}
              detail={`${width}×${height}`}
              variant="video"
              onSeek={handleSeek}
            />
            <MediaTrack
              label="Audio 1"
              durationMs={durationMs}
              pxPerMs={effectiveZoom}
              variant="audio"
              onSeek={handleSeek}
            />
            <Playhead timeMs={timeMs} pxPerMs={effectiveZoom} durationMs={durationMs} onSeek={handleSeek} />
          </div>
        </div>
      </div>
    </div>
  )
}
