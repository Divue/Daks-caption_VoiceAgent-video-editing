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

export const Project = z.object({
  id: z.string(),
  videoUrl: z.string(),
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  presetId: PresetId,
  words: z.array(Word),
  overlays: z.array(Overlay),
  settings: z.object({
    emojis: z.boolean(),
    emotionLayer: z.boolean(),
  }),
})
export type Project = z.infer<typeof Project>
