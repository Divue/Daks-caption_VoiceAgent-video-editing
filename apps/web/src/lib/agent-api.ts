// Typed client for the agent routes (services/api/app/agent/router.py).
//
// Deliberately built on api.ts's `request()` rather than a bare fetch: agent failures then
// normalise into the same ApiError shape and render through the same describeError() as every
// other API failure, instead of surfacing as a raw `Error` with an HTTP status in its message.
import type { Project } from '@captions/shared'
import { request } from '@/lib/api'
import type { AgentPatch } from '@/state/project-reducer'

/**
 * Mirrors contracts.py's AgentStatus. `unsupported` is the agent honestly saying it cannot do
 * something; `not_implemented` is a capability that exists in the catalogue but is not wired.
 * Neither is an error, and neither may be rendered as success.
 */
export type AgentStatus = 'ok' | 'unsupported' | 'error' | 'not_implemented'

/** Mirrors contracts.py's AgentLogEntry field-for-field; `timestamp` is epoch ms. */
export interface AgentLogEntry {
  id: string
  message: string
  timestamp: number
}

export interface AgentCommandResponse {
  status: AgentStatus
  patches: AgentPatch[]
  log: AgentLogEntry[]
}

/**
 * Everything the editor knows about what the user is pointing at. Without this, "make this
 * bigger" and "that line" have no referent and the model is guessing.
 *
 * Blocks are derived on the fly and their indices shift as you edit (audit 17 §2), so the EDITOR
 * resolves the active block to word ids here and the agent only ever works in word ids.
 */
export interface SelectionContext {
  selectedWordId?: string | null
  selectedWordIds?: string[] | null
  playheadMs?: number | null
  activeBlockId?: string | null
  activeBlockWordIds?: string[] | null
}

/** POST /agent/command — a typed command. */
export function submitTextCommand(
  command: string,
  project: Project,
  selection: SelectionContext,
  signal?: AbortSignal,
): Promise<AgentCommandResponse> {
  return request('/agent/command', {
    method: 'POST',
    body: { command, project, selection },
    signal,
  })
}

/**
 * POST /agent/voice-command — a transcript that was already recognised (by LiveKit's STT worker
 * or by the browser). The route takes text, never audio, and runs the identical planner as a
 * typed command, so voice can never drift into a second, weaker code path.
 */
export function submitVoiceTranscript(
  transcript: string,
  project: Project,
  selection: SelectionContext,
  signal?: AbortSignal,
): Promise<AgentCommandResponse> {
  return request('/agent/voice-command', {
    method: 'POST',
    body: { transcript, project, selection },
    signal,
  })
}

export interface LiveKitToken {
  token: string
  url: string
}

/** POST /agent/livekit-token — the room join token is minted server-side; the secret never ships. */
export function fetchLiveKitToken(
  room: string,
  identity: string,
  signal?: AbortSignal,
): Promise<LiveKitToken> {
  return request('/agent/livekit-token', {
    method: 'POST',
    body: { room, identity },
    signal,
  })
}
