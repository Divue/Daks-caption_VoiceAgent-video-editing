import { useMemo } from 'react'
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion'
import { MIN_BLOCK_MS, PRESETS, Project, deriveBlocks, resolveEmphasis } from '@captions/shared'
import type { CaptionBlock, Word } from '@captions/shared'
import { CaptionRenderer } from '@/components/preview/CaptionRenderer'
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
export function CaptionVideo({ project: rawProject, videoUrl }: CaptionVideoProps) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()

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
