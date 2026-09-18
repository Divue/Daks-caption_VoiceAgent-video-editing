import { useMemo, useState } from 'react'
import type { CaptionBlock, Word } from '@captions/shared'
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
      <div className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Captions</p>
          <span className="text-xs tabular-nums text-muted-foreground">{blocks.length} blocks</span>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search captions..."
          className="h-8 text-sm"
        />

        <div className="flex items-center gap-2">
          <Switch id="merge-short" checked={mergeShort} onCheckedChange={onMergeShortChange} />
          <Label htmlFor="merge-short" className="text-xs font-normal text-muted-foreground">
            Merge very short captions
          </Label>
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
          />
        )}
      </div>
    </div>
  )
}
