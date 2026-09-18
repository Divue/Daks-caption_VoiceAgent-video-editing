import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'
import { PRESETS } from '@captions/shared'
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
  const { project } = useProject()
  // Preset and settings writes share the editor's ONE queue and version counter. They used to go
  // out on their own `patchProject` call, which is a second writer against the same counter — and
  // now that the agent can change the preset mid-turn, that race is reachable for real.
  const { patchProjectFields, error } = useWordPatch()

  function handleSelect(presetId: PresetId) {
    if (presetId === project.presetId) return
    void patchProjectFields({ presetId })
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/*
        The two stored render switches. They existed in the schema and on the API from the start
        but had no control anywhere, so "stop making things red" was unanswerable — and an agent
        tool that flips a setting the user cannot see or reverse by hand is worse than no tool.
      */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
        <p className="eyebrow text-muted-foreground/70">Layers</p>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="settings-emojis" className="text-sm font-normal text-card-foreground">
            Emojis
          </Label>
          <Switch
            id="settings-emojis"
            checked={project.settings.emojis}
            onCheckedChange={(emojis) => void patchProjectFields({ settings: { emojis } })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="settings-emotion" className="text-sm font-normal text-card-foreground">
            Emotion colours
          </Label>
          <Switch
            id="settings-emotion"
            checked={project.settings.emotionLayer}
            onCheckedChange={(emotionLayer) => void patchProjectFields({ settings: { emotionLayer } })}
          />
        </div>
      </div>
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
