import type { CaptionBlock, Word } from '@captions/shared'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'

interface CaptionTrackProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  pxPerMs: number
  durationMs: number
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  onSeek: (ms: number) => void
}

/**
 * One clip per caption BLOCK, with its words as click targets inside it.
 *
 * The reference draws one clip per word; at our fit-to-width zoom a 94-word clip gives each
 * word about 4 px, which is unreadable and unclickable. Blocks carry the same information
 * at a legible size, and the words stay individually selectable inside them (plan §1.8).
 */
export function CaptionTrack({
  blocks,
  wordsOf,
  pxPerMs,
  durationMs,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  onSeek,
}: CaptionTrackProps) {
  return (
    <div
      className="relative h-11 border-b bg-muted/20"
      style={{ width: durationMs * pxPerMs }}
      onPointerDown={(event) => {
        // Clicking empty track seeks; clicks on a block are handled by the block itself.
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      {blocks.map((block) => {
        const left = block.startMs * pxPerMs
        const width = Math.max(2, (block.endMs - block.startMs) * pxPerMs)
        const words = wordsOf(block)
        const isActive = block.id === activeBlockId

        return (
          <div
            key={block.id}
            className={cn(
              'absolute top-1 bottom-1 flex overflow-hidden rounded border transition-colors',
              isActive ? 'border-primary bg-primary/20' : 'border-amber-500/40 bg-amber-500/15',
            )}
            style={{ left, width }}
            title={`${formatTimestamp(block.startMs)} — ${words.map((word) => word.text).join(' ')}`}
          >
            {words.map((word) => (
              <button
                key={word.id}
                type="button"
                onClick={() => onSelectWord(word.id)}
                onDoubleClick={() => onSeek(word.startMs)}
                title={word.text}
                className={cn(
                  'min-w-0 flex-1 truncate border-r border-amber-500/30 px-0.5 text-left text-[10px] leading-none last:border-r-0 hover:bg-white/30',
                  word.emphasis && 'font-bold',
                  word.id === selectedWordId && 'bg-primary/40',
                )}
              >
                {/* At fit-to-width a block is ~60 px wide, so text is truncated by design;
                    the full words are in the title and in the captions list. */}
                {word.text}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
