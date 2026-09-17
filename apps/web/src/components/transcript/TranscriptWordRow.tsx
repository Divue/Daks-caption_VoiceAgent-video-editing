import { cn } from '@/lib/utils'
import type { Word } from '@captions/shared'

interface TranscriptWordRowProps {
  word: Word
  selected: boolean
  onSelect: (wordId: string) => void
}

function formatTimestamp(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export function TranscriptWordRow({ word, selected, onSelect }: TranscriptWordRowProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(word.id)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
        selected && 'border-ring bg-accent text-accent-foreground',
      )}
    >
      <span className={cn(word.emphasis && 'font-semibold')}>
        {word.text}
        {word.emoji ? ` ${word.emoji}` : ''}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatTimestamp(word.startMs)}
      </span>
    </button>
  )
}
