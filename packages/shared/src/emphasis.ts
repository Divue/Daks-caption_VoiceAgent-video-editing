// Which words RENDER as emphasised, which is not quite the same question as which words the
// prosody pipeline marked.
//
// Pure, no I/O, no dependencies beyond the types — same contract as blocks.ts, because P2's
// Remotion composition needs the identical answer to the editor's preview. A local copy in
// either one is how they silently drift apart.
import type { CaptionBlock } from './blocks'
import type { Word } from './project'
import { DEFAULT_EMPHASIS_EVERY_BLOCKS } from './presets'

/**
 * The set of word ids to draw in the preset's emphasis face.
 *
 * Every one of the rebuilt presets is BUILT AROUND emphasis: the size jump, the second typeface,
 * the colour, the halo. All of that is dead weight on a stretch of speech the pipeline found
 * nothing to stress in, and plain narration produces exactly such stretches — the result is
 * seconds of flat body text, which is when these looks are at their worst. So when more than
 * `everyBlocks` blocks would pass with nothing emphasised, the strongest candidate in the block
 * is promoted.
 *
 * TWO THINGS THIS DELIBERATELY IS NOT:
 *
 * 1. It is not a write. Nothing here touches `Word.emphasis`, so a promoted word can never be
 *    mistaken later for something the prosody analysis actually found, and turning the rule off
 *    (or switching preset) restores the pipeline's own answer exactly.
 * 2. It is not a replacement for the pipeline's judgement. A stored `emphasis: true` is always
 *    honoured and always resets the counter; promotion only ever fills a gap.
 *
 * `promoted` is returned separately so the UI can be honest about which is which.
 */
export interface ResolvedEmphasis {
  /** Every word id that renders emphasised — stored plus promoted. */
  ids: Set<string>
  /** Only the ids this rule added. A superset check against `ids` is not enough to tell them apart. */
  promoted: Set<string>
}

export function resolveEmphasis(
  words: Word[],
  blocks: CaptionBlock[],
  everyBlocks: number = DEFAULT_EMPHASIS_EVERY_BLOCKS,
): ResolvedEmphasis {
  const ids = new Set<string>()
  const promoted = new Set<string>()
  for (const word of words) {
    if (word.emphasis) ids.add(word.id)
  }

  if (everyBlocks <= 0 || blocks.length === 0) return { ids, promoted }

  const byId = new Map(words.map((word) => [word.id, word]))
  let sinceEmphasis = 0

  for (const block of blocks) {
    const blockWords = block.wordIds
      .map((id) => byId.get(id))
      .filter((word): word is Word => word !== undefined)

    if (blockWords.some((word) => ids.has(word.id))) {
      sinceEmphasis = 0
      continue
    }

    sinceEmphasis += 1
    if (sinceEmphasis < everyBlocks) continue

    const candidate = pickCandidate(blockWords)
    if (!candidate) continue // nothing worth promoting; try again next block
    ids.add(candidate.id)
    promoted.add(candidate.id)
    sinceEmphasis = 0
  }

  return { ids, promoted }
}

/**
 * The most stressed-sounding word in a block.
 *
 * Prosody first, because the pipeline already measured it and "loudest and highest-pitched" is
 * the same thing a human would have picked. `durationRatio` joins them at a lower weight: a word
 * held longer than expected reads as stressed too, and it is the signal that survives on quiet
 * audio where the z-scores are all near zero.
 *
 * With no signals at all (a hand-authored fixture, an agent-inserted word) it falls back to the
 * longest word, which beats "the first one" — function words like "hai" and "ka" are short, so
 * length is a weak but real proxy for which word carries the meaning.
 *
 * One-word blocks are skipped: promoting the only word in a block emphasises the whole line,
 * which is not emphasis, it is just a bigger line.
 */
function pickCandidate(blockWords: Word[]): Word | undefined {
  if (blockWords.length < 2) return undefined

  let best: Word | undefined
  let bestScore = -Infinity
  for (const word of blockWords) {
    const score = stressScore(word)
    if (score > bestScore) {
      bestScore = score
      best = word
    }
  }
  return best
}

function stressScore(word: Word): number {
  const signals = word.signals
  if (!signals) return word.text.length / 100 // tiny, so any real signal outranks it
  return (
    signals.loudnessZ +
    signals.pitchZ +
    Math.max(0, signals.durationRatio - 1) * 0.5 +
    word.text.length / 100
  )
}
