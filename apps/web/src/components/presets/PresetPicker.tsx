import { PRESETS } from '@captions/shared'
import type { PresetId } from '@captions/shared'
import { CaptionLine } from '@/components/captions/CaptionLine'
import type { CaptionLineWord } from '@/components/captions/CaptionLine'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project-context'

/** Same line in every preset: plain words plus one emphasised word, so the emphasis layer shows. */
const SAMPLE: CaptionLineWord[] = [{ text: 'ab' }, { text: 'ye' }, { text: 'sunta', emphasis: true }, { text: 'hai' }]

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
              'flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors duration-150',
              selected
                ? 'border-signal/50 bg-surface-raised'
                : 'border-hairline bg-surface hover:border-hairline-strong',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{preset.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-faint">{preset.wordsPerLine} words/line</span>
            </div>
            <PresetPreview presetId={preset.id} />
          </button>
        )
      })}
    </div>
  )
}

/** A short 2:1 frame (size container) rendering the sample through the shared CaptionLine. */
function PresetPreview({ presetId }: { presetId: PresetId }) {
  return (
    <div
      className="relative flex aspect-[2/1] items-center overflow-hidden rounded-lg bg-background ring-1 ring-white/6"
      style={{ containerType: 'size' }}
    >
      <CaptionLine presetId={presetId} words={SAMPLE} scale={1.4} className="w-full" />
    </div>
  )
}
