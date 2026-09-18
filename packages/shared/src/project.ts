// The data contract. Every feature reads and writes a Project.
// Changes need team agreement; mirror them in services/api/app/schema.py.
import { z } from 'zod'

export const Emotion = z.enum(['neutral', 'angry', 'excited'])
export type Emotion = z.infer<typeof Emotion>

export const PresetId = z.enum(['kathmandu', 'mrbeast', 'minimal', 'hinglish-bold'])
export type PresetId = z.infer<typeof PresetId>

// x, y are percentages (0-100) of the frame; fontSize is px at 1080p width.
export const Style = z.object({
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  gradient: z.tuple([z.string(), z.string()]).optional(),
  weight: z.number().int().min(100).max(900),
  uppercase: z.boolean().optional(),
  glow: z.number().min(0).optional(),
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
