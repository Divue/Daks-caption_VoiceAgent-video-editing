import type { CSSProperties } from 'react'
import { EMOTION_STYLES, PRESETS } from '@captions/shared'
import type { Emotion, PresetId, Style } from '@captions/shared'
import { cn } from '@/lib/utils'

/** One word of a static caption: the same layers as `Word` in the shared schema. */
export interface CaptionLineWord {
  text: string
  emphasis?: boolean
  emotion?: Emotion
  /** Display text for a held word (`hello` -> `hellooo`). */
  stretched?: string
  /** Glow radius in px at 1080p, like `Style.glow`. */
  glow?: number
  emoji?: string
  /** Per-word override (`Word.style`), applied last so an explicit edit always wins. */
  style?: Partial<Style>
}

interface CaptionLineProps {
  words: CaptionLineWord[]
  presetId: PresetId
  /** Multiplies every size. 1 = true 1080p proportions; small swatches read better at ~1.5. */
  scale?: number
  className?: string
}

/** Drops undefined keys, so a sparse override never blanks out a preset value. */
function definedFields(style: Partial<Style>): Partial<Style> {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as Partial<Style>
}

/** Preset sizes are px at 1080p width; inside a VideoFrame that maps to cqmin. */
function toCqmin(px: number): string {
  return `${(px / 1080) * 100}cqmin`
}

function wordStyle(word: CaptionLineWord, presetId: PresetId, sizeScale: number): CSSProperties {
  const preset = PRESETS[presetId]
  let style: Partial<Style> = { ...preset.base, ...(word.emphasis ? preset.emphasis : {}) }
  let scale = sizeScale
  if (word.emotion === 'angry') style = { ...style, ...EMOTION_STYLES.angry, gradient: undefined }
  if (word.emotion === 'excited') scale *= EMOTION_STYLES.excited.fontSize
  if (word.style) style = { ...style, ...definedFields(word.style) }

  const glow = word.glow ?? style.glow
  const shadows = ['0 0.4cqmin 1.2cqmin rgba(0, 0, 0, 0.6)']
  if (glow) shadows.push(`0 0 ${toCqmin(glow)} ${style.color ?? '#FFFFFF'}`)

  return {
    fontFamily: `'${style.fontFamily}', 'Poppins', sans-serif`,
    fontSize: toCqmin((style.fontSize ?? 64) * scale),
    fontWeight: style.weight,
    color: style.color,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    lineHeight: 1.1,
    textShadow: style.gradient ? undefined : shadows.join(', '),
    ...(style.gradient && {
      backgroundImage: `linear-gradient(90deg, ${style.gradient[0]}, ${style.gradient[1]})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    }),
  }
}

/**
 * A still caption rendered the way the product layers it: preset base, then emphasis, then
 * emotion (angry = shared EMOTION_STYLES + shake; excited = pop + stretched text), then the
 * word's own style override. Used by the landing page and the editor preview. Must sit
 * inside a size container such as VideoFrame, because sizes are in cqmin.
 */
export function CaptionLine({ words, presetId, scale = 1, className }: CaptionLineProps) {
  return (
    <p
      className={cn('flex flex-wrap items-baseline justify-center text-center', className)}
      style={{ columnGap: '2cqmin', rowGap: '1cqmin', paddingInline: '6cqmin' }}
    >
      {words.map((word, index) => (
        <span
          key={`${word.text}-${index}`}
          className={word.emotion === 'angry' || word.style?.shake ? 'caption-shake' : undefined}
          style={wordStyle(word, presetId, scale)}
        >
          {word.stretched ?? word.text}
          {word.emoji ? ` ${word.emoji}` : ''}
        </span>
      ))}
    </p>
  )
}
