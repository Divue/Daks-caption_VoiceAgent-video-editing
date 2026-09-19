import { useMemo } from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { MIN_BLOCK_MS, PRESETS, Project, deriveBlocks, resolveEmphasis } from '@captions/shared'
import type { CaptionBlock, LayerItem, Word } from '@captions/shared'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
import { layerBoxStyle } from '@/lib/layers'
import { resolvePreset } from '@/lib/resolve-preset'
import type { PresetOverride } from '@/lib/resolve-preset'
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
 * This is deliberately NOT a second implementation of the captions. It calls the same functions the
 * editor calls, in the same order — `deriveBlocks` -> `resolveEmphasis` -> `resolvePreset` — and hands
 * the result to the SAME `CaptionRenderer` component the preview uses. Anything the preview draws, this
 * draws; anything changed in the caption look changes both. The only thing that differs is the clock:
 * the editor reads `video.currentTime`, this reads the frame Remotion is rendering, so a frame is a
 * pure function of its number and the output is identical however fast or slow the machine is.
 */
export function CaptionVideo({ project: rawProject, videoUrl, mediaUrls = {} }: CaptionVideoProps) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  // Validate once: a malformed project should fail the render with a readable error, not draw nonsense.
  const project = useMemo(() => Project.parse(rawProject), [rawProject])

  const timeline = useMemo(() => {
    const base = PRESETS[project.presetId]
    // Only the SAVED override can be exported. Session-only tweaks (glow layers, stretch, align) live in
    // the browser tab and are not part of the project; the export dialog says so.
    const stored = (project.presetOverride ?? {}) as PresetOverride
    const preset = resolvePreset(base, stored)
    const blocks = deriveBlocks(project.words, {
      maxWords: project.presetOverride?.wordsPerLine ?? base.wordsPerLine,
      mergeShorterThanMs: MIN_BLOCK_MS, // the editor's default view; "merge short captions" is on
    })
    const emphasis = resolveEmphasis(project.words, blocks, preset.emphasisEveryBlocks)
    const wordById = new Map<string, Word>(project.words.map((word) => [word.id, word]))
    const wordsOf = (block: CaptionBlock) =>
      block.wordIds.map((id) => wordById.get(id)).filter((word): word is Word => word !== undefined)
    return { preset, blocks, emphasisIds: emphasis.ids, wordsOf }
  }, [project])

  const fonts = useMemo(() => [...collectFontFamilies([timeline.preset, project.words.map((w) => w.style)])], [timeline.preset, project.words])
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
        preset={timeline.preset}
        emphasisIds={timeline.emphasisIds}
        timeMs={(frame / fps) * 1000}
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

