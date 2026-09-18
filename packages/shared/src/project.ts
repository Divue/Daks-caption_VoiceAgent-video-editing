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
  settings: z.object({
    emojis: z.boolean(),
    emotionLayer: z.boolean(),
  }),
})
export type Project = z.infer<typeof Project>
