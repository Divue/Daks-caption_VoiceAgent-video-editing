import { memo, useEffect, useRef } from 'react'
import type { LayerItem } from '@captions/shared'
import { activeLayerItems, layerBoxStyle, sourceTimeMs } from '@/lib/layers'

/** Mount a clip this long before it appears, so its first frame is decoded when it is needed. */
const PRELOAD_MS = 2000
/** While playing, only correct a clip that has drifted this far — seeking every frame stutters. */
const DRIFT_TOLERANCE_S = 0.3

interface LayerStageProps {
  layers: readonly LayerItem[]
  timeMs: number
  isPlaying: boolean
  rate: number
  frameWidth: number
  frameHeight: number
  urlOf: (item: LayerItem) => string
}

/**
 * The media layers, drawn between the main video and the captions: track 1, then track 2 on top
 * of it, then the captions over both — a sticker never hides the words.
 *
 * Props only, no context: the geometry comes from `layerBoxStyle`, the same function the Remotion
 * export uses, so the preview and the exported MP4 put an item in the same place by construction.
 * Pointer-transparent; selecting and dragging is `LayerHandles`, which sits above the captions.
 */
export function LayerStage({ layers, timeMs, isPlaying, rate, frameWidth, frameHeight, urlOf }: LayerStageProps) {
  if (layers.length === 0 || frameWidth <= 0) return null
  const active = new Set(activeLayerItems(layers, timeMs).map((item) => item.id))
  // Draw order is track, then list order — the same rule `activeLayerItems` sorts by.
  const drawable = layers
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => active.has(item.id) || (item.kind === 'video' && item.startMs > timeMs && item.startMs - timeMs <= PRELOAD_MS))
    .sort((a, b) => a.item.track - b.item.track || a.index - b.index)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-layer-stage>
      {drawable.map(({ item }) => {
        const src = urlOf(item)
        const shown = active.has(item.id)
        const style = { ...layerBoxStyle(item, frameWidth, frameHeight), visibility: shown ? 'visible' : 'hidden' } as const
        return item.kind === 'image' ? (
          <img key={item.id} src={src} alt="" draggable={false} style={style} className="object-fill" data-layer-id={item.id} />
        ) : (
          <LayerVideo
            key={item.id}
            item={item}
            src={src}
            style={style}
            timeMs={timeMs}
            active={shown}
            isPlaying={isPlaying}
            rate={rate}
          />
        )
      })}
    </div>
  )
}

interface LayerVideoProps {
  item: LayerItem
  src: string
  style: React.CSSProperties
  timeMs: number
  active: boolean
  isPlaying: boolean
  rate: number
}

/**
 * One overlay clip, slaved to the main playback clock.
 *
 * The main <video> is the clock (PlaybackProvider). This element never runs free: whenever it is
 * on screen it is told which SOURCE moment to show (`sourceTimeMs`), plays when the main video
 * plays, at the same rate, and pauses when it pauses. While paused or scrubbing it is seeked
 * exactly; while playing it is only corrected past a small drift, because re-seeking every frame
 * is what makes an overlay stutter.
 */
const LayerVideo = memo(function LayerVideo({ item, src, style, timeMs, active, isPlaying, rate }: LayerVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.playbackRate = rate
    const target = sourceTimeMs(item, Math.max(timeMs, item.startMs)) / 1000
    if (!active) {
      // Parked just before it appears, on its first frame, ready.
      if (!video.paused) video.pause()
      if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target
      return
    }
    const drift = Math.abs(video.currentTime - target)
    if (!isPlaying) {
      if (!video.paused) video.pause()
      if (drift > 0.04) video.currentTime = target
      return
    }
    if (drift > DRIFT_TOLERANCE_S) video.currentTime = target
    if (video.paused) void video.play().catch(() => undefined)
  }, [item, timeMs, active, isPlaying, rate])

  return (
    <video
      ref={ref}
      src={src}
      muted={item.muted}
      playsInline
      preload="auto"
      style={style}
      className="object-fill"
      data-layer-id={item.id}
    />
  )
})
