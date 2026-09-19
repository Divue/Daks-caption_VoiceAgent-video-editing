import type { CSSProperties } from 'react'
import { PRESETS } from '@captions/shared'
import type { GradientStop, Preset } from '@captions/shared'
import { RevealItem } from './RevealItem'
import { useMotionSafe } from './useMotionSafe'

// The real preset list (packages/shared/src/presets.ts) — 7 presets, not the
// four invented "Modern / Bold / Karaoke / Cinematic" marketing categories
// the original CaptionStylesSection (../CaptionStylesSection.tsx, left
// untouched) hardcoded. Object.values keeps PRESETS' own declaration order.
// Real names found: Rangmanch, Chamak, Nazm, Dhamaka, MrBeast, Minimal,
// Hinglish Bold.
const REAL_PRESETS = Object.values(PRESETS)

// Same illustrative phrase EditorPreviewMock already uses elsewhere on this
// page — reused rather than inventing new sample copy.
const SAMPLE_WORDS: { text: string; emphasis: boolean }[] = [
  { text: 'This', emphasis: false },
  { text: 'is', emphasis: false },
  { text: 'actually', emphasis: false },
  { text: 'INSANE', emphasis: true },
]

function gradientCss(stops?: GradientStop[], tuple?: [string, string]): string | undefined {
  if (stops && stops.length >= 2) {
    return `linear-gradient(90deg, ${stops.map((stop) => `${stop.color} ${stop.at}%`).join(', ')})`
  }
  if (tuple) return `linear-gradient(90deg, ${tuple[0]}, ${tuple[1]})`
  return undefined
}

/**
 * Simplified preset-to-CSS — the same technique EditorPreviewMock uses
 * (merge base + emphasis, map the handful of Style fields a small preview
 * needs), extended just enough to cover gradient fill and glow so presets
 * that lean on them (chamak, nazm, dhamaka) don't render as flat white.
 * This is not the full render engine (@/lib/caption-style.ts) — that's for
 * the editor's actual timeline, not a marketing tile.
 */
function wordStyle(preset: Preset, emphasised: boolean): CSSProperties {
  const layer = emphasised ? { ...preset.base, ...preset.emphasis } : preset.base
  const gradient = emphasised ? gradientCss(preset.emphasis.gradientStops, preset.emphasis.gradient) : undefined
  const glow = emphasised ? preset.emphasis.glow : preset.base.glow
  const glowColor = emphasised ? (preset.emphasis.glowColor ?? layer.color) : (preset.base.glowColor ?? layer.color)

  const style: CSSProperties = {
    fontFamily: `'${layer.fontFamily}', sans-serif`,
    fontWeight: layer.weight,
    fontStyle: layer.italic ? 'italic' : 'normal',
    textTransform: layer.textCase === 'upper' ? 'uppercase' : layer.textCase === 'lower' ? 'lowercase' : 'none',
    fontSize: Math.min(preset.base.fontSize * (emphasised ? 0.26 : 0.2), emphasised ? 26 : 16),
  }

  if (gradient) {
    style.backgroundImage = gradient
    style.WebkitBackgroundClip = 'text'
    style.backgroundClip = 'text'
    style.color = 'transparent'
  } else {
    style.color = layer.color
  }

  if (glow) {
    style.textShadow = `0 0 ${Math.min(glow * 0.25, 12)}px ${glowColor}`
  }

  return style
}

/**
 * Dark-theme port of ../CaptionStylesSection.tsx (untouched) — and a
 * correctness fix. The original hardcoded four style names that don't exist
 * in the engine; this pulls the real preset list from @captions/shared and
 * renders each tile through the same base+emphasis merge EditorPreviewMock
 * uses, so every tile is genuine preset output. 7 real presets means a
 * 7-tile grid, not padded to a round number.
 */
export function CaptionStylesSection() {
  const motionSafe = useMotionSafe()

  return (
    // No top border here — this section reads as a continuation of
    // AiEditingSection under the shared #voice-editing nav anchor, not a
    // new topic, so the divider sits above that section instead.
    <section id="templates" className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <RevealItem motionSafe={motionSafe} className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">Caption styles</p>
        </RevealItem>
        <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {REAL_PRESETS.map((preset, index) => (
            <RevealItem key={preset.id} motionSafe={motionSafe} style={{ animationDelay: `${index * 70}ms` }}>
              <div className="rounded-xl border border-line-subtle bg-surface/40 p-3">
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-md bg-canvas px-2 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-x-1">
                    {SAMPLE_WORDS.map((word) => (
                      <span key={word.text} style={wordStyle(preset, word.emphasis)}>
                        {word.text}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-wide text-ink-secondary">
                  {preset.name}
                </p>
              </div>
            </RevealItem>
          ))}
        </div>
      </div>
    </section>
  )
}
