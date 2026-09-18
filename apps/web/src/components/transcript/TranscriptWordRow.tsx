import type { Word } from '@captions/shared'
import { LayerTags } from '@/components/captions/LayerTags'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TranscriptWordRowProps {
  word: Word
  selected: boolean
  onSelect: (wordId: string) => void
}

/** One transcript word: mono timestamp (precision), the word, and its caption-layer tags. */
export function TranscriptWordRow({ word, selected, onSelect }: TranscriptWordRowProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(word.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors duration-150',
        selected
          ? 'border-l-signal bg-surface-raised text-foreground'
          : 'border-l-transparent text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground',
      )}
    >
      <span className="shrink-0 font-mono text-[11px] text-precision/80 tabular-nums">
        {formatTimestamp(word.startMs)}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', (selected || word.emphasis) && 'font-semibold text-foreground')}>
        {word.text}
        {word.emoji ? ` ${word.emoji}` : ''}
      </span>
      <LayerTags word={word} />
    </button>
  )
}
