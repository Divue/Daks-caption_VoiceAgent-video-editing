import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { BLOCK_GAP_MS, Emotion } from '@captions/shared'
import type { PresetOverride, Word } from '@captions/shared'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { EMOTION_DOT } from '@/lib/emotion'
import { formatTimestamp } from '@/lib/format'
import { cleanWordText, retimeWord } from '@/lib/word-edit'
import type { TimingChange } from '@/lib/word-edit'
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
  const { preset, basePreset, setOverride, reset, isOverridden } = usePresetOverride()
  const { saving, error, patch, patchStyle, patchProjectFields, applyAgentPatches, clearError } = useWordPatch()
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

  const allWordIds = useMemo(() => project.words.map((candidate) => candidate.id), [project.words])
  const presetTarget = useMemo(
    () =>
      presetScope(project.presetOverride, basePreset, allWordIds, (change) => {
        void patchProjectFields({ presetOverride: change as Partial<PresetOverride> })
      }),
    [project.presetOverride, basePreset, allWordIds, patchProjectFields],
  )

  // Words that carry their OWN style keys — from a per-word edit, or from before "All captions"
  // stopped stamping every word. Those keys beat the base face, so a base change would look like
  // it did nothing on them; say so, and offer the one click that hands them back to the preset.
  const ownStyled = useMemo(
    () => project.words.filter((candidate) => candidate.style && Object.keys(candidate.style).length > 0),
    [project.words],
  )
  const clearOwnStyles = () => {
    const keys = new Set(ownStyled.flatMap((candidate) => Object.keys(candidate.style ?? {})))
    patchStyle(
      ownStyled.map((candidate) => candidate.id),
      Object.fromEntries([...keys].map((key) => [key, null])),
    )
  }
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

      {scope === 'preset' && ownStyled.length > 0 && (
        <div className="mx-3 mt-3 flex shrink-0 items-start justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground" data-own-styled>
          <span>
            {ownStyled.length === project.words.length ? 'Every word has' : `${ownStyled.length} ${ownStyled.length === 1 ? 'word has' : 'words have'}`}{' '}
            its own style, which these controls don’t reach — and it hides the preset’s emphasis and tone colours.
          </span>
          <button type="button" onClick={clearOwnStyles} className="shrink-0 font-medium text-foreground underline underline-offset-2">
            Clear
          </button>
        </div>
      )}

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
              words={project.words}
              durationMs={project.durationMs}
              onPatch={(fields) => {
                clearError()
                patch(word.id, fields)
              }}
              // A ripple is N words with DIFFERENT values, which `patchWords` cannot express (it
              // spreads one identical patch) and which N `patch()` calls would turn into N undo
              // steps and N round trips. `applyAgentPatches` is the existing path for exactly
              // this shape — one optimistic commit, one all-or-nothing bulk PATCH, one version
              // bump — so it is reused rather than a second one being invented. Its name says
              // "agent" because the agent was its first caller, not because it is agent-only.
              onRetime={(changes) => {
                clearError()
                void applyAgentPatches(
                  changes.map((change) => ({
                    type: 'UPDATE_WORD' as const,
                    wordId: change.id,
                    patch: { startMs: change.startMs, endMs: change.endMs },
                  })),
                )
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
  words,
  durationMs,
  onPatch,
  onRetime,
}: {
  word: Word
  /** Every word, in playback order — a timing edit ripples through the neighbours. */
  words: Word[]
  durationMs: number
  onPatch: (fields: Partial<Word>) => void
  onRetime: (changes: TimingChange[]) => void
}) {
  return (
    <Section title="Word" hint={`${formatTimestamp(word.startMs)} — ${formatTimestamp(word.endMs)}`}>
      <WordTextField word={word} onPatch={onPatch} />
      <WordTimingFields word={word} words={words} durationMs={durationMs} onRetime={onRetime} />

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

/**
 * The word's own text, for the misheard Hinglish the pipeline gets wrong.
 *
 * COMMITTED ON BLUR OR ENTER, never on keystroke. The field this replaces called `patch()` from
 * `onChange`, which made every character its own reducer commit (one Ctrl+Z per letter typed) and
 * its own PATCH on the shared write queue (one round trip per letter). A draft held locally and
 * committed once is one undo step and one request for one correction, which is the granularity a
 * person means by "I fixed that word".
 *
 * Escape reverts to the stored text and gives the field back, so an edit begun by accident costs
 * nothing.
 *
 * IME: Hinglish is typed both in Latin and in Devanagari, and a Devanagari IME fires `keydown`
 * for Enter WHILE composing, where Enter means "accept this candidate" and not "I am finished".
 * Committing there would store a half-composed syllable. `isComposing` is the platform's own
 * answer to that question, so it is asked rather than guessed at with a timer. `onChange` needs no
 * such guard here precisely because it no longer commits anything.
 *
 * The text is untrusted (it comes from a recogniser, and from whatever a user types). It is only
 * ever rendered as a React text node — here, in CaptionList's WordChip, in the ribbon and in the
 * caption renderer. Nothing in this feature builds HTML from it.
 */
function WordTextField({ word, onPatch }: { word: Word; onPatch: (fields: Partial<Word>) => void }) {
  const [draft, setDraft] = useState(word.text)
  // Tagged with the word it belongs to instead of being cleared by an effect: a message is only
  // ever about the word that produced it, so "is this still mine?" is a render-time question.
  const [message, setMessage] = useState<{ wordId: string; tone: 'note' | 'error'; text: string } | null>(null)
  const shown = message?.wordId === word.id ? message : null
  const composing = useRef(false)

  // Re-seed when a DIFFERENT word is selected, and when this one's text changed underneath us —
  // an agent turn ("replace bhai with bro") writes the same field, and a stale draft would put it
  // back the moment the field lost focus. The field is not re-seeded while it has focus, so an
  // agent turn landing mid-edit cannot yank the characters out from under the cursor; the commit
  // that follows is then the user's own, last-write-wins, which is what the one shared queue
  // already means for every other field.
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setDraft(word.text)
  }, [word.text])

  // NOTE: the re-seed above must NOT clear the message. Committing with Enter blurs the field,
  // which lets the re-seed run, and clearing there wiped "splitting a word into two isn't
  // available yet" in the same tick it was set — so the one edit that most needs explaining was
  // the one that silently explained nothing.

  const commit = () => {
    if (draft === word.text) {
      setMessage(null)
      return
    }
    const result = cleanWordText(draft)
    if (!result.ok) {
      setDraft(word.text)
      setMessage({ wordId: word.id, tone: 'error', text: result.reason })
      return
    }
    setDraft(result.text)
    setMessage(result.note ? { wordId: word.id, tone: 'note', text: result.note } : null)
    if (result.text !== word.text) onPatch({ text: result.text })
  }

  return (
    <Field label="Text">
      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(word.text)
            setMessage(null)
            event.currentTarget.blur()
          }
        }}
        // A long word is the caller's business — the renderer decides how it fits on screen — but
        // the FIELD must not break the panel's layout while it is being typed.
        className="h-8 truncate text-xs"
      />
      {shown && (
        <p className={cn('text-[10px] leading-snug', shown.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {shown.text}
        </p>
      )}
    </Field>
  )
}

/**
 * The word's start and end, for the times the pipeline puts a beat off.
 *
 * RIPPLES, does not clamp. `lib/word-edit.ts` holds the reasoning: a clamp into the neighbours'
 * gap froze the field solid on real transcripts, because the words worth fixing are the ones the
 * pipeline crushed against their neighbours. Here the word goes where it is put and the words it
 * runs into are pushed along — so `Project.words` stays in playback order, which `deriveBlocks`
 * assumes, `findBlockIndexAt` binary-searches on, and the agent's `select_word_range` reads as an
 * array index.
 *
 * Every word the ripple moves is ONE write and ONE undo step, so taking it back is one Ctrl+Z.
 *
 * SECONDS, not milliseconds, because "a beat off" is a tenth of a second and nobody holds 19_649
 * in their head. Stored as integer ms, as everything in the schema is. A native number input
 * rather than the panel's slider: this is a precise nudge over a whole video, which is what
 * arrow-key stepping is for and what a 300-pixel slider is hopeless at.
 */
function WordTimingFields({
  word,
  words,
  durationMs,
  onRetime,
}: {
  word: Word
  words: Word[]
  durationMs: number
  onRetime: (changes: TimingChange[]) => void
}) {
  // The word the "no room" warning is about, not a bare boolean — so selecting another word
  // drops it at render time rather than needing an effect to reset it.
  const [blockedId, setBlockedId] = useState<string | null>(null)
  const blocked = blockedId === word.id

  /** Returns the ms the edge actually took, so the field can re-seed from the truth. */
  const commit = (edge: 'startMs' | 'endMs', seconds: number): number => {
    const changes = retimeWord(words, word.id, durationMs, { [edge]: Math.round(seconds * 1000) })
    if (changes === null) {
      setBlockedId(word.id)
      return word[edge]
    }
    setBlockedId(null)
    const own = changes.find((change) => change.id === word.id)!
    if (own.startMs !== word.startMs || own.endMs !== word.endMs || changes.length > 1) onRetime(changes)
    return own[edge]
  }

  // How many neighbours the CURRENT times would shove if this word grew — shown before the edit,
  // so "moving this moves three others" is never a surprise discovered afterwards.
  const touching = words.filter(
    (candidate, index) =>
      index > 0 && candidate.id !== word.id && candidate.startMs < words[index - 1].endMs + 1,
  ).length

  return (
    <Field label="Timing" value={`${((word.endMs - word.startMs) / 1000).toFixed(2)}s`}>
      <div className="flex items-center gap-2">
        <TimeInput label="Start" ms={word.startMs} max={durationMs} onCommit={(s) => commit('startMs', s)} />
        <TimeInput label="End" ms={word.endMs} max={durationMs} onCommit={(s) => commit('endMs', s)} />
      </div>
      {blocked ? (
        <p className="text-[10px] leading-snug text-destructive">
          No room — that would push a word past the start or the end of the video.
        </p>
      ) : (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Words this one runs into get pushed along, as one undo step. A gap of {BLOCK_GAP_MS} ms or more starts
          a new caption line, so a big move can re-group the lines around it.
          {touching > 0 && ' Neighbouring words here are touching, so a change is likely to move them.'}
        </p>
      )}
    </Field>
  )
}

/** One edge, in seconds. Same draft-and-commit rule as the text field: Enter or blur, Escape reverts. */
function TimeInput({
  label,
  ms,
  max,
  onCommit,
}: {
  label: string
  ms: number
  max: number
  /** Applies the edit and returns the ms it actually took — see `commit` below for why. */
  onCommit: (seconds: number) => number
}) {
  const toSeconds = (value: number) => (value / 1000).toFixed(2)
  const [draft, setDraft] = useState(toSeconds(ms))
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setDraft(toSeconds(ms))
  }, [ms])

  const commit = () => {
    const parsed = Number.parseFloat(draft)
    // A field left unparseable goes back to the stored value rather than to 0, which is what
    // `Number.parseFloat('')` would otherwise hand the clamp.
    if (!Number.isFinite(parsed)) {
      setDraft(toSeconds(ms))
      return
    }
    // Re-seeded from what the clamp RETURNED, not from the `ms` prop: this render's `ms` is the
    // value from before the edit, and the effect below deliberately will not re-seed a field that
    // still has focus — so seeding from the prop left the field showing the old time until it was
    // clicked away from. Measured: typing -9999 into a start of 0.01s left "0.01" on screen while
    // the word had already moved to 0.00s.
    setDraft(toSeconds(onCommit(parsed)))
  }

  return (
    <label className="flex flex-1 items-center gap-1.5">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        // 50 ms a step: the smallest nudge that is visible at 25 fps, so an arrow key does
        // something you can see. `min`/`max` drive the native steppers; the real guard is
        // `retimeWord`, since neither is enforced on a typed value.
        step={0.05}
        min={0}
        max={max / 1000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(toSeconds(ms))
            event.currentTarget.blur()
          }
        }}
        className="h-8 w-full px-2 text-xs tabular-nums"
      />
      <span className="shrink-0 text-[10px] text-muted-foreground">s</span>
    </label>
  )
}

/**
 * WHAT A HAND EDIT DOES TO THESE, decided here and stated in the panel:
 *
 * NOTHING. They are measurements of the ORIGINAL AUDIO — how loud and how high-pitched that
 * moment was, and how much longer it ran than the speaker's own average. Re-spelling a misheard
 * word does not change the audio, so `loudnessZ` and `pitchZ` stay true of it. Moving the caption
 * a beat earlier does not change it either; it changes when the text is on screen.
 *
 * `durationRatio` and `extraMs` are the two that go out of step, because they describe a SPAN and
 * the span is what a timing edit moves. They are not recomputed, for a reason that is not
 * laziness: the browser has no audio analysis, so the only honest recomputation is another
 * pipeline run, and `POST /projects/{id}/process` deliberately REFUSES to run over a project with
 * hand edits (`has_manual_edits`, routers/projects.py:86) unless forced. Nor are they cleared:
 * `extraMs` is what `renderedText` draws a stretched word's repeats from (lib/caption-style.ts),
 * so clearing it would silently un-stretch "hellooooo" as a side effect of nudging its timing.
 *
 * Leaving them and SAYING SO is the only option that does not either fabricate a measurement or
 * destroy one. `Word.emphasis` is untouched by the same argument — it is a stored decision the
 * pipeline made, and it has its own switch right above.
 */
function SignalsSection({ signals }: { signals: NonNullable<Word['signals']> }) {
  return (
    <Section
      title="Prosody signals"
      hint="Read-only — measured from the original audio by the pipeline. Editing a word's text or timing doesn't re-measure them, so after a timing change the duration figures describe the span as it was recorded."
    >
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
