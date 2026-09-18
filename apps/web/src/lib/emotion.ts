import { Emotion } from '@captions/shared'

/**
 * How each emotion reads in the EDITOR chrome — the caption list badge, the menus.
 *
 * These are not the caption's own colours. What the viewer sees comes from
 * EMOTION_STYLES in @captions/shared (angry = caps + weight 900 + #FF2D2D + shake,
 * excited = 1.15x pop), applied by lib/caption-style.ts. The two are deliberately
 * separate: chrome has to stay legible on the app's background, captions on video.
 */
export const EMOTION_OPTIONS = Emotion.options

export const EMOTION_BADGE: Record<Emotion, string> = {
  neutral: 'bg-muted text-muted-foreground',
  angry: 'bg-red-500/15 text-red-600 dark:text-red-400',
  excited: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

/** A dot for menu rows, where a full badge would be too loud. */
export const EMOTION_DOT: Record<Emotion, string> = {
  neutral: 'bg-muted-foreground/40',
  angry: 'bg-red-500',
  excited: 'bg-amber-500',
}
