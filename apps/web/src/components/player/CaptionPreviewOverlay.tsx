import { useProject } from '@/state/project-context'
import { PRESETS } from '@captions/shared'
import type { Style } from '@captions/shared'

/** Renders real project words with real preset styling — an honest live preview, not fabricated caption text. */
export function CaptionPreviewOverlay() {
  const { project } = useProject()
  const preset = PRESETS[project.presetId]
  const words = project.words.slice(0, 3)

  if (words.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-6 flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-center">
      {words.map((word) => {
        const style: Style = { ...preset.base, ...(word.emphasis ? preset.emphasis : {}) }
        return (
          <span
            key={word.id}
            style={{
              fontFamily: style.fontFamily,
              color: style.color,
              fontWeight: style.weight,
              textTransform: style.uppercase ? 'uppercase' : 'none',
              fontSize: Math.min(style.fontSize * 0.35, 26),
              textShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
            }}
          >
            {word.text}
            {word.emoji ? ` ${word.emoji}` : ''}
          </span>
        )
      })}
    </div>
  )
}
