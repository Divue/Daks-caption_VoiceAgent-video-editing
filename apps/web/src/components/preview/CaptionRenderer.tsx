import { useMemo } from 'react'
import type { CaptionBlock, Preset, Project, Word } from '@captions/shared'
import { findBlockIndexAt } from '@/hooks/useCaptionBlocks'
import {
  glowWrapperCss,
  renderedText,
  resolveWordStyle,
  revealOpacity,
  styleToCss,
} from '@/lib/caption-style'

interface CaptionRendererProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  project: Project
  /**
   * The preset to draw with. Passed in rather than read from PRESETS[project.presetId] so the
   * style panel's session-level preset tweaks reach the preview without this component growing a
   * context dependency (see the PROPS ONLY note below).
   */
  preset: Preset
  timeMs: number
  /** Real rendered width of the video frame; caption sizes are px at 1080p and scale from it. */
  frameWidth: number
  selectedWordId: string | null
}

/**
 * Draws the active caption block over the video.
 *
 * PROPS ONLY — no context, no hooks beyond useMemo. This is P2's swap point: replacing it
 * with Remotion's <Player> is one JSX element in VideoStage, and lib/caption-style.ts
 * (pure) ports across with it (plan §7).
 */
export function CaptionRenderer({
  blocks,
  wordsOf,
  project,
  preset,
  timeMs,
  frameWidth,
  selectedWordId,
}: CaptionRendererProps) {
  const active = useMemo(() => {
    const index = findBlockIndexAt(blocks, timeMs)
    return index === -1 ? null : blocks[index]
  }, [blocks, timeMs])

  // A gap between blocks shows nothing. That is correct, not a missing state.
  if (!active) return null

  const words = wordsOf(active)
  if (words.length === 0) return null

  const anchor = resolveWordStyle(words[0], preset, project.settings, frameWidth)

  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      // Position is the preset's x/y as percentages of the frame, matching Style.x / Style.y.
      style={{ containerType: 'size' }}
      aria-hidden
    >
      <div
        className="absolute flex flex-wrap items-baseline justify-center gap-x-[0.28em] gap-y-[0.1em] text-center"
        style={{
          left: `${anchor.x}%`,
          top: `${anchor.y}%`,
          transform: 'translate(-50%, -50%)',
          // Merging can push a block past the preset's nominal wordsPerLine, so this wraps
          // rather than assuming a fixed slot count (plan §3.1).
          maxWidth: '92%',
        }}
      >
        {words.map((word) => (
          <CaptionWord
            key={word.id}
            word={word}
            project={project}
            preset={preset}
            frameWidth={frameWidth}
            timeMs={timeMs}
            isSelected={word.id === selectedWordId}
          />
        ))}
      </div>
    </div>
  )
}

function CaptionWord({
  word,
  project,
  preset,
  frameWidth,
  timeMs,
  isSelected,
}: {
  word: Word
  project: Project
  preset: Preset
  frameWidth: number
  timeMs: number
  isSelected: boolean
}) {
  const style = useMemo(
    () => resolveWordStyle(word, preset, project.settings, frameWidth),
    [word, preset, project.settings, frameWidth],
  )

  const isActive = timeMs >= word.startMs && timeMs < word.endMs
  const text = renderedText(word, preset.stretch)

  // Words already spoken stay fully visible; only the ones ahead of the playhead follow the
  // preset's reveal mode (audit 14 §5 — it is per template, not global).
  const opacity = revealOpacity(preset.reveal, timeMs >= word.startMs)

  // Angry's shake is a real px amplitude from EMOTION_STYLES. Driven off the clock so it is
  // deterministic at a given time rather than a CSS animation drifting against the video.
  const shakeOffset =
    style.shake > 0 && isActive
      ? {
          x: Math.sin(timeMs / 18) * style.shake,
          y: Math.cos(timeMs / 13) * style.shake * 0.6,
        }
      : null

  // Gradient text needs its halo as a wrapper filter, never a text-shadow — see glowWrapperCss.
  const wrapper = glowWrapperCss(style)

  const glyphs = (
    <span style={{ ...styleToCss(style), display: 'inline-block' }}>
      {text}
      {project.settings.emojis && word.emoji ? ` ${word.emoji}` : ''}
    </span>
  )

  return (
    <span
      style={{
        ...wrapper,
        display: 'inline-block',
        opacity,
        transform: shakeOffset ? `translate(${shakeOffset.x}px, ${shakeOffset.y}px)` : undefined,
        outline: isSelected ? '2px solid rgba(99,102,241,0.9)' : undefined,
        outlineOffset: '2px',
        borderRadius: isSelected ? '4px' : undefined,
      }}
    >
      {glyphs}
    </span>
  )
}
