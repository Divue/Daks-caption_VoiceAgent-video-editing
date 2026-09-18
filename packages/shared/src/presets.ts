// Base looks. Emphasis/emotion layers are applied on top by the renderer (P2 owns the visuals).
//
// NOTE ON SCOPE: `Preset` is NOT part of the stored Project — only `presetId` is. So this type can
// grow without a schema.py mirror, without a migration and without touching stored rows. `Style`
// and `PresetId` are the opposite: they live in project.ts and cost a migration. Put as much as
// possible here and as little as possible there.
//
// The four rebuilt presets below (rangmanch, chamak, nazm, dhamaka) carry MEASURED values from
// `.claude/audits/14-kalakar-reference-audit.md` — `getComputedStyle` reads off the reference
// product's live preview, not estimates. Sizes are px at 1080p width, which is what `Style.fontSize`
// already means, so they needed no conversion. Do not "tidy" them into round numbers.
import type { Emotion, PresetId, Style } from './project'

/** How words the playhead has NOT reached yet are drawn. Per preset — the reference varies it. */
export type RevealMode =
  /** Whole line at full opacity from the start. */
  | 'none'
  /** Upcoming words faded back. */
  | 'dim'
  /** Upcoming words fully transparent until the playhead arrives. */
  | 'hidden'

/**
 * One emotion's contribution.
 *
 * `scale` is deliberately NOT `style.fontSize`. The old encoding put the multiplier 1.15 into a
 * px field and relied on a "< 10 means multiplier" heuristic in the resolver; `Preset.emphasisScale`
 * would have been a second, conflicting convention on the same field. Sizes are now always px and
 * multipliers are always their own field.
 */
export interface EmotionStyle {
  /** Style keys layered onto the word. */
  style: Partial<Style>
  /** Multiplier on the resolved base size. 1 (or absent) = no change. */
  scale?: number
}

/** Stretch repeat sizing — how a held word grows letters. See `renderedText`. */
export interface StretchTuning {
  /** One extra letter per this many ms of measured stretch. */
  msPerRepeat: number
  maxRepeats: number
}

/**
 * How a caption block is arranged.
 *
 * `inline` is one wrapped line, words side by side — the conventional subtitle shape.
 *
 * `stack` is the reference product's actual signature and the reason its templates read as
 * typography rather than as subtitles: every word gets its OWN line, the lines step sideways as
 * they descend so the block reads diagonally down-right, and the emphasised word is centred
 * because at 2-3x the base size it spans the frame anyway. Paired with `reveal: 'hidden'` the
 * block builds up a word at a time and the already-spoken words stay put.
 */
export type CaptionLayout = 'inline' | 'stack'

export type Preset = {
  id: PresetId
  name: string
  base: Style
  /** Emphasis is a full independent FACE, not a weight bump — family/case/fill all change. */
  emphasis: Partial<Style>
  /**
   * Emphasis size as a multiple of the resolved base size, NOT an absolute px in
   * `emphasis.fontSize`. A user who changes the base size keeps the proportion the look depends on.
   */
  emphasisScale: number
  reveal: RevealMode
  /**
   * How many stacked shadows to build from `glow`. One `0 0 Npx` shadow bands visibly; the
   * reference stacks three at decreasing alpha and increasing radius. Default 3.
   */
  glowLayers?: number
  /** Per-preset override of EMOTION_STYLES. Merged over the defaults, key by key. */
  emotion?: Partial<Record<Emotion, EmotionStyle>>
  stretch?: StretchTuning
  /** Horizontal alignment of the caption line. Layout, so it lives here and not in Style. */
  align?: 'left' | 'center' | 'right'
  layout?: CaptionLayout
  /**
   * `stack` only: the horizontal offset of each line, as a percentage of the frame width, cycled
   * by line index. An emphasised line ignores this and centres. Measured off the reference:
   * line 0 sits left of centre, line 1 centred, line 2 right of centre, then it repeats.
   */
  stackOffsets?: number[]
  /**
   * Never let more than this many consecutive blocks go by without an emphasised word.
   *
   * Emphasis is what every one of these looks is built around — the size jump, the second face,
   * the colour. A stretch of plain speech that the pipeline found nothing to stress in therefore
   * renders as flat body text for seconds at a time, which is exactly when the preset looks
   * worst. This is a RENDER-TIME rhythm rule; see `resolveEmphasis`. It never writes to the
   * Project, so it cannot be mistaken for something the prosody analysis actually found.
   * 0 disables it.
   */
  emphasisEveryBlocks?: number
  wordsPerLine: number
}

// Inline captions sit low, out of the subject's face, and are centred on that point.
const center = { x: 50, y: 70 }
// A STACK is anchored by its TOP and grows downward as words arrive, so it starts high enough
// that a four-word block still lands inside the frame. Matched to where the reference puts it.
const stackTop = { x: 50, y: 34 }

export const PRESETS: Record<PresetId, Preset> = {
  // Structure from the reference's "Kalakar Motion" — editorial italic serif body, huge display
  // emphasis, no glow, contrast carried by size + face + colour. The COLOURS are ours: the
  // reference's #A6190D is a flat oxblood, and warming it to a vermilion against a paper-white
  // body is what stops this reading as a copy of their template.
  rangmanch: {
    id: 'rangmanch',
    name: 'Rangmanch',
    base: {
      fontFamily: 'Instrument Serif',
      italic: true,
      fontSize: 45,
      color: '#FFF6E9',
      weight: 400,
      letterSpacing: -0.046, // measured -2.05px at 45px
      lineHeight: 0.9,
      ...stackTop,
    },
    emphasis: { fontFamily: 'Anton', italic: false, weight: 400, color: '#E2452A', textCase: 'upper' },
    emphasisScale: 2.93, // 132px / 45px
    reveal: 'none',
    layout: 'stack',
    emotion: { angry: { style: { color: '#FF5C3A', shake: 3 } } },
    wordsPerLine: 3,
  },

  // Structure from "Kalakar Glow": heavy sans body, gradient-filled display emphasis under a wide
  // halo. The gradient is SYMMETRIC — lightest at the 50% stop — so it reads as a centred sheen
  // rather than a left-to-right ramp, which needs all 7 stops. Recoloured from their acid green
  // to a warm gold that belongs to our palette.
  chamak: {
    id: 'chamak',
    name: 'Chamak',
    base: { fontFamily: 'Inter', fontSize: 96, color: '#FFFFFF', weight: 800, lineHeight: 0.9, ...stackTop },
    emphasis: {
      fontFamily: 'Inter',
      weight: 900,
      textCase: 'upper',
      gradientStops: [
        { color: '#FFAE1A', at: 0 },
        { color: '#FFAE1A', at: 20 },
        { color: '#FFC44D', at: 40 },
        { color: '#FFE7A8', at: 50 },
        { color: '#FFC44D', at: 70 },
        { color: '#FFAE1A', at: 80 },
        { color: '#FFAE1A', at: 100 },
      ],
      // The halo colour is NOT the fill: gradient text sets `color: transparent`, so the glow has
      // to be told its own colour. See `glowWrapperCss` for why it is a filter and not a shadow.
      glow: 100,
      glowColor: '#FFAE1A',
    },
    emphasisScale: 2.19, // 209.92px / 96px
    reveal: 'hidden',
    layout: 'stack',
    emotion: { angry: { style: { color: '#FF6B3D', shake: 4 } } },
    wordsPerLine: 3,
  },

  // Structure from "Delhi", whose whole idea is a TYPEFACE contrast rather than a colour one:
  // clean grotesque body, italic display serif for the stressed word, both white, separated only
  // by the glow. That identity is the reason both stay white here; the halo is cooled to a
  // moonlight blue instead, which is the part that was theirs.
  nazm: {
    id: 'nazm',
    name: 'Nazm',
    base: { fontFamily: 'Instrument Sans', fontSize: 72, color: '#FFFFFF', weight: 400, lineHeight: 1, ...stackTop },
    emphasis: {
      fontFamily: 'Instrument Serif',
      italic: true,
      weight: 400,
      color: '#FFFFFF',
      glow: 30, // measured as .8/10px, .6/20px, .4/30px — three layers, which glowLayers rebuilds
      glowColor: '#D6ECFF',
    },
    emphasisScale: 1.5, // 108px / 72px
    reveal: 'hidden',
    layout: 'stack',
    emotion: { angry: { style: { color: '#FFD9D2', shake: 2 } } },
    wordsPerLine: 4,
  },

  // Structure from the reference's own "Kathmandu": tight lowercase Montserrat, a same-face
  // emphasis carried entirely by colour, and a wide low-alpha halo. The negative tracking is a
  // large part of the punch. Their yellow-on-olive became a magenta punch so it cannot be
  // confused with chamak's gold.
  dhamaka: {
    id: 'dhamaka',
    name: 'Dhamaka',
    base: {
      fontFamily: 'Montserrat',
      fontSize: 90,
      color: '#FFFFFF',
      weight: 800,
      textCase: 'lower',
      letterSpacing: -0.053, // measured -4.76px at 90px
      lineHeight: 1,
      // Unlike chamak/nazm the halo is a template-wide effect here, not an emphasis-only one.
      glow: 108,
      glowColor: '#5E1130',
      ...stackTop,
    },
    emphasis: { fontFamily: 'Montserrat', weight: 800, color: '#FF4D8D', textCase: 'lower' },
    emphasisScale: 1.34, // 120.6px / 90px
    reveal: 'dim',
    layout: 'stack',
    emotion: { angry: { style: { color: '#FF2E6B', shake: 5 } } },
    wordsPerLine: 3,
  },

  mrbeast: {
    id: 'mrbeast',
    name: 'MrBeast',
    // Komika Axis is not on Google Fonts (and is not freely licensed for this); Luckiest Guy is the
    // closest chunky caption face we can actually load. See CAPTION_FONTS below.
    base: { fontFamily: 'Luckiest Guy', fontSize: 80, color: '#FFFFFF', weight: 400, textCase: 'upper', ...center },
    emphasis: { color: '#FFE600' },
    emphasisScale: 1.15, // was emphasis.fontSize 92 against base 80
    reveal: 'dim',
    layout: 'inline',
    wordsPerLine: 2,
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    base: { fontFamily: 'Inter', fontSize: 56, color: '#FFFFFF', weight: 600, ...center },
    emphasis: { weight: 800 },
    emphasisScale: 1,
    reveal: 'dim',
    layout: 'inline',
    // The quiet preset opts out of the rhythm rule: "minimal" promising not to shout at you is
    // the whole point of it, and a guaranteed emphasis every few lines is shouting.
    emphasisEveryBlocks: 0,
    wordsPerLine: 4,
  },
  'hinglish-bold': {
    id: 'hinglish-bold',
    name: 'Hinglish Bold',
    base: { fontFamily: 'Poppins', fontSize: 68, color: '#FFFFFF', weight: 700, ...center },
    emphasis: { gradient: ['#FF7A00', '#FF2D55'] },
    emphasisScale: 1.12, // was emphasis.fontSize 76 against base 68
    reveal: 'dim',
    layout: 'inline',
    wordsPerLine: 3,
  },
}

/** `stack` line offsets when a preset does not override them: left of centre, centred, right. */
export const DEFAULT_STACK_OFFSETS = [-14, 0, 14]

/** How many blocks may pass with no emphasis before one is promoted. See `emphasisEveryBlocks`. */
export const DEFAULT_EMPHASIS_EVERY_BLOCKS = 3

// The font set the app loads and the editor's font picker may offer. All are Google Fonts, so
// apps/web loads them with one <link> and Remotion can fetch the same families.
// Every preset's fontFamily must be in this list, or it will silently render in a fallback.
export const CAPTION_FONTS = [
  'Anton',            // Impact-like; the default "bold subtitle" look
  'Bebas Neue',       // tall condensed caps, very common in reels
  'Archivo Black',    // heavy grotesque
  'Luckiest Guy',     // chunky cartoon (MrBeast-ish)
  'Bangers',          // comic-book shout, popular on TikTok
  'Titan One',        // rounded heavy display
  'Fredoka',          // friendly rounded
  'Montserrat',       // clean geometric, 800 for captions
  'Poppins',          // geometric, the Hinglish default
  'Inter',            // neutral UI/subtitle face
  'Instrument Serif', // editorial serif — ITALIC is load-bearing (rangmanch base, nazm emphasis)
  'Instrument Sans',  // grotesque body face (nazm)
  'Oswald',           // condensed sans
] as const
export type CaptionFont = (typeof CAPTION_FONTS)[number]

/** Families whose ITALIC face a preset depends on — index.html must request `ital@0;1` for these. */
export const ITALIC_REQUIRED_FONTS: readonly string[] = ['Instrument Serif']

/** Stretch repeat sizing when a preset does not override it. */
export const DEFAULT_STRETCH: StretchTuning = { msPerRepeat: 120, maxRepeats: 5 }

/** Stacked glow layers when a preset does not override it. */
export const DEFAULT_GLOW_LAYERS = 3

// Emotion layer defaults (scope board: angry = CAPS + bold + red + shake, excited = stretch + pop).
// A preset may override any of these through `Preset.emotion`.
export const EMOTION_STYLES: Partial<Record<Emotion, EmotionStyle>> = {
  angry: { style: { textCase: 'upper', weight: 900, color: '#FF2D2D', shake: 4 } },
  excited: { style: {}, scale: 1.15 },
}
