import { formatTimestamp } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useWordPatch } from '@/hooks/useWordPatch'
import { useProject } from '@/state/project-context'
import { Emotion } from '@captions/shared'
import type { Signals, Style, Word } from '@captions/shared'
import { StyleOverrideFields } from './StyleOverrideFields'

interface WordInspectorProps {
  selectedWordId: string | null
}

export function WordInspector({ selectedWordId }: WordInspectorProps) {
  const { project } = useProject()
  const { saving, error, patch, clearError } = useWordPatch()
  const word = selectedWordId
    ? project.words.find((candidate) => candidate.id === selectedWordId)
    : undefined

  if (!word) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="font-medium text-foreground">No word selected</p>
        <p className="text-sm text-muted-foreground">
          Select a word in the transcript to edit it.
        </p>
      </div>
    )
  }

  const update = (fields: Partial<Word>) => {
    clearError()
    patch(word.id, fields)
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Selected word
          </p>
          {saving && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Saving…
            </span>
          )}
        </div>
        <p className="truncate text-lg font-semibold text-foreground">
          {word.text}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatTimestamp(word.startMs)} — {formatTimestamp(word.endMs)}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Word properties
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="word-text">Text</Label>
          <Input
            id="word-text"
            value={word.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="word-emphasis">Emphasis</Label>
          <Switch
            id="word-emphasis"
            checked={word.emphasis}
            onCheckedChange={(checked) => update({ emphasis: checked })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="word-emotion">Emotion</Label>
          <Select
            value={word.emotion}
            onValueChange={(value) =>
              update({ emotion: value as Word['emotion'] })
            }
          >
            <SelectTrigger id="word-emotion" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Emotion.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="word-stretch">Stretch</Label>
          <Input
            id="word-stretch"
            type="number"
            min={1}
            step={0.1}
            value={word.stretch}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (!Number.isNaN(value)) update({ stretch: value })
            }}
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <StyleOverrideFields
          style={word.style}
          onChange={(style: Partial<Style> | undefined) => update({ style })}
        />
      </div>

      {word.signals && <SignalsBlock signals={word.signals} />}
    </div>
  )
}

function SignalsBlock({ signals }: { signals: Signals }) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Prosody signals
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <SignalRow label="Loudness Z" value={signals.loudnessZ.toFixed(2)} />
        <SignalRow label="Pitch Z" value={signals.pitchZ.toFixed(2)} />
        <SignalRow
          label="Duration ratio"
          value={signals.durationRatio.toFixed(2)}
        />
        {signals.extraMs > 0 && (
          <SignalRow label="Extra ms" value={`${Math.round(signals.extraMs)}`} />
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Read-only. Set by the prosody analysis pipeline.
      </p>
    </div>
  )
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">{value}</span>
    </>
  )
}
