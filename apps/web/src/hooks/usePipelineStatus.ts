import { useEffect, useRef, useState } from 'react'
import { getStatus, isApiError } from '@/lib/api'
import type { StatusResponse } from '@/lib/api'

const POLL_MS = 2000
/** After this many consecutive network failures (~6 s) we call the API unreachable. */
const UNREACHABLE_AFTER = 3
/** Once unreachable we keep trying, slower, so the UI self-heals when the API comes back. */
const RETRY_MS = 5000

export interface PipelineStatus {
  status: StatusResponse | null
  /** True when WE cannot reach the API — distinct from the server reporting a failed job.
   *  A killed container took 116 s to report "worker lost"; conflating the two would
   *  either lie for two minutes or give up far too early (plan §4.1). */
  unreachable: boolean
}

/**
 * Polls GET /projects/{id}/status on a setTimeout chain — NOT setInterval, so a slow
 * response can never let requests pile up. 2 s between the END of one response and the
 * start of the next.
 */
export function usePipelineStatus(
  projectId: string | null,
  enabled: boolean,
  onSettled: (status: StatusResponse) => void,
  expectedRunId?: string | null,
): PipelineStatus {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  // Kept in refs so changing the callback identity never restarts the poll chain.
  // Assigned in an effect, not during render, so a discarded render cannot publish a stale value.
  const settledRef = useRef(onSettled)
  const runIdRef = useRef(expectedRunId)
  useEffect(() => {
    settledRef.current = onSettled
    runIdRef.current = expectedRunId
  })

  useEffect(() => {
    if (!projectId || !enabled) return

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let stopped = false

    async function poll() {
      if (stopped) return
      try {
        const next = await getStatus(projectId!, controller.signal)
        if (stopped) return
        failures = 0
        setUnreachable(false)

        // Guard a re-process racing an old poll: ignore a status for a different run.
        const expected = runIdRef.current
        if (expected && next.runId && next.runId !== expected) {
          timer = setTimeout(poll, POLL_MS)
          return
        }

        setStatus(next)

        if (next.state === 'done' || next.state === 'failed') {
          stopped = true
          settledRef.current(next)
          return
        }
      } catch (cause) {
        if (stopped) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        // A real HTTP answer means the API is up; only transport faults count as unreachable.
        if (isApiError(cause) && cause.status > 0) {
          failures = 0
        } else {
          failures += 1
          if (failures >= UNREACHABLE_AFTER) setUnreachable(true)
        }
      }
      timer = setTimeout(poll, unreachableDelay(failures))
    }

    void poll()

    return () => {
      stopped = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [projectId, enabled])

  return { status, unreachable }
}

function unreachableDelay(failures: number): number {
  return failures >= UNREACHABLE_AFTER ? RETRY_MS : POLL_MS
}
