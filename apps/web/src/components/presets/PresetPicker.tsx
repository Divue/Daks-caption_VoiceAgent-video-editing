import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { usePresetSegments } from '@/hooks/usePresetSegments'
import { formatTimestamp } from '@/lib/format'
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

/**
 * WHAT A CLICK CHANGES depends on the playhead, and nothing else.
 *
 * With the playhead inside a preset segment, a card changes THAT segment. Outside every segment
 * it changes the project's own preset — the base look, which is what it always did.
 *
 * There is no separate "selected range" state to get out of step with what is on screen: the
 * timeline's preset lane seeks into a segment when you touch it, so selecting one and moving the
 * playhead into it are the same gesture. It is also the rule the style panel already follows
 * (`preset-override-context.tsx`), so the two panels can never be editing different things. The
 * header below says which of the two a click will hit, because a picker that silently means two
 * different things is the failure mode this arrangement is otherwise open to.
 */
export function PresetPicker() {
  const { project } = useProject()
  // Preset and settings writes share the editor's ONE queue and version counter. They used to go
  // out on their own `patchProject` call, which is a second writer against the same counter — and
  // now that the agent can change the preset mid-turn, that race is reachable for real.
  const { patchProjectFields, error } = useWordPatch()
  const { activeSegment, setSegment } = usePresetSegments()
  const selectedId = activeSegment?.presetId ?? project.presetId

  function handleSelect(presetId: PresetId) {
    if (presetId === selectedId) return
    // Changing a segment's preset keeps its own tweaks only if they still mean anything. They do
    // not: an override is stamped against the preset it was made for (audit 15), which is why
    // switching preset drops the session half everywhere else too.
    if (activeSegment) setSegment({ ...activeSegment, presetId, presetOverride: undefined })
    else void patchProjectFields({ presetId })
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
      <p className="text-xs text-muted-foreground">
        {activeSegment ? (
          <>
            Changing the segment at{' '}
            <span className="tabular-nums text-foreground/80">
              {formatTimestamp(activeSegment.startMs)}–{formatTimestamp(activeSegment.endMs)}
            </span>
            . Move the playhead out of it to change the whole video.
          </>
        ) : (
          'Changing the whole video. Draw a segment on the timeline’s Preset lane to restyle one stretch.'
        )}
      </p>

      {Object.values(PRESETS).map((preset) => {
        const selected = preset.id === selectedId
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
