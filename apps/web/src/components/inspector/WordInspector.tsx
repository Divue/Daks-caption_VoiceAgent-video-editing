import { formatTimestamp } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useProject } from '@/state/project-context'
import { Emotion } from '@captions/shared'
import type { Style, Word } from '@captions/shared'
import { StyleOverrideFields } from './StyleOverrideFields'

interface WordInspectorProps {
  selectedWordId: string | null
}

export function WordInspector({ selectedWordId }: WordInspectorProps) {
  const { project, dispatch } = useProject()
  const word = selectedWordId ? project.words.find((candidate) => candidate.id === selectedWordId) : undefined

  if (!word) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="font-medium text-foreground">No word selected</p>
        <p className="text-sm text-muted-foreground">Select a word in the transcript to edit it.</p>
      </div>
    )
  }

  const patch = (fields: Partial<Word>) => dispatch({ type: 'UPDATE_WORD', wordId: word.id, patch: fields })

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Selected word</p>
        <p className="truncate text-lg font-semibold text-foreground">{word.text}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatTimestamp(word.startMs)} — {formatTimestamp(word.endMs)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Word properties</p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="word-text">Text</Label>
          <Input id="word-text" value={word.text} onChange={(event) => patch({ text: event.target.value })} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="word-emphasis">Emphasis</Label>
          <Switch
            id="word-emphasis"
            checked={word.emphasis}
            onCheckedChange={(checked) => patch({ emphasis: checked })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="word-emotion">Emotion</Label>
          <Select value={word.emotion} onValueChange={(value) => patch({ emotion: value as Word['emotion'] })}>
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
              if (!Number.isNaN(value)) patch({ stretch: value })
            }}
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <StyleOverrideFields style={word.style} onChange={(style: Partial<Style> | undefined) => patch({ style })} />
      </div>
    </div>
  )
}
