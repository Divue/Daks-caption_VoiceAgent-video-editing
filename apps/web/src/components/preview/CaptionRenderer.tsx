import { useMemo } from 'react'
import type { CaptionBlock, Preset, Project, Word } from '@captions/shared'
import { DEFAULT_STACK_OFFSETS } from '@captions/shared'
import { findBlockIndexAt } from '@/hooks/useCaptionBlocks'
import {
  glowWrapperCss,
  renderedText,
  resolveWordStyle,
  revealOpacity,
  shouldCascade,
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
  /**
   * Word ids to draw in the emphasis face. A superset of the words with `emphasis: true` — the
   * rhythm rule (shared/emphasis.ts) promotes words without writing to them.
   */
  emphasisIds: Set<string>
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
  emphasisIds,
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

  const anchor = resolveWordStyle(words[0], preset, project.settings, frameWidth, {
    emphasised: emphasisIds.has(words[0].id),
  })

  // Decided per BLOCK, not per preset — see shouldCascade.
  const stackCapable = preset.layout === 'stack'
  const isStack = shouldCascade(words, emphasisIds, preset)

  const shared = { project, preset, emphasisIds, frameWidth, timeMs, selectedWordId }

  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      // Position is the preset's x/y as percentages of the frame, matching Style.x / Style.y.
      style={{ containerType: 'size' }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          left: `${anchor.x}%`,
          top: `${anchor.y}%`,
          // A stack GROWS DOWNWARD as words arrive, so it is anchored by its top edge. Centring
          // it vertically would slide every word already on screen upward each time a new one
          // appeared, which is the one thing the reference's build-up never does.
          //
          // The anchor follows the PRESET, not the block: in a stacked preset even an un-cascaded
          // block hangs from the same top edge, so captions do not jump up and down the frame as
          // blocks with and without emphasis alternate.
          transform: stackCapable ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
          width: isStack ? '92%' : undefined,
          maxWidth: '92%',
        }}
      >
        {isStack ? (
          <StackLayout words={words} {...shared} />
        ) : (
          <InlineLayout words={words} {...shared} />
        )}
      </div>
    </div>
  )
}

interface LayoutProps {
  words: Word[]
  project: Project
  preset: Preset
  emphasisIds: Set<string>
  frameWidth: number
  timeMs: number
  selectedWordId: string | null
}

/** One wrapped line, words side by side — the conventional subtitle shape. */
function InlineLayout({ words, preset, ...rest }: LayoutProps) {
  // The gaps below are in `em`, and `em` resolves against THIS element's font size — which nothing set,
  // so it was the browser default (16px) at every frame size. Words scale with the frame; their gap did
  // not, so on a large frame (an exported 1440p video) it shrank to a sliver relative to the text and the
  // words ran together ("Hellogoodmorning"). Setting the row's size to the caption's own base size makes
  // `0.28em` mean what it was written to mean, at any size. The words set their own font size, so this
  // changes only the spacing.
  const baseFontSize = resolveWordStyle(words[0], preset, rest.project.settings, rest.frameWidth, {
    emphasised: false,
  }).fontSize
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-[0.28em] gap-y-[0.1em]"
      style={{
        fontSize: baseFontSize,
        // Merging can push a block past the preset's nominal wordsPerLine, so this wraps
        // rather than assuming a fixed slot count (plan §3.1).
        justifyContent: justify(preset.align ?? 'center'),
        textAlign: preset.align ?? 'center',
      }}
    >
      {words.map((word) => (
        <CaptionWord key={word.id} word={word} preset={preset} {...rest} />
      ))}
    </div>
  )
}

/**
 * Every word on its own line, the lines stepping sideways as they descend.
 *
 * This is the reference's signature and the reason its templates read as typography rather than
 * as subtitles. Two rules produce it:
 *
 *   - each line is offset horizontally by `stackOffsets[index % length]`, a ramp that runs left
 *     of centre -> centred -> right of centre, so a block reads diagonally down-right;
 *   - an EMPHASISED line ignores the offset and centres, because at 1.3-2.9x the base size it
 *     spans most of the frame and an offset would just push it off the edge.
 *
 * Paired with `reveal: 'hidden'` the block builds a word at a time and the spoken words stay put.
 */
function StackLayout({ words, preset, emphasisIds, ...rest }: LayoutProps) {
  const offsets = preset.stackOffsets ?? DEFAULT_STACK_OFFSETS

  return (
    <div className="flex flex-col items-center">
      {words.map((word, index) => {
        const emphasised = emphasisIds.has(word.id)
        const offset = emphasised ? 0 : (offsets[index % offsets.length] ?? 0)
        return (
          <div
            key={word.id}
            className="flex w-full"
            style={{
              // % of the stack's own width, which is a fixed share of the frame — so the cascade
              // holds its shape at any player size, exactly like the font sizes do.
              transform: `translateX(${offset}%)`,
              justifyContent: 'center',
            }}
          >
            <CaptionWord word={word} preset={preset} emphasised={emphasised} {...rest} />
          </div>
        )
      })}
    </div>
  )
}

function justify(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'flex-start'
  if (align === 'right') return 'flex-end'
  return 'center'
}

function CaptionWord({
  word,
  project,
  preset,
  emphasisIds,
  emphasised,
  frameWidth,
  timeMs,
  selectedWordId,
}: {
  word: Word
  project: Project
  preset: Preset
  emphasisIds?: Set<string>
  /** Pre-computed by the caller when it already knows; otherwise looked up. */
  emphasised?: boolean
  frameWidth: number
  timeMs: number
  selectedWordId: string | null
}) {
  const isEmphasised = emphasised ?? emphasisIds?.has(word.id) ?? word.emphasis
  const isSelected = word.id === selectedWordId

  const style = useMemo(
    () => resolveWordStyle(word, preset, project.settings, frameWidth, { emphasised: isEmphasised }),
    [word, preset, project.settings, frameWidth, isEmphasised],
  )

  const isActive = timeMs >= word.startMs && timeMs < word.endMs
  const text = renderedText(word, preset.stretch)

  // Words already spoken stay fully visible; only the ones ahead of the playhead follow the
  // preset's reveal mode (audit 14 §5 — it is per template, not global).
  const opacity = revealOpacity(preset.reveal, timeMs >= word.startMs)

  // Angry's shake is a real px amplitude from the emotion layer. Driven off the clock so it is
  // deterministic at a given time rather than a CSS animation drifting against the video.
  // Two incommensurable periods (18 and 13 ms) keep it from settling into a visible loop.
  const shakeOffset =
    style.shake > 0 && isActive
      ? {
          x: Math.sin(timeMs / 18) * style.shake,
          y: Math.cos(timeMs / 13) * style.shake * 0.6,
        }
      : null

  // Gradient text needs its halo as a wrapper filter, never a text-shadow — see glowWrapperCss.
  const wrapper = glowWrapperCss(style)

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
      <span style={{ ...styleToCss(style), display: 'inline-block' }}>
        {text}
        {project.settings.emojis && word.emoji ? ` ${word.emoji}` : ''}
      </span>
    </span>
  )
}
