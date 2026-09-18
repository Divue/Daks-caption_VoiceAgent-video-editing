import { formatTimecode } from '@/lib/format'
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
      {/* Search drops to single words, so each one shows its OWN start and end, in the
          same tenth-of-a-second form the caption rows use, so one panel speaks one language. */}
      <span className="shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground/70">
        {formatTimecode(word.startMs, 100)}
        <span className="px-0.5 text-muted-foreground/40">&ndash;</span>
        {formatTimecode(word.endMs, 100)}
      </span>
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
