import { useEffect, useRef } from 'react'
import type { CaptionBlock, Word } from '@captions/shared'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'
import { renderedText } from '@/lib/caption-style'

interface CaptionListProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  onSeekToBlock: (block: CaptionBlock) => void
  /** True while the user is playing; only then does the list follow the playhead. */
  followPlayhead: boolean
}

/**
 * Caption BLOCKS, numbered, with their words inline — the reference product's shape, and a
 * far better map of the video than a flat word list. Emphasised words are drawn as pills.
 *
 * Single-word blocks are normal here and are left alone: the reference ships them too.
 */
export function CaptionList({
  blocks,
  wordsOf,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  onSeekToBlock,
  followPlayhead,
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
              'flex gap-2 border-b px-2 py-2 text-sm transition-colors',
              isActive && 'bg-primary/5',
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
                <button
                  key={word.id}
                  type="button"
                  onClick={() => onSelectWord(word.id)}
                  className={cn(
                    'rounded px-1 py-0.5 text-left transition-colors hover:bg-muted',
                    // Emphasis reads as a pill, which is a clearer affordance than bold text.
                    word.emphasis && 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-400',
                    word.id === selectedWordId && 'ring-2 ring-primary ring-offset-1',
                  )}
                >
                  {renderedText(word)}
                  {word.emoji ? ` ${word.emoji}` : ''}
                </button>
              ))}
            </div>

            {block.tone !== 'neutral' && (
              <span
                className={cn(
                  'h-fit shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase',
                  block.tone === 'angry' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                  block.tone === 'excited' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                )}
              >
                {block.tone}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
