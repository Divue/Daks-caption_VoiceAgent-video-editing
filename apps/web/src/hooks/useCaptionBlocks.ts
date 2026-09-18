import { useMemo } from 'react'
import { MIN_BLOCK_MS, PRESETS, deriveBlocks } from '@captions/shared'
import type { CaptionBlock, Word } from '@captions/shared'
import { useProject } from '@/state/project-context'

export interface CaptionBlocks {
  blocks: CaptionBlock[]
  /** Blocks carry word ids, not words, so every consumer needs this lookup. */
  wordById: Map<string, Word>
  wordsOf: (block: CaptionBlock) => Word[]
}

/**
 * Words → caption blocks, memoised on the inputs that can change the answer.
 *
 * `deriveBlocks` comes from @captions/shared, not from a local copy: P2's Remotion
 * composition imports the identical function, and a copy that drifts is exactly the
 * failure that module exists to prevent (plan §3.1).
 *
 * `mergeShort` is a VIEW preference — local UI state, threaded in as an argument. It is
 * deliberately not in Project.settings, which would be a schema change, and not in
 * project-reducer, which would put a view toggle in the undo history.
 */
export function useCaptionBlocks(mergeShort: boolean): CaptionBlocks {
  const { project } = useProject()

  return useMemo(() => {
    const wordById = new Map(project.words.map((word) => [word.id, word]))
    // `wordsPerLine` is a PRESET field, but a stored override beats it: "fewer words per
    // line" is one of the most common short-form caption requests and it has to survive a
    // reload, so it lives on the Project (see PresetOverride in packages/shared).
    const blocks = deriveBlocks(project.words, {
      maxWords: project.presetOverride?.wordsPerLine ?? PRESETS[project.presetId].wordsPerLine,
      mergeShorterThanMs: mergeShort ? MIN_BLOCK_MS : 0,
    })
    const wordsOf = (block: CaptionBlock) =>
      block.wordIds.map((id) => wordById.get(id)).filter((word): word is Word => word !== undefined)
    return { blocks, wordById, wordsOf }
  }, [project.words, project.presetId, project.presetOverride?.wordsPerLine, mergeShort])
}

/**
 * Index of the block containing `timeMs`, or -1 in a gap between blocks.
 * Binary search: words are sorted by startMs with no negative gaps and no zero-width
 * entries (verified across all four pipeline projects), so blocks inherit that order.
 */
export function findBlockIndexAt(blocks: CaptionBlock[], timeMs: number): number {
  let low = 0
  let high = blocks.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const block = blocks[mid]
    if (timeMs < block.startMs) high = mid - 1
    else if (timeMs >= block.endMs) low = mid + 1
    else return mid
  }
  return -1
}
