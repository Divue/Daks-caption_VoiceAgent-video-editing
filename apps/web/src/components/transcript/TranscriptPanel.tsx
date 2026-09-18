import { useMemo, useState } from 'react'
import type { CaptionBlock, Emotion, Word } from '@captions/shared'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { CaptionList } from './CaptionList'
import { TranscriptWordRow } from './TranscriptWordRow'

interface TranscriptPanelProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  onSeekToBlock: (block: CaptionBlock) => void
  followPlayhead: boolean
  mergeShort: boolean
  onMergeShortChange: (value: boolean) => void
  onSetBlockEmotion: (block: CaptionBlock, emotion: Emotion) => void
  onSetWordEmotion: (word: Word, emotion: Emotion) => void
  onSetWordSingle: (word: Word, single: boolean) => void
  onSetWordEmphasis: (word: Word, emphasis: boolean) => void
  emphasisIds: Set<string>
  promotedEmphasisIds: Set<string>
}

export function TranscriptPanel({
  blocks,
  wordsOf,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  onSeekToBlock,
  followPlayhead,
  mergeShort,
  onMergeShortChange,
  onSetBlockEmotion,
  onSetWordEmotion,
  onSetWordSingle,
  onSetWordEmphasis,
  emphasisIds,
  promotedEmphasisIds,
}: TranscriptPanelProps) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim().toLowerCase()

  // Searching drops to a flat word list — matches scattered across blocks read better
  // as a list of hits than as blocks with most of their words missing.
  const matches = useMemo(() => {
    if (!trimmed) return null
    return blocks
      .flatMap((block) => wordsOf(block))
      .filter((word) => word.text.toLowerCase().includes(trimmed))
  }, [trimmed, blocks, wordsOf])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* No title here: CollapsiblePanel's own bar already says CAPTIONS, and two headings
          stacked read as a bug. The block count keeps its place beside the search field. */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-3">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search captions…"
            className="h-8 flex-1 text-sm"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {blocks.length} blocks
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="merge-short" checked={mergeShort} onCheckedChange={onMergeShortChange} />
          <Label htmlFor="merge-short" className="text-xs font-normal text-muted-foreground">
            Merge very short captions
          </Label>
        </div>

        {/* The list carries two unlabelled marks on two different axes — a highlighted word is
            emphasis (per word), a badge at the row's end is tone (per run). Without this, the
            highlight just looks like a third tone. */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/80">
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-primary/15 px-1 font-semibold text-primary">word</span>
            emphasised
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-amber-500/15 px-1 font-medium text-amber-600 dark:text-amber-400">
              TONE
            </span>
            per line
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {matches ? (
          matches.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No words match "{query}".</p>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {matches.map((word) => (
                <TranscriptWordRow
                  key={word.id}
                  word={word}
                  selected={word.id === selectedWordId}
                  onSelect={onSelectWord}
                />
              ))}
            </div>
          )
        ) : (
          <CaptionList
            blocks={blocks}
            wordsOf={wordsOf}
            activeBlockId={activeBlockId}
            selectedWordId={selectedWordId}
            onSelectWord={onSelectWord}
            onSeekToBlock={onSeekToBlock}
            followPlayhead={followPlayhead}
            onSetBlockEmotion={onSetBlockEmotion}
            onSetWordEmotion={onSetWordEmotion}
            onSetWordSingle={onSetWordSingle}
            onSetWordEmphasis={onSetWordEmphasis}
            emphasisIds={emphasisIds}
            promotedEmphasisIds={promotedEmphasisIds}
          />
        )}
      </div>
    </div>
  )
}
