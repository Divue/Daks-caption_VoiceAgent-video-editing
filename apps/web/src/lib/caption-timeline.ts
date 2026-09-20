// Words -> the caption timeline: the blocks, which words render emphasised, and WHICH PRESET
// each block is drawn with.
//
// This is the one place `Project.presetSegments` is turned into pixels-worth of decisions, and it
// is imported by BOTH renderers — the editor's `useCaptionBlocks` and the Remotion composition
// (`remotion/src/CaptionVideo.tsx`) — for the same reason `resolve-preset.ts` and `layers.ts` are:
// a second copy is how the preview and the export drift apart. Pure, no React.
//
// WHY A SEGMENT IS DERIVED SEPARATELY RATHER THAN AS A `deriveBlocks` RULE
//
// `wordsPerLine` is a PRESET property that `deriveBlocks` consumes as `maxWords`, so with
// segments the grouping itself is time-dependent and one `maxWords` argument cannot express it.
// Adding "the word's segment differs" as a fifth break rule would still leave that, and would
// additionally need a matching guard in `mergeShortBlocks`'s `canJoin` — without one, a short
// block at a boundary folds into its neighbour and the resulting block spans two presets, which
// has no drawable answer. Deriving PER SEGMENT gives both for free and leaves `blocks.ts` and
// `emphasis.ts` (lead-owned, shared with the pipeline) untouched.
//
// THE SAME PARTITION ANSWERS `emphasisEveryBlocks`
//
// `resolveEmphasis` takes ONE `everyBlocks` for the whole run of blocks, and with segments there
// are several. It is run per segment, with that segment's own value, and the id sets are unioned.
// The rule exists to stop several blocks in a row going by with nothing emphasised UNDER ONE
// LOOK — a stretch of flat body text is what the preset's size/face/colour jump is there to
// break. A preset change is itself that break, so the counter restarting at a boundary is what
// the rule means, not an approximation of it. It also keeps a preset that disables promotion
// (`mrbeast`, `emphasisEveryBlocks: 0`) from silently disabling it for the rest of the video.
import { PRESETS, deriveBlocks, resolveEmphasis } from '@captions/shared'
import type { CaptionBlock, Preset, PresetSegment, Project, Word } from '@captions/shared'
import { resolvePreset } from '@/lib/resolve-preset'
import type { PresetOverride } from '@/lib/resolve-preset'
import { segmentAt } from '@/lib/preset-segments'

export interface CaptionTimeline {
  blocks: CaptionBlock[]
  /** Blocks carry word ids, not words, so every consumer needs this lookup. */
  wordById: Map<string, Word>
  wordsOf: (block: CaptionBlock) => Word[]
  /** Every word id that renders emphasised — stored plus the rhythm rule's promotions. */
  emphasisIds: Set<string>
  /** Only the ids the rhythm rule added, so the UI can stay honest about which is which. */
  promotedIds: Set<string>
  /**
   * The preset a block is drawn with. Every word in a block shares one segment by construction,
   * so this is well defined. An unknown id falls back to the project's own preset.
   */
  presetOfBlock: (blockId: string) => Preset
  /** The preset in force at a time — what the style panel edits and the agent is told about. */
  presetAt: (timeMs: number) => Preset
}

/** The preset a segment draws with, or the project's own where there is no segment. */
export function resolveSegmentPreset(project: Project, segment: PresetSegment | undefined): Preset {
  const presetId = segment?.presetId ?? project.presetId
  // A segment's override REPLACES the project's rather than stacking on it — see PresetSegment
  // in project.ts. Two overrides merged in sequence would make "clear this key" depend on which
  // level wrote it last.
  const override = (segment ? segment.presetOverride : project.presetOverride) ?? {}
  return resolvePreset(PRESETS[presetId], override as PresetOverride)
}

export interface CaptionTimelineOptions {
  /** Blocks shorter than this are folded into a same-tone neighbour. 0 keeps the raw grouping. */
  mergeShorterThanMs: number
}

export function buildCaptionTimeline(
  project: Project,
  { mergeShorterThanMs }: CaptionTimelineOptions,
): CaptionTimeline {
  const segments = project.presetSegments ?? []
  const wordById = new Map(project.words.map((word) => [word.id, word]))

  const presetCache = new Map<string, Preset>()
  const presetOf = (segment: PresetSegment | undefined): Preset => {
    const key = segment?.id ?? ''
    const cached = presetCache.get(key)
    if (cached) return cached
    const preset = resolveSegmentPreset(project, segment)
    presetCache.set(key, preset)
    return preset
  }

  // A word belongs to the segment containing its START. Runs are contiguous because segments are
  // sorted and disjoint and `Project.words` is in playback order — but the lookup is a scan, not
  // a marching pointer, so a hand-authored out-of-order fixture groups oddly rather than wrongly.
  const runs: { segment: PresetSegment | undefined; words: Word[] }[] = []
  for (const word of project.words) {
    const segment = segmentAt(segments, word.startMs)
    const last = runs[runs.length - 1]
    if (last && last.segment === segment) last.words.push(word)
    else runs.push({ segment, words: [word] })
  }

  const blocks: CaptionBlock[] = []
  const emphasisIds = new Set<string>()
  const promotedIds = new Set<string>()
  const presetByBlockId = new Map<string, Preset>()

  for (const run of runs) {
    const preset = presetOf(run.segment)
    const runBlocks = deriveBlocks(run.words, {
      maxWords: preset.wordsPerLine,
      mergeShorterThanMs,
    })
    const emphasis = resolveEmphasis(run.words, runBlocks, preset.emphasisEveryBlocks)
    for (const id of emphasis.ids) emphasisIds.add(id)
    for (const id of emphasis.promoted) promotedIds.add(id)
    for (const block of runBlocks) {
      presetByBlockId.set(block.id, preset)
      blocks.push(block)
    }
  }

  return {
    blocks,
    wordById,
    wordsOf: (block) =>
      block.wordIds.map((id) => wordById.get(id)).filter((word): word is Word => word !== undefined),
    emphasisIds,
    promotedIds,
    presetOfBlock: (blockId) => presetByBlockId.get(blockId) ?? presetOf(undefined),
    presetAt: (timeMs) => presetOf(segmentAt(segments, timeMs)),
  }
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
