import { useMemo } from 'react'
import type { CaptionBlock, Project, Word } from '@captions/shared'
import { PRESETS } from '@captions/shared'
import { findBlockIndexAt } from '@/hooks/useCaptionBlocks'
import { renderedText, resolveWordStyle, styleToCss } from '@/lib/caption-style'

interface CaptionRendererProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  project: Project
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
  timeMs,
  frameWidth,
  selectedWordId,
}: CaptionRendererProps) {
  const preset = PRESETS[project.presetId]

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
  frameWidth,
  timeMs,
  isSelected,
}: {
  word: Word
  project: Project
  frameWidth: number
  timeMs: number
  isSelected: boolean
}) {
  const preset = PRESETS[project.presetId]
  const style = useMemo(
    () => resolveWordStyle(word, preset, project.settings, frameWidth),
    [word, preset, project.settings, frameWidth],
  )

  const isActive = timeMs >= word.startMs && timeMs < word.endMs
  const text = renderedText(word)

  // Angry's shake is a real px amplitude from EMOTION_STYLES. Driven off the clock so it is
  // deterministic at a given time rather than a CSS animation drifting against the video.
  const shakeOffset =
    style.shake > 0 && isActive
      ? {
          x: Math.sin(timeMs / 18) * style.shake,
          y: Math.cos(timeMs / 13) * style.shake * 0.6,
        }
      : null

  return (
    <span
      style={{
        ...styleToCss(style),
        display: 'inline-block',
        opacity: isActive ? 1 : 0.55,
        transform: shakeOffset ? `translate(${shakeOffset.x}px, ${shakeOffset.y}px)` : undefined,
        outline: isSelected ? '2px solid rgba(99,102,241,0.9)' : undefined,
        outlineOffset: '2px',
        borderRadius: isSelected ? '4px' : undefined,
      }}
    >
      {text}
      {project.settings.emojis && word.emoji ? ` ${word.emoji}` : ''}
    </span>
  )
}
