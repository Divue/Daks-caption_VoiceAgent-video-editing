import { useCallback, useEffect, useRef, useState } from 'react'
import { useProject } from '@/state/project-context'
import { PRESETS } from '@captions/shared'

/**
 * How an entry reads. `pending` is a turn still running; the agent loops up to 6 tool
 * iterations, so a turn is visible for seconds and must not look finished while it is not.
 * `warn` is an honest "I cannot do that" (the agent's `unsupported`/`not_implemented`), which
 * is NOT a success and must never render with a green check.
 *
 * `question` is the agent asking something back rather than guessing. Like `warn` it is
 * neither success nor failure — but unlike `warn` it is WAITING on the user, so it must read
 * as an open loop, not as a finished turn.
 */
export type AgentEntryStatus = 'info' | 'pending' | 'question' | 'ok' | 'warn' | 'error'

export interface AgentLogEntry {
  id: string
  message: string
  timestamp: number
  status: AgentEntryStatus
  /**
   * What the user actually said, kept for the life of the turn.
   *
   * `message` becomes the RESULT once the turn finishes ("4 words changed"), so without this
   * the history could show the utterance only while the turn was still running — the moment
   * it succeeded, the thing the user said disappeared and the log stopped being a conversation.
   */
  command?: string
  /** A short mechanical count ("51 words changed") shown beside the agent's own reply. */
  summary?: string
  /** One line per change, already phrased for a human by lib/agent-summary.ts. */
  lines?: string[]
  /** The tool calls the turn made — just the steps, not the agent's reply or the echo. */
  trace?: string[]
  /**
   * How many UNDO dispatches take this turn back, so "Undo that" is exact. A turn that ended in
   * a conflict refetch costs two (the optimistic commit plus the REPLACE_PRESENT that followed).
   * Absent means the turn changed nothing and there is nothing to undo.
   */
  undoSteps?: number
}

/**
 * idle/listening are driven by real local interaction (the mic toggle). `processing` means a
 * transcript is in flight to the agent; `denied` means the browser refused the microphone.
 */
export type MicStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error' | 'denied'

/**
 * The editor's activity log. Every entry describes something that really happened — a state
 * transition this app observed, or a turn the agent really ran. Nothing here fabricates agent
 * behaviour: a turn that failed says so, and a capability that does not exist renders as a
 * refusal rather than a tick.
 */
export function useAgentActivity() {
  const { project } = useProject()
  const [entries, setEntries] = useState<AgentLogEntry[]>([])
  const previous = useRef<{ presetId: string; videoUrl: string } | null>(null)
  const hasLoadedInitial = useRef(false)

  const addEntry = useCallback((message: string, status: AgentEntryStatus = 'info') => {
    const id = crypto.randomUUID()
    setEntries((current) => [...current, { id, message, timestamp: Date.now(), status }])
    return id
  }, [])

  /** Replaces one entry in place — how a `pending` turn becomes its result. */
  const updateEntry = useCallback((id: string, patch: Partial<Omit<AgentLogEntry, 'id'>>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }, [])

  /**
   * Appends entries the backend produced, preserving their own id and timestamp — the agent's
   * log is the real record of what it did, so it is not regenerated here.
   */
  const addBackendEntries = useCallback(
    (backendEntries: { id: string; message: string; timestamp: number }[]) => {
      if (backendEntries.length === 0) return
      setEntries((current) => [
        ...current,
        ...backendEntries.map((entry) => ({ ...entry, status: 'info' as const })),
      ])
    },
    [],
  )

  useEffect(() => {
    if (!hasLoadedInitial.current) {
      hasLoadedInitial.current = true
      previous.current = { presetId: project.presetId, videoUrl: project.videoUrl }
      addEntry('Transcript loaded')
      return
    }

    const prev = previous.current
    if (prev && prev.presetId !== project.presetId) {
      addEntry(`Preset changed to ${PRESETS[project.presetId]?.name ?? project.presetId}`)
    }
    if (prev && prev.videoUrl !== project.videoUrl) {
      addEntry('Video uploaded')
    }
    previous.current = { presetId: project.presetId, videoUrl: project.videoUrl }
  }, [project.presetId, project.videoUrl, addEntry])

  return { entries, addEntry, updateEntry, addBackendEntries }
}
