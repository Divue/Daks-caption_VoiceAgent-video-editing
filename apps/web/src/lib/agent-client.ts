import type { ProjectAction } from '@/state/project-reducer'
import type { AgentLogEntry } from '@/hooks/useAgentActivity'
import type { Project } from '@captions/shared'

/**
 * Client for the AI agent's HTTP contract (services/api/app/agent/router.py
 * / contracts.py), unmodified by this file. `AgentPatch` below mirrors that
 * module's UpdateWordAction/SetPresetAction/AddOverlayAction field-for-field
 * — by design, per the agent's own contracts.py docstring, these already
 * match apps/web's ProjectAction variants, so a patch can be dispatched
 * directly with no remapping.
 */
export type AgentPatch = Extract<ProjectAction, { type: 'UPDATE_WORD' | 'SET_PRESET' | 'ADD_OVERLAY' }>

export type AgentStatus = 'ok' | 'unsupported' | 'error' | 'not_implemented'

export interface AgentCommandResponse {
  status: AgentStatus
  patches: AgentPatch[]
  log: AgentLogEntry[]
}

interface SelectionContext {
  selectedWordId?: string | null
  playheadMs?: number | null
}

const API_URL = import.meta.env.VITE_API_URL

async function postAgentRequest(path: string, body: unknown): Promise<AgentCommandResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`)
  }
  return (await response.json()) as AgentCommandResponse
}

/** POST /agent/command — a typed text command. */
export function submitTextCommand(command: string, project: Project, selection?: SelectionContext) {
  return postAgentRequest('/agent/command', { command, project, selection })
}

/** POST /agent/voice-command — a transcript already produced by the LiveKit
 * voice-transport hook (see useLiveKitVoice.ts). Runs through the exact
 * same planner as a typed command, per voice.py's own design. */
export function submitVoiceTranscript(transcript: string, project: Project, selection?: SelectionContext) {
  return postAgentRequest('/agent/voice-command', { transcript, project, selection })
}
