import { Mic, Type, Wand2 } from 'lucide-react'
import { PRESETS } from '@captions/shared'
import type { Style } from '@captions/shared'

const PREVIEW_WORDS = [
  { text: 'This', emphasis: false },
  { text: 'is', emphasis: false },
  { text: 'actually', emphasis: false },
  { text: 'INSANE', emphasis: true },
]

/**
 * Dark-theme port of ../EditorPreviewMock.tsx (untouched — that file still
 * backs the light landing page on upstream/aman/editor-ui and friends).
 * Same behaviour: a static marketing visual, not the real editor, reusing
 * the real preset styling engine (@captions/shared) so the caption look is
 * authentic. Only the surrounding chrome is restyled, to the hero's
 * canvas/ink/signal tokens instead of shadcn's light card tokens.
 */
export function EditorPreviewMock() {
  const preset = PRESETS.mrbeast

  return (
    <div className="relative w-full max-w-[280px]">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line-subtle bg-canvas shadow-soft">
        <div className="absolute inset-x-4 bottom-10 flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-center">
          {PREVIEW_WORDS.map((word) => {
            const style: Style = { ...preset.base, ...(word.emphasis ? preset.emphasis : {}) }
            return (
              <span
                key={word.text}
                style={{
                  fontFamily: style.fontFamily,
                  color: style.color,
                  fontWeight: style.weight,
                  textTransform: style.textCase === 'upper' ? 'uppercase' : style.textCase === 'lower' ? 'lowercase' : 'none',
                  fontSize: Math.min(style.fontSize * 0.3, 22),
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
                }}
              >
                {word.text}
              </span>
            )
          })}
        </div>
      </div>

      <div className="absolute top-10 -left-6 hidden w-36 rounded-xl border border-line-subtle bg-surface/80 p-3 text-left shadow-soft backdrop-blur-md sm:block">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-primary">
          <Type className="size-3.5 text-signal" />
          Style
        </div>
        <p className="mt-1 text-[11px] text-ink-tertiary">MrBeast · Bold</p>
      </div>

      <div className="absolute top-1/3 -right-8 hidden w-40 rounded-xl border border-line-subtle bg-surface/80 p-3 text-left shadow-soft backdrop-blur-md sm:block">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-primary">
          <Wand2 className="size-3.5 text-signal" />
          AI command
        </div>
        <p className="mt-1 text-[11px] text-ink-tertiary">"Make it dramatic"</p>
      </div>

      <div className="absolute -left-4 bottom-6 hidden w-40 rounded-xl border border-line-subtle bg-surface/80 p-3 text-left shadow-soft backdrop-blur-md sm:block">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-primary">
          <Mic className="size-3.5 text-signal" />
          Transcript
        </div>
        <p className="mt-1 truncate text-[11px] text-ink-tertiary">00:03 this is actually...</p>
      </div>
    </div>
  )
}
