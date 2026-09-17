// Base looks. Emphasis/emotion layers are applied on top by the renderer (P2 owns the visuals;
// values here are starting points).
import type { PresetId, Style } from './project'

export type Preset = {
  id: PresetId
  name: string
  base: Style
  emphasis: Partial<Style>
  wordsPerLine: number
}

const center = { x: 50, y: 70 }

export const PRESETS: Record<PresetId, Preset> = {
  kathmandu: {
    id: 'kathmandu',
    name: 'Kathmandu',
    base: { fontFamily: 'Instrument Serif', fontSize: 64, color: '#FFFFF0', weight: 400, ...center },
    emphasis: { fontFamily: 'Anton', color: '#A6190D', uppercase: true },
    wordsPerLine: 3,
  },
  mrbeast: {
    id: 'mrbeast',
    name: 'MrBeast',
    base: { fontFamily: 'Komika Axis', fontSize: 80, color: '#FFFFFF', weight: 800, uppercase: true, ...center },
    emphasis: { color: '#FFE600', fontSize: 92 },
    wordsPerLine: 2,
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    base: { fontFamily: 'Inter', fontSize: 56, color: '#FFFFFF', weight: 600, ...center },
    emphasis: { weight: 800 },
    wordsPerLine: 4,
  },
  'hinglish-bold': {
    id: 'hinglish-bold',
    name: 'Hinglish Bold',
    base: { fontFamily: 'Poppins', fontSize: 68, color: '#FFFFFF', weight: 700, ...center },
    emphasis: { gradient: ['#FF7A00', '#FF2D55'], fontSize: 76 },
    wordsPerLine: 3,
  },
}

// Emotion layer defaults (scope board: angry = CAPS + bold + red + shake, excited = stretch + pop).
export const EMOTION_STYLES = {
  angry: { uppercase: true, weight: 900, color: '#FF2D2D', shake: 4 },
  excited: { fontSize: 1.15 /* scale multiplier, applied as pop */ },
} as const
