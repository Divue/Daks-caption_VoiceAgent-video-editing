import { useEffect, useRef } from 'react'
import { ChevronDown, SquareSplitVertical } from 'lucide-react'
import type { CaptionBlock, Emotion, Word } from '@captions/shared'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'
import { renderedText } from '@/lib/caption-style'
import { EMOTION_BADGE, EMOTION_DOT, EMOTION_OPTIONS } from '@/lib/emotion'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CaptionListProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  onSeekToBlock: (block: CaptionBlock) => void
  /** True while the user is playing; only then does the list follow the playhead. */
  followPlayhead: boolean
  /** Sets `emotion` on every word of a line. */
  onSetBlockEmotion: (block: CaptionBlock, emotion: Emotion) => void
  /** Sets `emotion` on one word — which SPLITS its line, see the note below. */
  onSetWordEmotion: (word: Word, emotion: Emotion) => void
  /** Pulls one word out of its line into a block of its own, or puts it back. */
  onSetWordSingle: (word: Word, single: boolean) => void
  /** Sets `emphasis` on one word — the preset's biggest visual lever. */
  onSetWordEmphasis: (word: Word, emphasis: boolean) => void
  /** Every word id drawn in the emphasis face: stored plus rhythm-promoted. */
  emphasisIds: Set<string>
  /** Only the ids the rhythm rule added. These are NOT stored on the word. */
  promotedEmphasisIds: Set<string>
}

/**
 * Caption BLOCKS, numbered, with their words inline — the reference product's shape, and a
 * far better map of the video than a flat word list. Emphasised words are drawn as pills.
 *
 * Both edits here re-group the list as you make them, which is the feature, not a glitch:
 * blocks are DERIVED from words (deriveBlocks), never stored. Setting one word's emotion
 * breaks its line in two or three (rule 3, tone runs are uniform by construction); marking a
 * word `single` fences it into its own block (rule 4). The row numbers shift underneath
 * because there are genuinely now more lines in the video.
 */
export function CaptionList({
  blocks,
  wordsOf,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  onSeekToBlock,
  followPlayhead,
  onSetBlockEmotion,
  onSetWordEmotion,
  onSetWordSingle,
  onSetWordEmphasis,
  emphasisIds,
  promotedEmphasisIds,
}: CaptionListProps) {
  const activeRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (!followPlayhead) return
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeBlockId, followPlayhead])

  if (blocks.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No captions yet.</p>
  }

  return (
    <ol className="flex flex-col">
      {blocks.map((block, index) => {
        const words = wordsOf(block)
        const isActive = block.id === activeBlockId
        return (
          <li
            key={block.id}
            ref={isActive ? activeRef : null}
            className={cn(
              'group/row flex gap-2 border-b px-2 py-2 text-sm transition-colors',
              isActive && 'bg-primary/5',
              // A deliberate one-word line is marked on the row, so it reads as a choice
              // rather than as the list having fragmented on its own.
              block.isSingle && 'border-l-2 border-l-primary/60',
            )}
          >
            <button
              type="button"
              onClick={() => onSeekToBlock(block)}
              title={`Jump to ${formatTimestamp(block.startMs)}`}
              className="w-6 shrink-0 text-left text-xs tabular-nums text-muted-foreground hover:text-foreground"
            >
              {index + 1}
            </button>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
              {words.map((word) => (
                <WordChip
                  key={word.id}
                  word={word}
                  selected={word.id === selectedWordId}
                  emphasised={emphasisIds.has(word.id)}
                  promoted={promotedEmphasisIds.has(word.id)}
                  onSelect={onSelectWord}
                  onSetEmotion={onSetWordEmotion}
                  onSetSingle={onSetWordSingle}
                  onSetEmphasis={onSetWordEmphasis}
                />
              ))}
            </div>

            <BlockToneMenu block={block} onSetEmotion={onSetBlockEmotion} />
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The tone badge, now a control. A non-neutral badge is always visible because it is
 * information; the neutral one only appears on hover/focus, because 35 rows each shouting
 * NEUTRAL is noise. It stays in the layout either way, so rows never jump on hover.
 */
function BlockToneMenu({
  block,
  onSetEmotion,
}: {
  block: CaptionBlock
  onSetEmotion: (block: CaptionBlock, emotion: Emotion) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Set this line's emotion"
          className={cn(
            'flex h-fit shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium uppercase transition-opacity hover:ring-1 hover:ring-border',
            EMOTION_BADGE[block.tone],
            block.tone === 'neutral' &&
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          )}
        >
          {block.tone}
          <ChevronDown className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Line emotion</DropdownMenuLabel>
        {EMOTION_OPTIONS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onSetEmotion(block, option)}>
            <span className={cn('size-2 rounded-full', EMOTION_DOT[option])} />
            <span className="flex-1 capitalize">{option}</span>
            {block.tone === option && <span className="text-xs text-muted-foreground">current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One word: click to select it (which drives the inspector), chevron for its own emotion and
 * the Single toggle. The chevron is hidden until the word is hovered, selected or its menu is
 * open — otherwise every word in the transcript carries a permanent piece of UI.
 */
function WordChip({
  word,
  selected,
  emphasised,
  promoted,
  onSelect,
  onSetEmotion,
  onSetSingle,
  onSetEmphasis,
}: {
  word: Word
  selected: boolean
  /** Renders in the emphasis face — stored on the word, or promoted by the rhythm rule. */
  emphasised: boolean
  /** Promoted, i.e. NOT stored. Drawn as an outline so the two are never confused. */
  promoted: boolean
  onSelect: (wordId: string) => void
  onSetEmotion: (word: Word, emotion: Emotion) => void
  onSetSingle: (word: Word, single: boolean) => void
  onSetEmphasis: (word: Word, emphasis: boolean) => void
}) {
  const isSingle = word.single === true

  return (
    <span
      // Emphasis has no label anywhere in the panel, so it says what it is on hover. Green said
      // nothing and, sitting beside the amber/red tone badges, read as a third emotion rather
      // than a different axis — emphasis is per word, tone is per run.
      title={
        promoted
          ? 'Auto-emphasised to keep the preset from going flat. Not saved — click to keep it.'
          : emphasised
            ? 'Emphasised \u2014 drawn in the preset\u2019s emphasis face'
            : undefined
      }
      className={cn(
        'group/word inline-flex items-center rounded transition-colors',
        // Emphasis reads as a pill, which is a clearer affordance than bold text. Primary, because
        // "the loud word" is exactly what the brand colour is for.
        emphasised && !promoted && 'bg-primary/15 font-semibold text-primary',
        // A promoted word is drawn but NOT stored, so it gets an outline rather than a fill. The
        // distinction has to survive a glance: filled means the pipeline found it, outlined means
        // the renderer is filling a gap and a reload could choose differently.
        promoted && 'font-semibold text-primary ring-1 ring-primary/40 ring-inset',
        selected && 'ring-2 ring-primary ring-offset-1',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(word.id)}
        className="rounded px-1 py-0.5 text-left transition-colors hover:bg-muted"
      >
        {renderedText(word)}
        {word.emoji ? ` ${word.emoji}` : ''}
      </button>

      {isSingle && (
        <SquareSplitVertical
          className="mr-0.5 size-3 shrink-0 text-primary"
          aria-label="Shown on its own"
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Options for "${word.text}"`}
            className={cn(
              'mr-0.5 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground',
              'opacity-0 group-hover/word:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
              selected && 'opacity-100',
            )}
          >
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={emphasised}
            onCheckedChange={(checked) => onSetEmphasis(word, checked === true)}
          >
            Emphasis
          </DropdownMenuCheckboxItem>
          {promoted && (
            <p className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">
              Auto, to keep the line from going flat. Tick to keep it.
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Word emotion</DropdownMenuLabel>
          {EMOTION_OPTIONS.map((option) => (
            <DropdownMenuItem key={option} onSelect={() => onSetEmotion(word, option)}>
              <span className={cn('size-2 rounded-full', EMOTION_DOT[option])} />
              <span className="flex-1 capitalize">{option}</span>
              {word.emotion === option && (
                <span className="text-xs text-muted-foreground">current</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={isSingle}
            onCheckedChange={(checked) => onSetSingle(word, checked === true)}
          >
            Single
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
