import { useCallback, useEffect, useReducer, useState } from 'react'
import type { MouseEvent } from 'react'
import { Check, Download, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describeError, getRender, isApiError, startRender } from '@/lib/api'
import {
  EXPORT_NOTE,
  INITIAL_EXPORT,
  POLL_MS,
  exportPercent,
  exportReducer,
  exportStatusText,
  isLinkStale,
} from '@/lib/export'

interface ExportButtonProps {
  projectId: string
}

const describe = (cause: unknown) => (isApiError(cause) ? describeError(cause) : String(cause))

/**
 * Export: render the saved project to an MP4 and offer it for download.
 *
 * The rules live in `lib/export.ts` (a pure state machine, checked headlessly); this only starts the
 * export, polls it, and draws the result. The render happens on the render server, so nothing here
 * blocks the editor: the panel can be closed and the button keeps showing progress.
 */
export function ExportButton({ projectId }: ExportButtonProps) {
  const [state, dispatch] = useReducer(exportReducer, INITIAL_EXPORT)
  const [open, setOpen] = useState(false)

  const start = useCallback(async () => {
    dispatch({ type: 'start' })
    setOpen(true)
    try {
      const started = await startRender(projectId)
      dispatch({ type: 'started', renderId: started.renderId })
    } catch (cause) {
      dispatch({ type: 'fail', message: describe(cause) })
    }
  }, [projectId])

  // Poll while rendering. A new timer per state change is deliberate: each answer schedules the next
  // request, so requests never pile up behind a slow one, and unmounting cancels the one in flight.
  useEffect(() => {
    if (state.phase !== 'rendering') return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getRender(projectId, state.renderId, controller.signal)
        .then((status) => dispatch({ type: 'status', status, now: Date.now() }))
        .catch((cause) => {
          if (controller.signal.aborted) return
          dispatch({ type: 'pollFailed', message: describe(cause) })
        })
    }, POLL_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [state, projectId])

  // A finished export should be seen: open the panel when it lands, whether or not it was closed.
  // Done while rendering (adjusting state from a change of props/state is React's own pattern for this)
  // rather than in an effect, which would paint one frame with the panel still shut.
  const [seenPhase, setSeenPhase] = useState(state.phase)
  if (seenPhase !== state.phase) {
    setSeenPhase(state.phase)
    if (state.phase === 'done' || state.phase === 'failed') setOpen(true)
  }

  const busy = state.phase === 'starting' || state.phase === 'rendering'
  const percent = state.phase === 'rendering' ? exportPercent(state.progress) : 0

  const label =
    state.phase === 'starting'
      ? 'Starting…'
      : state.phase === 'rendering'
        ? state.queued
          ? 'Exporting…'
          : `Exporting ${percent}%`
        : 'Export'

  function handleButton() {
    if (state.phase === 'idle') void start()
    else setOpen((value) => !value)
  }

  // A link that is about to expire is replaced before the click goes through, so "Download" never
  // hands out one that fails with an S3 error page.
  async function handleDownload(event: MouseEvent<HTMLAnchorElement>) {
    if (state.phase !== 'done' || !isLinkStale(state.readyAt, Date.now())) return
    event.preventDefault()
    try {
      const fresh = await getRender(projectId, state.renderId)
      if (fresh.outputUrl) window.location.assign(fresh.outputUrl)
    } catch {
      dispatch({ type: 'fail', message: 'Could not refresh the download link. Please export again.' })
    }
  }

  return (
    <div className="relative">
      <Button type="button" size="sm" className="gap-1.5" onClick={handleButton} aria-expanded={open} aria-haspopup="dialog">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {label}
      </Button>

      {open && state.phase !== 'idle' && (
        <div
          role="dialog"
          aria-label="Export video"
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <p className={state.phase === 'failed' ? 'font-medium text-destructive' : 'font-medium'}>
              {state.phase === 'done' && <Check className="mr-1 inline size-3.5 text-primary" aria-hidden />}
              {exportStatusText(state)}
            </p>
            <button
              type="button"
              aria-label="Close"
              className="-mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="size-3.5" />
            </button>
          </div>

          {(state.phase === 'starting' || state.phase === 'rendering') && (
            <div
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.phase === 'rendering' && !state.queued ? percent : undefined}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={
                  state.phase === 'rendering' && !state.queued
                    ? 'h-full rounded-full bg-primary transition-[width] duration-500'
                    : 'h-full w-1/3 animate-pulse rounded-full bg-primary/60'
                }
                style={state.phase === 'rendering' && !state.queued ? { width: `${percent}%` } : undefined}
              />
            </div>
          )}

          {state.phase === 'done' && (
            <div className="mt-3 flex items-center gap-2">
              <a
                href={state.url}
                onClick={handleDownload}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Download className="size-3.5" />
                Download MP4
              </a>
              <Button type="button" size="sm" variant="ghost" onClick={() => void start()}>
                Export again
              </Button>
            </div>
          )}

          {state.phase === 'failed' && (
            <div className="mt-3">
              <Button type="button" size="sm" variant="secondary" onClick={() => void start()}>
                Try again
              </Button>
            </div>
          )}

          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{EXPORT_NOTE}</p>
        </div>
      )}
    </div>
  )
}
