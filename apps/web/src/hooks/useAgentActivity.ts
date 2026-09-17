import { useCallback, useEffect, useRef, useState } from 'react'
import { useProject } from '@/state/project-context'
import { PRESETS } from '@captions/shared'

/**
 * Placeholder shape for local UI rendering only — not the real agent protocol.
 * Replace once P4 defines the actual agent event/response contract.
 */
export interface AgentLogEntry {
  id: string
  message: string
  timestamp: number
}

/**
 * idle/listening are driven by real local interaction (the mic toggle).
 * processing/success/error exist only so P4 has states to drive later —
 * nothing in this app currently transitions into them.
 */
export type MicStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error'

/**
 * Logs real, honest local activity — never a fabricated agent/AI action.
 * Entries are derived by observing actual state transitions that already
 * happen for real (project loaded, preset changed, video uploaded) plus
 * events callers report about their own real local interactions.
 */
export function useAgentActivity() {
  const { project } = useProject()
  const [entries, setEntries] = useState<AgentLogEntry[]>([])
  const previous = useRef<{ presetId: string; videoUrl: string } | null>(null)
  const hasLoadedInitial = useRef(false)

  const addEntry = useCallback((message: string) => {
    setEntries((current) => [...current, { id: crypto.randomUUID(), message, timestamp: Date.now() }])
  }, [])

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

  return { entries, addEntry }
}
