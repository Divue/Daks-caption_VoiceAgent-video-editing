import type { CaptionWord } from './CaptionedVideo'

/**
 * Dummy Hinglish dialogue for the landing-page showcase, timed against the 8s
 * `public/demo/sample-reel.mp4`. Hand-written, not pipeline output: it exists so the hero
 * shows every caption layer (angry, emphasis, stretched) without real transcription.
 * Words are ordered so each 3-word caption group reads as one phrase.
 */
export const SAMPLE_CAPTIONS: CaptionWord[] = [
  { word: 'Bhai', startTime: 0.15, endTime: 0.45 },
  { word: 'pehle', startTime: 0.5, endTime: 0.85 },
  { word: 'captions', startTime: 0.9, endTime: 1.45 },
  { word: 'ekdum', startTime: 1.55, endTime: 2.0, emotion: 'angry' },
  { word: 'bekaar', startTime: 2.05, endTime: 2.7, emotion: 'angry' },
  { word: 'the', startTime: 2.75, endTime: 3.0 },
  { word: 'ab', startTime: 3.15, endTime: 3.35 },
  { word: 'ye', startTime: 3.4, endTime: 3.6 },
  { word: 'sunta', startTime: 3.65, endTime: 4.15, emphasis: true },
  { word: 'hai', startTime: 4.2, endTime: 4.4 },
  { word: 'hello', startTime: 4.5, endTime: 5.3, emotion: 'excited', stretched: 'hellooo' },
  { word: 'guys', startTime: 5.35, endTime: 6.0, emotion: 'excited', stretched: 'guuuys' },
  { word: 'kaisa', startTime: 6.15, endTime: 6.5 },
  { word: 'laga', startTime: 6.55, endTime: 6.95 },
  { word: 'yaar', startTime: 7.0, endTime: 7.75, emotion: 'excited', stretched: 'yaaaar' },
]
