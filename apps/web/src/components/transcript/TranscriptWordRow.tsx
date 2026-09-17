import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Word } from '@captions/shared'

interface TranscriptWordRowProps {
  word: Word
  selected: boolean
  onSelect: (wordId: string) => void
}

export function TranscriptWordRow({ word, selected, onSelect }: TranscriptWordRowProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(word.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border-l-2 border-l-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
        selected ? 'border-l-primary bg-primary/5 text-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTimestamp(word.startMs)}</span>
      <span
        className={cn(
          'flex-1',
          selected && 'font-semibold',
          word.emphasis && !selected && 'font-semibold text-foreground',
        )}
      >
        {word.text}
        {word.emoji ? ` ${word.emoji}` : ''}
      </span>
    </button>
  )
}
