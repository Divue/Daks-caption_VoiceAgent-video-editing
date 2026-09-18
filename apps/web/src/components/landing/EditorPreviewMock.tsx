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
 * Static marketing visual — not the real editor. Reuses the real preset
 * styling engine (@captions/shared) so the look is authentic; the words
 * shown are illustrative example copy, not live project data.
 */
export function EditorPreviewMock() {
  const preset = PRESETS.mrbeast

  return (
    <div className="relative w-full max-w-[280px]">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border bg-neutral-900 shadow-xl">
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

      <div className="absolute top-10 -left-6 hidden w-36 rounded-xl border bg-card p-3 text-left shadow-sm sm:block">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Type className="size-3.5 text-primary" />
          Style
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">MrBeast · Bold</p>
      </div>

      <div className="absolute top-1/3 -right-8 hidden w-40 rounded-xl border bg-card p-3 text-left shadow-sm sm:block">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Wand2 className="size-3.5 text-primary" />
          AI command
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">"Make it dramatic"</p>
      </div>

      <div className="absolute -left-4 bottom-6 hidden w-40 rounded-xl border bg-card p-3 text-left shadow-sm sm:block">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Mic className="size-3.5 text-primary" />
          Transcript
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">00:03 this is actually...</p>
      </div>
    </div>
  )
}
