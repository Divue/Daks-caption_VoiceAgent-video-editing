import type { RenderStatus } from '@/lib/api'

/**
 * The export flow as a pure state machine, so its rules can be checked without a browser.
 *
 *   idle -> starting -> rendering -> done
 *                          \-> failed        (any phase can fail; `reset` returns to idle)
 *
 * The rules that are easy to get wrong, and why they are written down here:
 *  - Progress never goes BACKWARDS. The renderer reports it in bursts; a bar that slips back reads as a
 *    stalled or restarted export.
 *  - One failed poll is not a failed export. A dropped request while the renderer is busy is routine; only
 *    several in a row mean the API is really gone.
 *  - "Done" without a link is a failure, not a success with nothing to click.
 */

export const POLL_MS = 1500
export const MAX_POLL_FAILURES = 3
/** Presigned links last an hour; refresh well before that rather than hand out one about to die. */
export const LINK_STALE_MS = 45 * 60 * 1000

export const EXPORT_NOTE =
  'Exports your saved captions. Style tweaks made with the sliders and not yet saved are not included.'

export type ExportState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'rendering'; renderId: string; progress: number; queued: boolean; failedPolls: number }
  | { phase: 'done'; renderId: string; url: string; readyAt: number }
  | { phase: 'failed'; message: string }

export type ExportEvent =
  | { type: 'start' }
  | { type: 'started'; renderId: string }
  | { type: 'status'; status: RenderStatus; now: number }
  | { type: 'pollFailed'; message: string }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

export const INITIAL_EXPORT: ExportState = { phase: 'idle' }

export function exportReducer(state: ExportState, event: ExportEvent): ExportState {
  switch (event.type) {
    case 'start':
      // A second click while one is running must not start a second render.
      return state.phase === 'starting' || state.phase === 'rendering' ? state : { phase: 'starting' }

    case 'started':
      return state.phase === 'starting'
        ? { phase: 'rendering', renderId: event.renderId, progress: 0, queued: true, failedPolls: 0 }
        : state

    case 'status': {
      if (state.phase !== 'rendering') return state // a late answer to a render we have since left
      const { status } = event
      if (status.state === 'done') {
        return status.outputUrl
          ? { phase: 'done', renderId: state.renderId, url: status.outputUrl, readyAt: event.now }
          : { phase: 'failed', message: 'The export finished but there is no download link. Please try again.' }
      }
      if (status.state === 'failed') {
        return { phase: 'failed', message: status.error || 'The export failed. Please try again.' }
      }
      return {
        phase: 'rendering',
        renderId: state.renderId,
        progress: Math.max(state.progress, clamp01(status.progress)),
        queued: status.state === 'queued',
        failedPolls: 0,
      }
    }

    case 'pollFailed':
      if (state.phase !== 'rendering') return state
      return state.failedPolls + 1 >= MAX_POLL_FAILURES
        ? { phase: 'failed', message: event.message }
        : { ...state, failedPolls: state.failedPolls + 1 }

    case 'fail':
      return { phase: 'failed', message: event.message }

    case 'reset':
      return INITIAL_EXPORT
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

/** A whole-number percentage for display; never 100 until the export is actually done. */
export function exportPercent(progress: number): number {
  return Math.min(99, Math.round(clamp01(progress) * 100))
}

export function exportStatusText(state: ExportState): string {
  switch (state.phase) {
    case 'idle':
      return ''
    case 'starting':
      return 'Starting the export…'
    case 'rendering':
      return state.queued ? 'Waiting for the renderer…' : `Rendering… ${exportPercent(state.progress)}%`
    case 'done':
      return 'Your video is ready'
    case 'failed':
      return state.message
  }
}

export function isLinkStale(readyAt: number, now: number): boolean {
  return now - readyAt >= LINK_STALE_MS
}
