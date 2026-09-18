import { useCallback, useRef, useState } from 'react'
import { Room, RoomEvent } from 'livekit-client'
import type { MicStatus } from './useAgentActivity'

/**
 * LiveKit voice TRANSPORT only: microphone capture + WebRTC + speech-to-text.
 * This hook never calls the AI agent itself — it only ever resolves to a
 * transcript string. Submitting that transcript to POST /agent/voice-command
 * (the same, already-tested code path a typed command uses) is the caller's
 * job (see apps/web/src/App.tsx), kept deliberately separate so "get a
 * transcript" and "run a command" don't get tangled into one hook.
 *
 * The room-join token is minted server-side (POST /agent/livekit-token) —
 * LIVEKIT_API_SECRET must never reach the browser, so this hook never
 * constructs its own token.
 *
 * Transcription arrives via LiveKit's own built-in forwarding mechanism (the
 * `lk.transcription` text-stream topic that an Agents worker's STT node
 * publishes by default — see services/voice-agent/worker.py), not a custom
 * data channel this hook invents.
 */

interface UseLiveKitVoiceResult {
  status: MicStatus
  start: () => Promise<void>
  stop: () => void
}

interface TranscriptionAttributes {
  'lk.transcription_final'?: string
  'lk.transcribed_track_id'?: string
}

export function useLiveKitVoice(onTranscript: (text: string) => void): UseLiveKitVoiceResult {
  const [status, setStatus] = useState<MicStatus>('idle')
  const roomRef = useRef<Room | null>(null)

  const start = useCallback(async () => {
    setStatus('listening')
    try {
      const apiUrl = import.meta.env.VITE_API_URL
      const identity = crypto.randomUUID()
      const roomName = `voice-command-${identity}`

      const tokenResponse = await fetch(`${apiUrl}/agent/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomName, identity }),
      })
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get a LiveKit token (${tokenResponse.status})`)
      }
      const { token, url } = (await tokenResponse.json()) as { token: string; url: string }

      const room = new Room()
      roomRef.current = room

      room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
        const attributes = reader.info.attributes as TranscriptionAttributes
        // Only finalized segments become a submittable command — an interim
        // (still-being-recognized) segment is not something the agent
        // should act on yet.
        if (attributes['lk.transcription_final'] !== 'true') return
        if (participantInfo.identity !== identity) return

        const text = await reader.readAll()
        if (text.trim()) {
          setStatus('processing')
          onTranscript(text.trim())
        }
      })

      room.on(RoomEvent.Disconnected, () => {
        setStatus('idle')
        roomRef.current = null
      })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)
    } catch (error) {
      console.error('useLiveKitVoice: failed to start voice input', error)
      setStatus('error')
      roomRef.current?.disconnect()
      roomRef.current = null
    }
  }, [onTranscript])

  const stop = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setStatus('idle')
  }, [])

  return { status, start, stop }
}
