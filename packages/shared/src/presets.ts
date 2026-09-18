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
    // Komika Axis is not on Google Fonts (and is not freely licensed for this); Luckiest Guy is the
    // closest chunky caption face we can actually load. See CAPTION_FONTS below.
    base: { fontFamily: 'Luckiest Guy', fontSize: 80, color: '#FFFFFF', weight: 400, uppercase: true, ...center },
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
  'Instrument Serif', // editorial serif
  'Oswald',           // condensed sans
] as const
export type CaptionFont = (typeof CAPTION_FONTS)[number]

// Emotion layer defaults (scope board: angry = CAPS + bold + red + shake, excited = stretch + pop).
export const EMOTION_STYLES = {
  angry: { uppercase: true, weight: 900, color: '#FF2D2D', shake: 4 },
  excited: { fontSize: 1.15 /* scale multiplier, applied as pop */ },
} as const
