// Caption blocks: the grouping of flat `words` into the lines drawn on screen.
//
// The schema has no `lines[]` (proposed in .claude/audits/11 §6, not landed), so grouping is
// derived. It lives HERE, in the shared package, because two renderers need the identical answer:
// the editor's preview/timeline (apps/web, P3) and the Remotion composition (remotion/, P2).
// A local copy in either one is how they silently drift apart.
//
// Pure function, no dependencies, no I/O. Times are integer ms, as everywhere else.
import type { Emotion, Word } from './project'

export type CaptionBlock = {
  id: string
  startMs: number
  endMs: number
  tone: Emotion // uniform across the block: a tone change always starts a new block
  wordIds: string[]
  /**
   * This block is one word that asked to stand alone (`Word.single`), not an incidental
   * block of one. The distinction matters to mergeShortBlocks: an incidental short block
   * gets folded into a neighbour, a deliberate one must never be.
   */
  isSingle: boolean
}

export type BlockOptions = {
  /** A silence at least this long starts a new block. */
  gapMs?: number
  /** Max words per block. Callers pass the preset's `wordsPerLine`. */
  maxWords?: number
  /**
   * Blocks shorter than this are merged into a same-tone neighbour, so a 120 ms flash
   * doesn't appear on screen. Pass 0 to keep the pipeline's raw grouping.
   */
  mergeShorterThanMs?: number
}

/** Fitted by eye on the four test clips (Normal, Excited, Angry, Real_reel). Not measured. */
export const BLOCK_GAP_MS = 320
export const MIN_BLOCK_MS = 250

/**
 * Group words into caption blocks. A block breaks when ANY of these is true:
 *   1. the silence before a word is >= gapMs,
 *   2. the block already holds maxWords words,
 *   3. the word's emotion differs from the block's (tone arrives in runs, not scattered),
 *   4. the word is `single`, or the previous word was — a single word is fenced on both
 *      sides, so it lands in a block of exactly one and its neighbours regroup without it.
 *
 * Words are assumed to be in playback order, which is what the pipeline emits.
 */
export function deriveBlocks(words: Word[], options: BlockOptions = {}): CaptionBlock[] {
  const gapMs = options.gapMs ?? BLOCK_GAP_MS
  const maxWords = options.maxWords ?? Infinity
  const mergeShorterThanMs = options.mergeShorterThanMs ?? MIN_BLOCK_MS
  if (words.length === 0) return []

  const blocks: CaptionBlock[] = []
  let current: Word[] = []

  const flush = () => {
    if (current.length === 0) return
    blocks.push(toBlock(current))
    current = []
  }

  for (const word of words) {
    const previous = current[current.length - 1]
    const breaks =
      previous !== undefined &&
      (word.single === true ||
        previous.single === true ||
        word.startMs - previous.endMs >= gapMs ||
        current.length >= maxWords ||
        word.emotion !== previous.emotion)
    if (breaks) flush()
    current.push(word)
  }
  flush()

  return mergeShorterThanMs > 0 ? mergeShortBlocks(blocks, mergeShorterThanMs, maxWords) : blocks
}

function toBlock(words: Word[]): CaptionBlock {
  return {
    // Derived from the first word so React keys stay stable when a neighbouring block changes.
    // Word ids are positional (build.py), so any id is only stable within one pipeline run.
    id: `b-${words[0].id}`,
    startMs: words[0].startMs,
    endMs: Math.max(...words.map((word) => word.endMs)),
    tone: words[0].emotion,
    wordIds: words.map((word) => word.id),
    // Rule 4 fences a single word on both sides, so a `single` word is always alone here.
    isSingle: words.length === 1 && words[0].single === true,
  }
}

/**
 * Fold a too-short block into the adjacent block it belongs with. Only a same-tone neighbour is
 * eligible (merging across tones would put two colours in one block) and only when the result
 * still fits maxWords, so a merge can never break rule 2 above. A block with no eligible
 * neighbour is left as it is: showing it briefly beats mislabelling it.
 *
 * A `single` block is never merged, from either side. Most single words are under minMs, so
 * without this guard "show it alone" would be silently undone by the merge pass for exactly
 * the short words a user is most likely to pull out.
 */
function mergeShortBlocks(blocks: CaptionBlock[], minMs: number, maxWords: number): CaptionBlock[] {
  const isShort = (block: CaptionBlock) => block.endMs - block.startMs < minMs
  const canJoin = (left: CaptionBlock, right: CaptionBlock) =>
    !left.isSingle &&
    !right.isSingle &&
    left.tone === right.tone &&
    left.wordIds.length + right.wordIds.length <= maxWords
  const join = (left: CaptionBlock, right: CaptionBlock): CaptionBlock => ({
    ...left,
    endMs: Math.max(left.endMs, right.endMs),
    wordIds: [...left.wordIds, ...right.wordIds],
  })

  // Pass 1: fold each short block back into the block before it.
  const back: CaptionBlock[] = []
  for (const block of blocks) {
    const previous = back[back.length - 1]
    if (isShort(block) && previous !== undefined && canJoin(previous, block)) {
      back[back.length - 1] = join(previous, block)
    } else {
      back.push(block)
    }
  }

  // Pass 2: a short block with no eligible predecessor (the first one, or after a tone change)
  // absorbs the block after it instead. One that can do neither is left alone — showing it
  // briefly beats mislabelling it.
  const out: CaptionBlock[] = []
  for (let index = 0; index < back.length; index++) {
    const block = back[index]
    const next = back[index + 1]
    if (isShort(block) && next !== undefined && canJoin(block, next)) {
      out.push(join(block, next))
      index++
      continue
    }
    out.push(block)
  }
  return out
}

/** The block containing this time, or undefined in a gap between blocks. */
export function blockAt(blocks: CaptionBlock[], timeMs: number): CaptionBlock | undefined {
  return blocks.find((block) => timeMs >= block.startMs && timeMs < block.endMs)
}
