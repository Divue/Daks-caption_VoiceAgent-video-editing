import type { CaptionBlock, Word } from '@captions/shared'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'

interface CaptionRibbonProps {
  blocks: CaptionBlock[]
  wordsOf: (block: CaptionBlock) => Word[]
  emphasisIds: Set<string>
  pxPerMs: number
  durationMs: number
  height: number
  activeBlockId: string | null
  selectedWordId: string | null
  onSelectWord: (wordId: string) => void
  onSeek: (ms: number) => void
}

/**
 * The whole video as one lane of caption blocks.
 *
 * The top lane of the timeline, and the only one the user edits from.
 *
 * What it owes them is the one thing the caption list cannot show: the SHAPE of the video. So tone
 * is the segment's own tint rather than a badge, and the emphasised word is legible inside the
 * segment. Scanning it tells you where the video is angry, where it is excited, and where the big
 * words land — which is the product's actual pitch.
 */

/** Tone as a surface, not a label. Kept low-saturation: 30 of these are on screen at once. */
const TONE_SURFACE: Record<CaptionBlock['tone'], string> = {
  neutral: 'bg-white/6 hover:bg-white/10',
  angry: 'bg-rose-500/12 hover:bg-rose-500/18',
  excited: 'bg-amber-400/12 hover:bg-amber-400/18',
}

/** A 2px spine on the leading edge, which is what makes a run of one tone readable at a glance. */
const TONE_SPINE: Record<CaptionBlock['tone'], string> = {
  neutral: 'bg-white/20',
  angry: 'bg-rose-400/70',
  excited: 'bg-amber-300/70',
}

export function CaptionRibbon({
  blocks,
  wordsOf,
  emphasisIds,
  pxPerMs,
  durationMs,
  height,
  activeBlockId,
  selectedWordId,
  onSelectWord,
  onSeek,
}: CaptionRibbonProps) {
  return (
    <div
      className="relative border-b border-border/40"
      style={{ width: durationMs * pxPerMs, height }}
      onPointerDown={(event) => {
        // Clicking empty ribbon seeks; clicks on a block are handled by the block itself.
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        onSeek((event.clientX - rect.left) / pxPerMs)
      }}
      role="presentation"
    >
      {blocks.map((block) => {
        const left = block.startMs * pxPerMs
        const width = Math.max(3, (block.endMs - block.startMs) * pxPerMs)
        const words = wordsOf(block)
        const isActive = block.id === activeBlockId

        return (
          <div
            key={block.id}
            className={cn(
              'absolute top-2 bottom-2 flex overflow-hidden rounded-[3px] transition-colors',
              TONE_SURFACE[block.tone],
              // The active block is the only ring in the strip, and the playhead is the only
              // orange. Everything else stays on the neutral scale (audit 16 §3.3).
              isActive && 'ring-1 ring-white/35',
            )}
            style={{ left, width }}
            title={`${formatTimestamp(block.startMs)} — ${words.map((word) => word.text).join(' ')}`}
          >
            <span className={cn('w-[2px] shrink-0', TONE_SPINE[block.tone])} aria-hidden />
            <div className="flex min-w-0 flex-1">
              {words.map((word) => (
                <button
                  key={word.id}
                  type="button"
                  onClick={() => onSelectWord(word.id)}
                  onDoubleClick={() => onSeek(word.startMs)}
                  title={word.text}
                  className={cn(
                    'min-w-0 flex-1 truncate px-1 text-left text-[10px] leading-none transition-colors',
                    'hover:bg-white/10',
                    // Emphasis is the loud word, so it is the bright one. Weight alone does not
                    // survive at 10px on a tinted surface.
                    emphasisIds.has(word.id)
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground',
                    word.id === selectedWordId && 'bg-primary/25 text-foreground',
                  )}
                >
                  {/* At fit-to-width a block is ~60 px wide, so text is truncated by design;
                      the full words are in the title and in the captions list. */}
                  {word.text}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
