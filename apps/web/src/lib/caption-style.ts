// Pure style resolution for one caption word. No React, no DOM, no context — so it ports
// unchanged into a Remotion composition when P2 swaps CaptionRenderer for <Player>.
//
// The only React thing here is the CSSProperties *type*, which is types-only and erases at build.
import {
  CAPTION_FONTS,
  DEFAULT_GLOW_LAYERS,
  DEFAULT_STRETCH,
  EMOTION_STYLES,
  ITALIC_REQUIRED_FONTS,
  PRESETS,
} from '@captions/shared'
import type {
  EmotionStyle,
  GradientStop,
  Preset,
  Project,
  RevealMode,
  StretchTuning,
  Style,
  TextCase,
  Word,
} from '@captions/shared'

/** The schema's fontSize is "px at 1080p width", so every size scales by the real frame width. */
const REFERENCE_WIDTH = 1080

/** Beyond this the word stops fitting the frame at any preset size. */
const MAX_RENDERED_LENGTH = 14

/**
 * The readability shadow every caption carries, regardless of preset. The reference uses the same
 * idea at a larger, softer, down-right offset (audit 14 §5), so ours follows it.
 */
const READABILITY_TEXT_SHADOW = '0 2px 8px rgba(0,0,0,0.55)'
const READABILITY_DROP_SHADOW = 'drop-shadow(rgba(0,0,0,0.35) 5px 5px 15px)'

/** Alpha of the innermost glow layer, and how much each successive layer gives up. */
const GLOW_MAX_ALPHA = 0.8
const GLOW_MIN_ALPHA = 0.4

export interface ResolvedStyle {
  fontFamily: string
  fontSize: number
  italic: boolean
  color: string
  gradient?: [string, string]
  gradientStops?: GradientStop[]
  weight: number
  textCase: TextCase
  /** Halo radius in px, already scaled to the frame. 0 = none. */
  glow: number
  glowColor: string
  glowLayers: number
  strokeWidth: number
  strokeColor: string
  /** Already multiplied out to px against the resolved font size. */
  letterSpacing: number
  lineHeight: number
  shake: number
  x: number
  y: number
}

/** True when this style's fill is a gradient, which makes `color` transparent. */
export function isGradientFill(style: ResolvedStyle): boolean {
  return Boolean(style.gradientStops ?? style.gradient)
}

/**
 * Layer order: preset base → emotion → emphasis → per-word override.
 *
 * Emphasis is applied AFTER emotion deliberately: emotion is a property of the whole tone
 * run, emphasis marks one word inside it, so the narrower signal wins. The per-word
 * override (user or agent) is last and always wins.
 *
 * SIZE is the one field that is not a plain overwrite. `Preset.emphasisScale` and an emotion's
 * `scale` are MULTIPLIERS on the resolved base, so a user who changes the base size keeps the
 * proportion the look depends on. A per-word `style.fontSize` still wins outright — it is the
 * narrowest signal, and someone who typed an exact size means it.
 */
export function resolveWordStyle(
  word: Word,
  preset: Preset,
  settings: Project['settings'],
  frameWidth: number,
): ResolvedStyle {
  const { style: presetLayers, sizeMultiplier } = resolvePresetLayers(word, preset, settings)
  const merged: Partial<Style> = { ...presetLayers, ...word.style }
  const scale = frameWidth > 0 ? frameWidth / REFERENCE_WIDTH : 1

  const explicitSize = word.style?.fontSize
  const baseSize = merged.fontSize ?? preset.base.fontSize
  const fontSize = (explicitSize ?? baseSize * sizeMultiplier) * scale

  const color = merged.color ?? preset.base.color

  return {
    fontFamily: merged.fontFamily ?? preset.base.fontFamily,
    fontSize,
    italic: merged.italic ?? false,
    color,
    gradient: merged.gradient as [string, string] | undefined,
    gradientStops: merged.gradientStops,
    weight: merged.weight ?? preset.base.weight,
    textCase: merged.textCase ?? 'none',
    glow: (merged.glow ?? 0) * scale,
    // A gradient fill makes `color` transparent, so falling back to it would produce no halo at
    // all. `glowColor` exists for exactly that case; presets using a gradient must set it.
    glowColor: merged.glowColor ?? color,
    glowLayers: Math.max(1, Math.round(preset.glowLayers ?? DEFAULT_GLOW_LAYERS)),
    strokeWidth: (merged.strokeWidth ?? 0) * scale,
    strokeColor: merged.strokeColor ?? '#000000',
    // letterSpacing is stored em-relative so it survives frame scaling; it becomes px against the
    // RESOLVED font size (which is already frame-scaled), never against the frame scale itself.
    letterSpacing: (merged.letterSpacing ?? 0) * fontSize,
    lineHeight: merged.lineHeight ?? 1.1,
    shake: (merged.shake ?? 0) * scale,
    x: merged.x ?? preset.base.x,
    y: merged.y ?? preset.base.y,
  }
}

/**
 * Everything the preset contributes to a word, BEFORE its own `style` override.
 *
 * Exported because the style panel needs it: a control showing "what you are departing from"
 * must show the emphasis face on an emphasised word, not the base face. Sizes stay in schema
 * units (px at 1080p) — no frame scaling happens here.
 */
export function resolvePresetLayers(
  word: Word,
  preset: Preset,
  settings: Project['settings'],
): { style: Partial<Style>; sizeMultiplier: number } {
  const layers: Partial<Style>[] = [preset.base]
  let sizeMultiplier = 1

  if (settings.emotionLayer && word.emotion !== 'neutral') {
    const emotionLayer = resolveEmotionLayer(preset, word.emotion)
    if (emotionLayer) {
      layers.push(emotionLayer.style)
      sizeMultiplier *= emotionLayer.scale ?? 1
    }
  }

  if (word.emphasis) {
    layers.push(preset.emphasis)
    sizeMultiplier *= preset.emphasisScale
  }

  return {
    style: layers.reduce<Partial<Style>>((acc, layer) => ({ ...acc, ...layer }), {}),
    sizeMultiplier,
  }
}

/** A preset's emotion entry merged over the shared default, key by key. */
export function resolveEmotionLayer(preset: Preset, emotion: Word['emotion']): EmotionStyle | undefined {
  const fallback = EMOTION_STYLES[emotion]
  const override = preset.emotion?.[emotion]
  if (!fallback && !override) return undefined
  return {
    style: { ...fallback?.style, ...override?.style },
    scale: override?.scale ?? fallback?.scale,
  }
}

/**
 * Opacity for a word given where the playhead is.
 *
 * Only words the playhead has NOT reached are affected — a word already spoken stays fully
 * visible. The previous code dimmed past words too, which is a fourth behaviour the reference
 * uses nowhere (audit 14 §5).
 */
export function revealOpacity(reveal: RevealMode, hasStarted: boolean): number {
  if (hasStarted) return 1
  if (reveal === 'hidden') return 0
  if (reveal === 'dim') return 0.55
  return 1
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
export function renderedText(word: Word, tuning: StretchTuning = DEFAULT_STRETCH): string {
  if (word.stretch <= 1) return word.text
  const extraMs = word.signals?.extraMs ?? 0
  if (extraMs <= 0) return word.text

  const lastChar = word.text.at(-1)
  if (!lastChar || !/[a-z]/i.test(lastChar)) return word.text

  const msPerRepeat = tuning.msPerRepeat > 0 ? tuning.msPerRepeat : DEFAULT_STRETCH.msPerRepeat
  const wanted = Math.min(tuning.maxRepeats, Math.max(1, Math.round(extraMs / msPerRepeat)))
  const room = MAX_RENDERED_LENGTH - word.text.length
  const repeats = Math.min(wanted, Math.max(0, room))
  return repeats > 0 ? word.text + lastChar.repeat(repeats) : word.text
}

/**
 * CSS for a resolved style. Kept beside the resolver so the two stay in step.
 *
 * Glow is emitted here ONLY for a solid fill. For gradient text it belongs on a wrapper — see
 * `glowWrapperCss`, which explains why.
 */
export function styleToCss(style: ResolvedStyle): React.CSSProperties {
  const gradientFill = isGradientFill(style)

  const css: React.CSSProperties = {
    fontFamily: `'${style.fontFamily}', sans-serif`,
    fontSize: `${style.fontSize}px`,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontWeight: style.weight,
    textTransform: cssTextTransform(style.textCase),
    lineHeight: style.lineHeight,
  }

  if (style.letterSpacing !== 0) css.letterSpacing = `${style.letterSpacing}px`

  if (gradientFill) {
    // A gradient fill needs the text clipped to the background; `color` is ignored then.
    css.backgroundImage = gradientCss(style)
    css.WebkitBackgroundClip = 'text'
    css.backgroundClip = 'text'
    css.color = 'transparent'
  } else {
    css.color = style.color
    const shadows = [READABILITY_TEXT_SHADOW, ...glowLayerCss(style, 'shadow')]
    css.textShadow = shadows.join(', ')
  }

  if (style.strokeWidth > 0) {
    css.WebkitTextStroke = `${style.strokeWidth}px ${style.strokeColor}`
    // Without this the stroke is painted OVER the fill and eats the glyph interiors, which at
    // caption weights closes up counters entirely.
    css.paintOrder = 'stroke fill'
  }

  return css
}

/**
 * CSS for the element WRAPPING a gradient-filled word, or undefined when nothing is needed.
 *
 * This is the trap audit 14 §3 documents. Gradient text sets `color: transparent` and
 * `text-shadow` draws from the glyph's COLOUR, so a gradient word with a text-shadow glow renders
 * with no halo at all — silently. A wrapper `filter: drop-shadow()` reads the rendered alpha
 * instead, which is what the reference does. The readability shadow has to move with it, for the
 * same reason.
 */
export function glowWrapperCss(style: ResolvedStyle): React.CSSProperties | undefined {
  if (!isGradientFill(style)) return undefined
  const filters = [READABILITY_DROP_SHADOW, ...glowLayerCss(style, 'filter')]
  return { filter: filters.join(' ') }
}

function cssTextTransform(textCase: TextCase): React.CSSProperties['textTransform'] {
  if (textCase === 'upper') return 'uppercase'
  if (textCase === 'lower') return 'lowercase'
  return 'none'
}

function gradientCss(style: ResolvedStyle): string {
  if (style.gradientStops && style.gradientStops.length >= 2) {
    const stops = style.gradientStops.map((stop) => `${stop.color} ${stop.at}%`).join(', ')
    return `linear-gradient(90deg, ${stops})`
  }
  const [from, to] = style.gradient ?? ['#FFFFFF', '#FFFFFF']
  return `linear-gradient(90deg, ${from}, ${to})`
}

/**
 * The glow, as N stacked layers at decreasing alpha and increasing radius.
 *
 * One `0 0 Npx` shadow bands visibly — it reads as a ring rather than a falloff. The reference
 * stacks three (Delhi measured at .8/10px, .6/20px, .4/30px), and that ramp is what this rebuilds
 * for any radius and any layer count.
 */
function glowLayerCss(style: ResolvedStyle, kind: 'shadow' | 'filter'): string[] {
  if (style.glow <= 0) return []
  const layers = style.glowLayers
  const span = layers > 1 ? (GLOW_MAX_ALPHA - GLOW_MIN_ALPHA) / (layers - 1) : 0

  return Array.from({ length: layers }, (_, index) => {
    const radius = (style.glow * (index + 1)) / layers
    const color = withAlpha(style.glowColor, GLOW_MAX_ALPHA - span * index)
    return kind === 'shadow' ? `0 0 ${radius}px ${color}` : `drop-shadow(${color} 0 0 ${radius}px)`
  })
}

/**
 * A colour at a given alpha. Handles `#RGB`, `#RRGGBB` and `rgb()/rgba()`; anything else (a named
 * colour, a var()) is returned untouched rather than mangled — it just glows at full alpha.
 */
function withAlpha(color: string, alpha: number): string {
  const rounded = Math.round(alpha * 1000) / 1000
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits
    const value = Number.parseInt(full, 16)
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${rounded})`
  }

  const rgb = color.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${rounded})`

  return color
}

/**
 * Dev guard: every preset face must be in CAPTION_FONTS, or index.html never loads it and the
 * caption silently renders in a fallback — which looks like a styling bug, not a missing font.
 *
 * It also checks the ITALIC case: `rangmanch` and `nazm` both depend on Instrument Serif's italic,
 * and a family loaded at upright-only falls back to a synthesised slant that looks nothing like it.
 */
export function assertPresetFontsLoadable(): string[] {
  const known = new Set<string>(CAPTION_FONTS)
  const italicKnown = new Set(ITALIC_REQUIRED_FONTS)
  const missing: string[] = []

  for (const preset of Object.values(PRESETS)) {
    for (const layer of [preset.base, preset.emphasis]) {
      const family = layer.fontFamily
      if (family && !known.has(family)) missing.push(`${preset.id}: "${family}"`)
      if (family && layer.italic && !italicKnown.has(family)) {
        missing.push(`${preset.id}: "${family}" italic (add it to ITALIC_REQUIRED_FONTS + index.html)`)
      }
    }
  }
  return missing
}
