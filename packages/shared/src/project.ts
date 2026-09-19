// The data contract. Every feature reads and writes a Project.
// Changes need team agreement; mirror them in services/api/app/schema.py.
import { z } from 'zod'

export const Emotion = z.enum(['neutral', 'angry', 'excited'])
export type Emotion = z.infer<typeof Emotion>

// Renamed `kathmandu` -> `rangmanch` (schema v2). The old id was a rough copy of the reference's
// *Kalakar Motion*, while the reference's actual "Kathmandu" is the yellow Montserrat look we now
// ship as `dhamaka` — keeping both names would have pointed at each other's looks. Stored rows are
// migrated on read by services/api/app/store/projects.py (MIGRATIONS 1 -> 2).
export const PresetId = z.enum([
  'rangmanch',
  'chamak',
  'nazm',
  'dhamaka',
  'mrbeast',
  'minimal',
  'hinglish-bold',
])
export type PresetId = z.infer<typeof PresetId>

export const TextCase = z.enum(['none', 'upper', 'lower'])
export type TextCase = z.infer<typeof TextCase>

/** One stop of a multi-stop text gradient. `at` is a percentage along the axis (0-100). */
export const GradientStop = z.object({
  color: z.string(),
  at: z.number().min(0).max(100),
})
export type GradientStop = z.infer<typeof GradientStop>

// x, y are percentages (0-100) of the frame; fontSize is px at 1080p width.
export const Style = z.object({
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  gradient: z.tuple([z.string(), z.string()]).optional(),
  // A gradient with more than two stops — the reference's green sheen is symmetric, lightest at
  // the 50% stop, which a 2-tuple cannot express. Wins over `gradient` when both are present.
  gradientStops: z.array(GradientStop).min(2).optional(),
  weight: z.number().int().min(100).max(900),
  italic: z.boolean().optional(),
  // Replaced `uppercase?: boolean` in schema v2: one preset needs forced LOWERCASE, and two
  // booleans that can both be true is a precedence rule nobody would remember.
  textCase: TextCase.optional(),
  glow: z.number().min(0).optional(), // halo radius in px at 1080p, 0 = none
  glowColor: z.string().optional(),   // defaults to `color`, which is wrong for gradient text
  strokeWidth: z.number().min(0).optional(), // px at 1080p, 0 = none
  strokeColor: z.string().optional(),
  // em-relative, NOT px: it has to survive the frame scaling that fontSize goes through.
  letterSpacing: z.number().optional(),
  lineHeight: z.number().positive().optional(), // multiplier, e.g. 0.9
  shake: z.number().min(0).optional(), // amplitude in px, 0 = none
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
})
export type Style = z.infer<typeof Style>

export const Signals = z.object({
  loudnessZ: z.number(),
  pitchZ: z.number(),
  durationRatio: z.number(), // actual / expected duration for this speaker
  // Defaults to 0 so a hand-authored Word parses; mirrors schema.py's `extraMs: float = 0.0`.
  extraMs: z.number().default(0), // how much longer than expected, in ms
})
export type Signals = z.infer<typeof Signals>

export const Word = z.object({
  id: z.string(),
  text: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  emphasis: z.boolean(),
  emotion: Emotion,
  stretch: z.number().min(1), // 1 = none, 2.5 = "hellloooo"
  // Pull this word out of its caption block and show it on its own, for its own
  // startMs–endMs. A layout choice, not a style: it changes the GROUPING, so it is
  // read by deriveBlocks (rule 4), not by the style resolver. Optional, like `emoji` —
  // absent and `false` mean the same thing, and the pipeline never sets it.
  single: z.boolean().optional(),
  emoji: z.string().optional(),
  style: Style.partial().optional(), // per-word override from user or agent
  signals: Signals.optional(),
})
export type Word = z.infer<typeof Word>

export const Overlay = z.object({
  id: z.string(),
  text: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  style: Style.partial(),
})
export type Overlay = z.infer<typeof Overlay>

/**
 * An uploaded image or video placed ON TOP of the main clip — a sticker, a logo, a B-roll cut, a
 * reaction image. Up to two tracks; track 2 draws over track 1, both draw under the captions.
 *
 * Three independent things, deliberately never mixed (this is where editors go wrong):
 *   - PLACEMENT, in OUTPUT time: `startMs`..`endMs` is when it is on screen in the finished video.
 *   - SOURCE TRIM, in SOURCE time: a video item shows its source from `trimStartMs` onward, for
 *     exactly `endMs - startMs`. There is no separate "trim end" — it is derived, so the two can
 *     never disagree. Splitting at T makes two items sharing one source with adjacent trims.
 *     Images ignore it.
 *   - TRANSFORM, in FRAME space: `x`/`y` are the item's CENTRE as a percentage of the frame (the
 *     same convention captions use), `width` is a percentage of the frame's width, and the height
 *     follows from `aspect` — so it can never be stretched out of shape. -50..150 lets an item sit
 *     partly off-frame, which is how a slide-in or a corner sticker is framed.
 *
 * `mediaId` names a file under the project's own S3 prefix; the server mints it and the pattern
 * pins it, so it can never be a path. `aspect` and `sourceDurationMs` are measured by the browser
 * at upload, because neither the renderer nor the agent can afford to go and measure the file.
 */
export const MEDIA_ID_PATTERN = /^[0-9a-f]{12}\.(png|jpe?g|webp|gif|mp4|mov|webm)$/
export const LAYER_TRACKS = [1, 2] as const
/** A generous cap that still keeps a project far inside the store's 350 KB document limit. */
export const MAX_LAYER_ITEMS = 40

export const LayerItem = z.object({
  id: z.string().min(1),
  track: z.union([z.literal(1), z.literal(2)]),
  kind: z.enum(['image', 'video']),
  mediaId: z.string().regex(MEDIA_ID_PATTERN),
  /** The uploaded file's name — what a person (or the agent) calls it: "the logo". */
  name: z.string().max(120).optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  trimStartMs: z.number().int().min(0),
  /** Video only: the source's own length, so a trim can never run past its end. */
  sourceDurationMs: z.number().int().positive().optional(),
  x: z.number().min(-50).max(150),
  y: z.number().min(-50).max(150),
  width: z.number().gt(0).max(400),
  /** Source width / height. */
  aspect: z.number().positive(),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  /** Video only. Off by default: an overlay's own audio fighting the narration is rarely wanted. */
  muted: z.boolean(),
})
export type LayerItem = z.infer<typeof LayerItem>

/**
 * Persisted tweaks to the ACTIVE preset's CONDITIONAL layers.
 *
 * `Preset` itself is deliberately NOT stored (see presets.ts's header and INDEX.md): only
 * `presetId` is, so `Preset` can grow in TypeScript with no schema.py mirror and no migration.
 * This is therefore NOT `Partial<Preset>` — it is a short, explicitly enumerated allow-list of
 * the handful of preset properties a user or the agent must be able to SAVE. Everything here
 * applies only when a condition holds (the word is emphasised, the tone run is angry, the
 * playhead has not arrived, the line is being packed), which is exactly why it has no per-word
 * home in `Style` and could not be persisted at all before (audit 15 §5).
 *
 * Adding a property here costs a schema.py mirror. Adding one to `Preset` costs nothing. Only
 * promote a property once a command like "fewer words per line" or "make emphasised words
 * bigger" has to survive a reload.
 *
 * `emotion` is a PARTIAL record on purpose: zod v4's `z.record(enum, …)` is EXHAUSTIVE and would
 * demand all three emotions be present, which neither the UI nor the Python mirror
 * (`dict[Emotion, …]`) means. `z.partialRecord` is the partial one.
 */
export const PresetOverride = z.object({
  /**
   * The preset's BASE caption size (px at 1080p), overriding `Preset.base.fontSize`.
   *
   * This is what "make the captions bigger" has to change. Writing an explicit per-word
   * `style.fontSize` onto every word looks equivalent and is not: the resolver treats an
   * explicit per-word size as final (`caption-style.ts` — it bypasses `sizeMultiplier`), so a
   * blanket per-word size DESTROYS the emphasis hierarchy. Measured: asking for "bigger" took
   * the emphasised word from 33.5px down to 18.3px while every other word grew.
   */
  baseFontSize: z.number().positive().optional(),
  /**
   * The preset's BASE face — what "All captions" means: colour, font, weight, position, effects.
   *
   * Same bug, same fix as `baseFontSize` above, for every other key. Writing a colour onto every
   * word looks equivalent and is not: a per-word colour beats the emphasis and emotion layers, so
   * "make the captions blue" turned the red emphasised words and the orange angry words blue too,
   * and switching preset could not bring them back. Measured on a Rangmanch reel: emphasis
   * #E2452A and angry #FF5C3A both became #33CCFF. Here the base changes and the layers still sit
   * on top of it. Size stays in `baseFontSize`, which the agent already uses.
   */
  base: Style.partial().optional(),
  wordsPerLine: z.number().int().min(1).max(8).optional(),
  /** Layered onto emphasised words only — a full face, not a weight bump (see Preset.emphasis). */
  emphasis: Style.partial().optional(),
  /** Multiplier on the resolved base size, never an absolute px. */
  emphasisScale: z.number().positive().optional(),
  /** How words the playhead has not reached yet are drawn. Mirrors presets.ts's RevealMode. */
  reveal: z.enum(['none', 'dim', 'hidden']).optional(),
  emotion: z
    .partialRecord(Emotion, z.object({ style: Style.partial(), scale: z.number().positive().optional() }))
    .optional(),
})
export type PresetOverride = z.infer<typeof PresetOverride>

export const Project = z.object({
  id: z.string(),
  videoUrl: z.string(),
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  presetId: PresetId,
  // Optional and additive: every stored v2 document parses unchanged, so this needs no migration
  // and no SCHEMA_VERSION bump (see services/api/app/store/projects.py MIGRATIONS).
  presetOverride: PresetOverride.optional(),
  words: z.array(Word),
  overlays: z.array(Overlay),
  // Optional and additive, like presetOverride above: stored documents parse unchanged, so no
  // migration and no SCHEMA_VERSION bump. Absent and [] mean the same thing.
  layers: z.array(LayerItem).max(MAX_LAYER_ITEMS).optional(),
  settings: z.object({
    emojis: z.boolean(),
    emotionLayer: z.boolean(),
  }),
})
export type Project = z.infer<typeof Project>
