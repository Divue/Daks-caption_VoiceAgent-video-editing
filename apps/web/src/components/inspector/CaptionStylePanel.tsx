import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Emotion } from '@captions/shared'
import type { Word } from '@captions/shared'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { EMOTION_DOT } from '@/lib/emotion'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePresetOverride } from '@/state/preset-override-context'
import { useProject } from '@/state/project-context'
import { useWordPatch } from '@/state/word-patch-context'
import { Field, NumberField, Section } from './fields'
import {
  AlignField,
  EmphasisSection,
  GlowLayersField,
  RevealSection,
  SentimentSection,
  StretchSection,
} from './PresetSections'
import {
  EffectsSection,
  PositionSection,
  SpacingSection,
  TextSection,
} from './StyleSections'
import { presetScope, wordScope } from './style-scope'

type Scope = 'preset' | 'word'

/**
 * The caption style panel.
 *
 * THE SCOPE RULE: every control edits either the whole caption track or the one selected word,
 * and which one is never ambiguous — the two live in separate tabs, the tab says how many words a
 * write touches, and preset-scope controls that cannot persist carry a "session only" badge.
 * The old StyleOverrideFields was per-word only and already read as ambiguous; mixing preset-level
 * controls into the same flat list would have made it genuinely confusing.
 *
 * ALL persisted writes go through `patchStyle`, which shares the editor's single serialised write
 * queue (audit 13 §5). A preset-scope change touching N words is one optimistic commit and N
 * ordered PATCHes — never a loop of independent calls and never a second queue.
 */
export function CaptionStylePanel({ selectedWordId }: { selectedWordId: string | null }) {
  const { project } = useProject()
  const { preset, setOverride, reset, isOverridden } = usePresetOverride()
  const { saving, error, patch, patchStyle, clearError } = useWordPatch()
  const [scope, setScope] = useState<Scope>('preset')

  // Selecting a word IS the gesture that means "I want to change this one". Leaving the panel
  // on preset scope made per-word editing look impossible: you click a word, every control
  // still edits all 51, and nothing says why. Switching back to preset scope stays manual —
  // deselecting should not silently widen what your next drag touches.
  const lastSelected = useRef<string | null>(selectedWordId)
  useEffect(() => {
    if (selectedWordId && selectedWordId !== lastSelected.current) setScope('word')
    lastSelected.current = selectedWordId
  }, [selectedWordId])

  const word = selectedWordId
    ? project.words.find((candidate) => candidate.id === selectedWordId)
    : undefined

  const presetTarget = useMemo(
    () => presetScope(project, preset, patchStyle),
    [project, preset, patchStyle],
  )
  const wordTarget = useMemo(
    () => (word ? wordScope(word, preset, project.settings, patchStyle) : null),
    [word, preset, project.settings, patchStyle],
  )

  // The preview needs a real held word, not a mock — the whole point is to judge this video's data.
  const stretchSample = useMemo(() => {
    const held = project.words.find((candidate) => candidate.stretch > 1 && (candidate.signals?.extraMs ?? 0) > 0)
    return held ? { text: held.text, extraMs: held.signals?.extraMs ?? 0 } : undefined
  }, [project.words])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The scope switch decides what a drag changes — the whole caption track or one word. It is
        the most consequential control in the panel, so it is full width and loud, not the small
        grey box-in-box it was (audit 16 §2.11).
      */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-3 py-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1" role="tablist">
          <ScopeTab
            active={scope === 'preset'}
            onClick={() => setScope('preset')}
            label="All captions"
            detail={`${project.words.length} words`}
          />
          <ScopeTab
            active={scope === 'word'}
            onClick={() => setScope('word')}
            label="This word"
            detail={word ? word.text : 'none selected'}
          />
        </div>

        <div className="flex min-h-5 items-center justify-between gap-2 px-1">
          <p className="truncate text-[11px] text-muted-foreground">
            {scope === 'preset' ? (
              <>
                Preset <span className="font-medium text-foreground">{preset.name}</span>
                {isOverridden && ' — tweaked'}
              </>
            ) : (
              'Overrides just this word'
            )}
          </p>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
            {scope === 'preset' && isOverridden && (
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline">
              dismiss
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {scope === 'preset' ? (
          <>
            <TextSection scope={presetTarget}>
              <AlignField preset={preset} setOverride={setOverride} />
            </TextSection>
            <EmphasisSection preset={preset} setOverride={setOverride} />
            <SentimentSection preset={preset} setOverride={setOverride} />
            <StretchSection preset={preset} setOverride={setOverride} sample={stretchSample} />
            <PositionSection scope={presetTarget} />
            <SpacingSection scope={presetTarget} />
            <EffectsSection scope={presetTarget}>
              <GlowLayersField preset={preset} setOverride={setOverride} />
            </EffectsSection>
            <RevealSection preset={preset} setOverride={setOverride} />
          </>
        ) : !word || !wordTarget ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
            <p className="font-medium text-foreground">No word selected</p>
            <p className="text-sm text-muted-foreground">
              Pick a word in the transcript or timeline to style it on its own.
            </p>
          </div>
        ) : (
          <>
            <PerWordSection
              word={word}
              onPatch={(fields) => {
                clearError()
                patch(word.id, fields)
              }}
            />
            <TextSection scope={wordTarget} />
            <PositionSection scope={wordTarget} />
            <SpacingSection scope={wordTarget} />
            <EffectsSection scope={wordTarget} />
            {word.signals && <SignalsSection signals={word.signals} />}
          </>
        )}
      </div>
    </div>
  )
}

function ScopeTab({
  active,
  onClick,
  label,
  detail,
}: {
  active: boolean
  onClick: () => void
  label: string
  detail: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start rounded-md px-2.5 py-1.5 transition-colors',
        active
          ? 'bg-background shadow-sm ring-1 ring-primary/35'
          : 'text-muted-foreground hover:bg-background/40',
      )}
    >
      <span className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="w-full truncate text-left text-[10px] text-muted-foreground/70">{detail}</span>
    </button>
  )
}

/**
 * The per-word signals the reference product has no equivalent of: which word is stressed, what
 * tone it carries, whether it gets its own line, and its emoji. These are `Word` fields, not
 * `Style` — they change what the renderer decides, not how it paints.
 */
function PerWordSection({
  word,
  onPatch,
}: {
  word: Word
  onPatch: (fields: Partial<Word>) => void
}) {
  return (
    <Section title="Word" hint={`${formatTimestamp(word.startMs)} — ${formatTimestamp(word.endMs)}`}>
      <Field label="Text">
        <Input
          value={word.text}
          onChange={(event) => onPatch({ text: event.target.value })}
          className="h-8 text-xs"
        />
      </Field>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Emphasis</span>
        <Switch
          checked={word.emphasis}
          onCheckedChange={(checked) => onPatch({ emphasis: checked })}
        />
      </div>

      <Field label="Emotion">
        <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
          {Emotion.options.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={word.emotion === option}
              onClick={() => onPatch({ emotion: option })}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                word.emotion === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('size-1.5 rounded-full', EMOTION_DOT[option])} />
              {option}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium">Single</span>
          <span className="text-[10px] leading-snug text-muted-foreground">
            Pull this word out of its line and show it on its own.
          </span>
        </div>
        <Switch
          checked={word.single === true}
          onCheckedChange={(checked) => onPatch({ single: checked })}
        />
      </div>

      <Field label="Emoji">
        <Input
          value={word.emoji ?? ''}
          placeholder="none"
          maxLength={4}
          // Empty string, not undefined: `undefined` means "field not touched" all the way down
          // the patch path, so clearing an emoji would never reach the server. toWordPatch turns
          // '' into the explicit null the API removes a key on, exactly as it does for `single`.
          onChange={(event) => onPatch({ emoji: event.target.value })}
          className="h-8 w-20 text-center text-sm"
        />
      </Field>

      <NumberField
        label="Stretch"
        value={word.stretch}
        min={1}
        max={4}
        step={0.05}
        decimals={2}
        suffix="×"
        onChange={(value) => onPatch({ stretch: value })}
      />
    </Section>
  )
}

function SignalsSection({ signals }: { signals: NonNullable<Word['signals']> }) {
  return (
    <Section title="Prosody signals" hint="Read-only. Set by the analysis pipeline.">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <span className="text-muted-foreground">Loudness Z</span>
        <span className="text-right font-mono tabular-nums">{signals.loudnessZ.toFixed(2)}</span>
        <span className="text-muted-foreground">Pitch Z</span>
        <span className="text-right font-mono tabular-nums">{signals.pitchZ.toFixed(2)}</span>
        <span className="text-muted-foreground">Duration ratio</span>
        <span className="text-right font-mono tabular-nums">{signals.durationRatio.toFixed(2)}</span>
        {signals.extraMs > 0 && (
          <>
            <span className="text-muted-foreground">Extra ms</span>
            <span className="text-right font-mono tabular-nums">{Math.round(signals.extraMs)}</span>
          </>
        )}
      </div>
    </Section>
  )
}
