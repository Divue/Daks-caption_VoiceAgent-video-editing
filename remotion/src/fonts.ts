import { useEffect, useState } from 'react'
import { continueRender, delayRender } from 'remotion'

/**
 * The SAME link the editor loads (apps/web/index.html). The export must draw with the same
 * typefaces or it is a different video from the one the user approved; `scripts/check.mjs` fails if
 * this string drifts from index.html.
 */
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Fredoka:wght@300..700&family=Instrument+Sans:wght@400..700&family=Instrument+Serif:ital@0;1&family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&family=Luckiest+Guy&family=Montserrat:wght@100..900&family=Oswald:wght@200..700&family=Poppins:wght@400;500;600;700;800;900&family=Titan+One&display=swap'

const LINK_ID = 'caption-google-fonts'
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900]

/** Every `fontFamily` string anywhere inside `value` (a preset, a word's style, ...). */
export function collectFontFamilies(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectFontFamilies(item, into)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'fontFamily' && typeof child === 'string') into.add(child)
      else collectFontFamilies(child, into)
    }
  }
  return into
}

/**
 * Holds the render until every typeface the captions use is actually loaded. Without this a frame
 * can be captured while the browser is still on its fallback font, and the export would flicker
 * between two faces from one frame to the next.
 *
 * `document.fonts.load` resolves (with no faces) for a weight a family does not have, so asking for
 * every weight is safe and cannot hang; the timeout is only a backstop for a network that is down.
 */
export function useCaptionFonts(families: string[], sampleText: string): void {
  const [handle] = useState(() => delayRender('Loading caption fonts', { timeoutInMilliseconds: 60_000 }))
  const key = families.join('|')

  useEffect(() => {
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement('link')
      link.id = LINK_ID
      link.rel = 'stylesheet'
      link.href = GOOGLE_FONTS_HREF
      document.head.appendChild(link)
    }
    // The stylesheet itself has to arrive before any face can be requested: asking earlier resolves
    // with nothing, because the browser does not know the face exists yet.
    const sheet = new Promise<void>((resolve) => {
      const link = document.getElementById(LINK_ID) as HTMLLinkElement | null
      if (!link || link.sheet) return resolve()
      link.addEventListener('load', () => resolve(), { once: true })
      link.addEventListener('error', () => resolve(), { once: true })
    })
    void sheet
      .then(() =>
        Promise.all(
          families.flatMap((family) =>
            WEIGHTS.flatMap((weight) => [
              document.fonts.load(`${weight} 48px "${family}"`, sampleText),
              document.fonts.load(`italic ${weight} 48px "${family}"`, sampleText),
            ]),
          ),
        ),
      )
      .finally(() => continueRender(handle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
