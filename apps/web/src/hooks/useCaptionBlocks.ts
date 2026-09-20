import { useMemo } from 'react'
import { MIN_BLOCK_MS } from '@captions/shared'
import { buildCaptionTimeline } from '@/lib/caption-timeline'
import type { CaptionTimeline } from '@/lib/caption-timeline'
import { useProject } from '@/state/project-context'

export type CaptionBlocks = CaptionTimeline

/**
 * Words → caption blocks, emphasis and the preset each block is drawn with, memoised on the
 * project.
 *
 * The work itself is `buildCaptionTimeline` (lib/caption-timeline.ts), not a local copy: P2's
 * Remotion composition imports the identical function, and a copy that drifts is exactly the
 * failure that seam exists to prevent (plan §3.1). It is also where `presetSegments` is turned
 * into per-segment grouping and emphasis — read its header for why that is not a `deriveBlocks`
 * rule.
 *
 * `mergeShort` is a VIEW preference — local UI state, threaded in as an argument. It is
 * deliberately not in Project.settings, which would be a schema change, and not in
 * project-reducer, which would put a view toggle in the undo history.
 */
export function useCaptionBlocks(mergeShort: boolean): CaptionBlocks {
  const { project } = useProject()

  return useMemo(
    () => buildCaptionTimeline(project, { mergeShorterThanMs: mergeShort ? MIN_BLOCK_MS : 0 }),
    [project, mergeShort],
  )
}

/**
 * Re-exported from lib/caption-timeline.ts, which is where it moved to when the Remotion
 * composition and the check scripts needed it: both import it, and neither can pull in a module
 * that reaches React. Kept here because every existing caller imports it from this path.
 */
export { findBlockIndexAt } from '@/lib/caption-timeline'
