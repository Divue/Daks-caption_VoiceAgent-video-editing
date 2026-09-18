import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project-context'
import { useSync } from '@/state/sync-context'
import { isApiError, patchProject } from '@/lib/api'
import { Project, PRESETS } from '@captions/shared'
import type { Preset, PresetId, Word } from '@captions/shared'
import { glowWrapperCss, resolveWordStyle, styleToCss } from '@/lib/caption-style'

/**
 * The swatch renders through the REAL resolver at a small frame width, so what a card shows is
 * what the preview draws — including the italic face, the tracking and the emphasis scale, which
 * a hand-rolled style object silently dropped. `Style.fontSize` is px at 1080p, so passing the
 * swatch's own width as the frame width scales every preset by the same honest factor.
 */
const PREVIEW_FRAME_WIDTH = 300

const PREVIEW_SETTINGS = { emojis: false, emotionLayer: false }

function sampleWord(id: string, text: string, emphasis: boolean): Word {
  return { id, text, startMs: 0, endMs: 1, emphasis, emotion: 'neutral', stretch: 1 }
}

const SAMPLE_WORDS = [sampleWord('a', 'suno', false), sampleWord('b', 'bhai', true)]

export function PresetPicker() {
  const { project, dispatch } = useProject()
  const { projectId, version, setVersion } = useSync()
  const [error, setError] = useState<string | null>(null)

  function handleSelect(presetId: PresetId) {
    if (presetId === project.presetId) return

    dispatch({ type: 'SET_PRESET', presetId })
    setError(null)

    if (!projectId) return

    patchProject(projectId, { presetId }, version)
      .then(({ project: updated, version: newVersion }) => {
        const parsed = Project.safeParse(updated)
        if (parsed.success) {
          dispatch({ type: 'REPLACE_PRESENT', project: parsed.data })
        }
        setVersion(newVersion)
      })
      .catch((cause) => {
        if (isApiError(cause) && cause.status === 409) {
          setError('Conflict — someone else changed the project. Reload to sync.')
        } else {
          setError(isApiError(cause) ? (cause.detail ?? cause.code) : String(cause))
        }
      })
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {Object.values(PRESETS).map((preset) => {
        const selected = preset.id === project.presetId
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selected}
            onClick={() => handleSelect(preset.id)}
            className={cn(
              'flex flex-col gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted',
              selected && 'border-primary bg-primary/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-card-foreground">
                {preset.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {preset.wordsPerLine} words/line
              </span>
            </div>
            <PresetPreview preset={preset} />
          </button>
        )
      })}
    </div>
  )
}

function PresetPreview({ preset }: { preset: Preset }) {
  return (
    <div className="flex h-20 items-center justify-center gap-[0.28em] overflow-hidden rounded-md bg-black/85 px-2 text-center">
      {SAMPLE_WORDS.map((word) => {
        const style = resolveWordStyle(word, preset, PREVIEW_SETTINGS, PREVIEW_FRAME_WIDTH)
        return (
          <span key={word.id} style={{ ...glowWrapperCss(style), display: 'inline-block' }}>
            <span style={{ ...styleToCss(style), display: 'inline-block' }}>{word.text}</span>
          </span>
        )
      })}
    </div>
  )
}
