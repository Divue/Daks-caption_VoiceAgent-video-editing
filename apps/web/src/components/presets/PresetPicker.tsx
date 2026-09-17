import { cn } from '@/lib/utils'
import { useProject } from '@/state/project-context'
import { PRESETS } from '@captions/shared'
import type { Style } from '@captions/shared'

/** Scales a preset's authored font size down to fit the small preview box while keeping presets visually distinct. */
const PREVIEW_SCALE = 0.35

export function PresetPicker() {
  const { project, dispatch } = useProject()

  return (
    <div className="flex flex-col gap-3 p-3">
      {Object.values(PRESETS).map((preset) => {
        const selected = preset.id === project.presetId
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selected}
            onClick={() => dispatch({ type: 'SET_PRESET', presetId: preset.id })}
            className={cn(
              'flex flex-col gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted',
              selected && 'border-primary bg-primary/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-card-foreground">{preset.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{preset.wordsPerLine} words/line</span>
            </div>
            <PresetPreview style={preset.base} />
          </button>
        )
      })}
    </div>
  )
}

function PresetPreview({ style }: { style: Style }) {
  return (
    <div
      className="flex h-16 items-center justify-center overflow-hidden rounded-md bg-black/85 px-2 text-center"
      style={{
        fontFamily: style.fontFamily,
        fontSize: style.fontSize * PREVIEW_SCALE,
        color: style.color,
        fontWeight: style.weight,
        textTransform: style.uppercase ? 'uppercase' : 'none',
      }}
    >
      Hellooooo bhai
    </div>
  )
}
