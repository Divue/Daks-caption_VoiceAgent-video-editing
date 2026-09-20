import { useMemo } from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { MIN_BLOCK_MS, Project } from '@captions/shared'
import type { LayerItem } from '@captions/shared'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
import { buildCaptionTimeline, findBlockIndexAt } from '@/lib/caption-timeline'
import { layerBoxStyle } from '@/lib/layers'
import { collectFontFamilies, useCaptionFonts } from './fonts'
import './caption-utilities.css'

export interface CaptionVideoProps {
  /** The SAVED project, as the API returns it. */
  project: unknown
  /** A URL Chromium can fetch: the presigned GET of the source video. */
  videoUrl: string
  fps: number
  /** mediaId -> a URL Chromium can fetch, for every file the project's layers use. */
  mediaUrls?: Record<string, string>
}

/**
 * The exported video: the source video with the editor's captions drawn over it.
 *
 * This is deliberately NOT a second implementation of the captions. It calls the same ONE function the
 * editor's `useCaptionBlocks` calls — `buildCaptionTimeline`, which does `deriveBlocks` ->
 * `resolveEmphasis` -> `resolvePreset` per preset segment — and hands the result to the SAME
 * `CaptionRenderer` component the preview uses. Anything the preview draws, this draws; anything
 * changed in the caption look changes both. The only thing that differs is the clock:
 * the editor reads `video.currentTime`, this reads the frame Remotion is rendering, so a frame is a
 * pure function of its number and the output is identical however fast or slow the machine is.
 */
export function CaptionVideo({ project: rawProject, videoUrl, mediaUrls = {} }: CaptionVideoProps) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  // Validate once: a malformed project should fail the render with a readable error, not draw nonsense.
  const project = useMemo(() => Project.parse(rawProject), [rawProject])

  // Only the SAVED overrides and segments can be exported. Session-only tweaks (glow layers,
  // stretch, align) live in the browser tab and are not part of the project; the export dialog
  // says so. `mergeShorterThanMs` is the editor's default view — "merge short captions" is on.
  const timeline = useMemo(
    () => buildCaptionTimeline(project, { mergeShorterThanMs: MIN_BLOCK_MS }),
    [project],
  )

  const timeMs = (frame / fps) * 1000
  // The preset of the block ON SCREEN, not one preset for the whole video: with `presetSegments`
  // each block has its own, and CaptionRenderer draws exactly one block. Outside every block
  // there is nothing to draw, so the project's own preset is only ever a placeholder here.
  const activeIndex = findBlockIndexAt(timeline.blocks, timeMs)
  const activePreset =
    activeIndex === -1 ? timeline.presetAt(timeMs) : timeline.presetOfBlock(timeline.blocks[activeIndex].id)

  // EVERY segment's fonts, not just the active one's: a face that starts loading when its segment
  // arrives would draw its first frames in the fallback. `collectFontFamilies` is a recursive walk,
  // so an array of presets needs no change to it.
  const presets = useMemo(
    () => timeline.blocks.map((block) => timeline.presetOfBlock(block.id)),
    [timeline],
  )
  const fonts = useMemo(() => [...collectFontFamilies([presets, project.words.map((w) => w.style)])], [presets, project.words])
  const sample = useMemo(() => project.words.map((w) => w.text).join(' '), [project.words])
  useCaptionFonts(fonts, sample)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      <MediaLayers items={project.layers ?? []} mediaUrls={mediaUrls} fps={fps} width={width} height={height} />
      <CaptionRenderer
        blocks={timeline.blocks}
        wordsOf={timeline.wordsOf}
        project={project}
        preset={activePreset}
        emphasisIds={timeline.emphasisIds}
        timeMs={timeMs}
        frameWidth={width}
        selectedWordId={null}
      />
    </AbsoluteFill>
  )
}

/**
 * The media layers, between the video and the captions — the same order the editor draws.
 *
 * Each item is a <Sequence> placed at its OUTPUT time, so Remotion mounts it only while it is on
 * screen. A clip's SOURCE trim is `trimBefore` (Remotion 4's name; `startFrom` is deprecated), so the
 * frame shown at the item's first frame is `trimStartMs` into the file — the same rule as
 * `sourceTimeMs` in the editor. The box is `layerBoxStyle`, imported from the editor, so a sticker
 * sits in the same place in the preview and in the MP4 by construction, not by keeping two copies in
 * step.
 */
function MediaLayers({
  items,
  mediaUrls,
  fps,
  width,
  height,
}: {
  items: readonly LayerItem[]
  mediaUrls: Record<string, string>
  fps: number
  width: number
  height: number
}) {
  const frames = (ms: number) => Math.round((ms / 1000) * fps)
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.track - b.item.track || a.index - b.index)
    .map(({ item }) => item)
  return (
    <>
      {ordered.map((item) => {
        const src = mediaUrls[item.mediaId]
        // A file the API could not sign is left out rather than failing the whole export on it.
        if (!src) return null
        const style = layerBoxStyle(item, width, height)
        return (
          <Sequence
            key={item.id}
            from={frames(item.startMs)}
            durationInFrames={Math.max(1, frames(item.endMs) - frames(item.startMs))}
            layout="none"
            name={item.name ?? item.id}
          >
            {item.kind === 'image' ? (
              <Img src={src} style={{ ...style, objectFit: 'fill' }} />
            ) : (
              <OffthreadVideo src={src} trimBefore={frames(item.trimStartMs)} muted={item.muted} style={{ ...style, objectFit: 'fill' }} />
            )}
          </Sequence>
        )
      })}
    </>
  )
}

