import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent } from 'livekit-client'
import { fetchLiveKitToken } from '@/lib/agent-api'
import type { MicStatus } from '@/hooks/useAgentActivity'

/**
 * Voice TRANSPORT only: microphone capture and speech-to-text. This hook never calls the agent —
 * it only ever resolves to a transcript string. Submitting that transcript to
 * POST /agent/voice-command (the same planner a typed command uses) is the caller's job, kept
 * separate so "get a transcript" and "run a command" cannot get tangled together.
 *
 * Two transports, in order:
 *
 * 1. **LiveKit** — a room whose STT worker (services/voice-agent) publishes transcriptions back on
 *    the `lk.transcription` text stream. Gives real interim segments and barge-in. The join token
 *    is minted server-side; LIVEKIT_API_SECRET never reaches the browser.
 * 2. **The browser's own SpeechRecognition** — used when LiveKit is not configured or not
 *    reachable. `/agent/voice-command` takes a transcript, not audio, so this reaches the
 *    identical planner and is a genuine fallback rather than a degraded imitation.
 *
 * Which one is running is reported in `transport`, and the caller logs it. The editor never
 * claims to be listening when it is not.
 */

/** What `start()` actually managed to do — returned rather than read back off `status`,
 *  which a caller's closure would see one render stale. */
export type VoiceStartResult = 'livekit' | 'browser' | 'denied' | 'unavailable'

/**
 * TRANSPORT state only: `idle` | `listening` | `denied` | `error`.
 *
 * It deliberately never reports `processing`. Handing a transcript to the agent does not
 * stop the microphone — we are still listening, which is what makes barge-in possible — so
 * "the agent is working" is the AGENT's state and belongs to the caller. Conflating them is
 * what left the mic stuck in `processing` after a single command, with nothing anywhere able
 * to clear it.
 */
interface UseVoiceInputResult {
  status: MicStatus
  /** Speech recognised so far but not yet final. Shown to the user, never submitted. */
  interim: string | null
  transport: 'livekit' | 'browser' | null
  start: () => Promise<VoiceStartResult>
  stop: () => void
}

interface TranscriptionAttributes {
  'lk.transcription_final'?: string
}

// Minimal structural types for the Web Speech API, which TS's DOM lib still does not ship.
interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  readonly length: number
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { readonly length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInputResult {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [interim, setInterim] = useState<string | null>(null)
  const [transport, setTransport] = useState<'livekit' | 'browser' | null>(null)

  const roomRef = useRef<Room | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // Held in a ref so the long-lived LiveKit/SpeechRecognition callbacks always call the newest
  // handler instead of the one captured when listening started.
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const stop = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setInterim(null)
    setTransport(null)
    setStatus('idle')
  }, [])

  useEffect(() => () => stop(), [stop])

  const startBrowser = useCallback(() => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setStatus('error')
      return false
    }

    const recognition = new Recognition()
    // Hinglish creators speak Indian English; hi-IN mis-handles the Roman script the pipeline uses.
    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const trimmed = text.trim()
          if (trimmed) {
            setInterim(null)
            onTranscriptRef.current(trimmed)
          }
        } else {
          pending += text
        }
      }
      if (pending.trim()) setInterim(pending.trim())
    }
    recognition.onerror = (event) => {
      setStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied' : 'error')
      recognitionRef.current = null
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setInterim(null)
      setStatus((current) => (current === 'listening' ? 'idle' : current))
    }

    recognitionRef.current = recognition
    setTransport('browser')
    recognition.start()
    return true
  }, [])

  const startLiveKit = useCallback(async () => {
    const identity = crypto.randomUUID()
    const { token, url } = await fetchLiveKitToken(`voice-command-${identity}`, identity)

    const room = new Room()
    roomRef.current = room

    room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
      if (participantInfo.identity !== identity) return
      const attributes = reader.info.attributes as TranscriptionAttributes
      const text = (await reader.readAll()).trim()
      if (!text) return

      // An interim segment is still being recognised. It is shown so the user can see they are
      // being heard, and never submitted — acting on a half-heard command is worse than waiting.
      if (attributes['lk.transcription_final'] !== 'true') {
        setInterim(text)
        return
      }
      setInterim(null)
      onTranscriptRef.current(text)
    })

    room.on(RoomEvent.Disconnected, () => {
      roomRef.current = null
      setInterim(null)
      setStatus('idle')
    })

    await room.connect(url, token)
    await room.localParticipant.setMicrophoneEnabled(true)
    setTransport('livekit')
  }, [])

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    setInterim(null)
    setStatus('listening')

    // Ask for the microphone up front so a refusal is one clear state, rather than surfacing
    // differently depending on which transport happened to be used.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : ''
      const denied = name === 'NotAllowedError' || name === 'SecurityError'
      setStatus(denied ? 'denied' : 'error')
      return denied ? 'denied' : 'unavailable'
    }

    try {
      await startLiveKit()
      return 'livekit'
    } catch (cause) {
      // Not configured, not deployed, or unreachable. Fall back rather than failing the feature —
      // and say so, so nobody believes LiveKit is working when it is not.
      console.info('Voice: LiveKit unavailable, falling back to browser speech recognition.', cause)
      roomRef.current?.disconnect()
      roomRef.current = null
    }

    if (!startBrowser()) {
      setStatus('error')
      return 'unavailable'
    }
    return 'browser'
  }, [startLiveKit, startBrowser])

  return { status, interim, transport, start, stop }
}
