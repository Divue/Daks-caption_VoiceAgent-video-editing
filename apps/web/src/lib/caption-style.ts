// Pure style resolution for one caption word. No React, no DOM, no context — so it ports
// unchanged into a Remotion composition when P2 swaps CaptionRenderer for <Player>.
import { CAPTION_FONTS, EMOTION_STYLES, PRESETS } from '@captions/shared'
import type { Preset, Project, Style, Word } from '@captions/shared'

/** The schema's fontSize is "px at 1080p width", so every size scales by the real frame width. */
const REFERENCE_WIDTH = 1080

/** Repeat sizing: one extra letter per this many ms of measured stretch. */
const MS_PER_REPEAT = 120
const MAX_REPEATS = 5
/** Beyond this the word stops fitting the frame at any preset size. */
const MAX_RENDERED_LENGTH = 14

export interface ResolvedStyle {
  fontFamily: string
  fontSize: number
  color: string
  gradient?: [string, string]
  weight: number
  uppercase: boolean
  glow: number
  shake: number
  x: number
  y: number
}

/**
 * Layer order: preset base → emotion → emphasis → per-word override.
 *
 * Emphasis is applied AFTER emotion deliberately: emotion is a property of the whole tone
 * run, emphasis marks one word inside it, so the narrower signal wins. The per-word
 * override (user or agent) is last and always wins.
 */
export function resolveWordStyle(
  word: Word,
  preset: Preset,
  settings: Project['settings'],
  frameWidth: number,
): ResolvedStyle {
  const layers: Partial<Style>[] = [preset.base]

  // EMOTION_STYLES.excited.fontSize is a SCALE MULTIPLIER (1.15), not pixels — the comment in
  // presets.ts says so. Spreading it like the other layers would set fontSize: 1.15px and make
  // the caption vanish. It is pulled out here and applied to the final size instead.
  let sizeMultiplier = 1

  if (settings.emotionLayer && word.emotion !== 'neutral') {
    const emotionLayer = EMOTION_STYLES[word.emotion as keyof typeof EMOTION_STYLES] as
      | Partial<Style>
      | undefined
    if (emotionLayer) {
      const layer: Partial<Style> = { ...emotionLayer }
      // A value below this threshold is a multiplier (excited is 1.15); anything larger is
      // a genuine px size. No preset uses a caption smaller than 10px at 1080p.
      if (typeof layer.fontSize === 'number' && layer.fontSize < 10) {
        sizeMultiplier *= layer.fontSize
        delete layer.fontSize
      }
      layers.push(layer)
    }
  }

  if (word.emphasis) layers.push(preset.emphasis)
  if (word.style) layers.push(word.style)

  const merged = layers.reduce<Partial<Style>>((acc, layer) => ({ ...acc, ...layer }), {})
  const scale = frameWidth > 0 ? frameWidth / REFERENCE_WIDTH : 1

  return {
    fontFamily: merged.fontFamily ?? preset.base.fontFamily,
    fontSize: (merged.fontSize ?? preset.base.fontSize) * sizeMultiplier * scale,
    color: merged.color ?? preset.base.color,
    gradient: merged.gradient as [string, string] | undefined,
    weight: merged.weight ?? preset.base.weight,
    uppercase: merged.uppercase ?? false,
    glow: (merged.glow ?? 0) * scale,
    shake: (merged.shake ?? 0) * scale,
    x: merged.x ?? preset.base.x,
    y: merged.y ?? preset.base.y,
  }
}

/**
 * The text to draw for a word, with stretch repeats added.
 *
 * INVARIANT (plan §8.6, INDEX.md): this only ever ADDS repeats. It never collapses or
 * normalises `Word.text`. Collapsing repeated letters turns "know" into "now" and had
 * already destroyed "STT" down to "ST" in one fixture — the true spellings were recovered
 * by re-running the pipeline, not by de-duplicating letters. If text arrives with repeats
 * baked in, that is bad data to fix upstream, not something to paper over here.
 *
 * `stretch` gates (the pipeline decided whether to stretch at all) and `signals.extraMs`
 * sizes (how much). The two do not track each other: "What" has extraMs 60 with stretch 1.0,
 * while "bhai" has extraMs 260 with stretch 2.18. Using extraMs alone would stretch words
 * the pipeline chose to leave alone.
 */
export function renderedText(word: Word): string {
  if (word.stretch <= 1) return word.text
  const extraMs = word.signals?.extraMs ?? 0
  if (extraMs <= 0) return word.text

  const lastChar = word.text.at(-1)
  if (!lastChar || !/[a-z]/i.test(lastChar)) return word.text

  const wanted = Math.min(MAX_REPEATS, Math.max(1, Math.round(extraMs / MS_PER_REPEAT)))
  const room = MAX_RENDERED_LENGTH - word.text.length
  const repeats = Math.min(wanted, Math.max(0, room))
  return repeats > 0 ? word.text + lastChar.repeat(repeats) : word.text
}

/** CSS for a resolved style. Kept beside the resolver so the two stay in step. */
export function styleToCss(style: ResolvedStyle): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: `'${style.fontFamily}', sans-serif`,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.weight,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    lineHeight: 1.1,
  }

  if (style.gradient) {
    // A gradient fill needs the text clipped to the background; `color` is ignored then.
    css.backgroundImage = `linear-gradient(90deg, ${style.gradient[0]}, ${style.gradient[1]})`
    css.WebkitBackgroundClip = 'text'
    css.backgroundClip = 'text'
    css.color = 'transparent'
  } else {
    css.color = style.color
  }

  // A readability shadow always; the glow layer stacks on top of it when the preset asks.
  const shadows = ['0 2px 8px rgba(0,0,0,0.55)']
  if (style.glow > 0) shadows.push(`0 0 ${style.glow}px ${style.color}`)
  css.textShadow = shadows.join(', ')

  return css
}

/**
 * Dev guard: every preset face must be in CAPTION_FONTS, or index.html never loads it and the
 * caption silently renders in a fallback — which looks like a styling bug, not a missing font.
 */
export function assertPresetFontsLoadable(): string[] {
  const known = new Set<string>(CAPTION_FONTS)
  const missing: string[] = []
  for (const preset of Object.values(PRESETS)) {
    for (const family of [preset.base.fontFamily, preset.emphasis.fontFamily]) {
      if (family && !known.has(family)) missing.push(`${preset.id}: "${family}"`)
    }
  }
  return missing
}
