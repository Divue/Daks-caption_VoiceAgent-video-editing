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
export type VoiceStartResult = 'livekit' | 'browser' | 'denied' | 'unavailable' | 'cancelled'

/**
 * TRANSPORT state only: `idle` | `connecting` | `listening` | `denied` | `error`.
 *
 * `connecting` is its own state because starting takes seconds — mic permission, a token from
 * the API, a WebRTC connection — and a button that looks idle for that long gets clicked again.
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

/** Thrown inside a start that `stop()` has overtaken — never an error, never a fallback. */
class Cancelled extends Error {}

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

  /**
   * Which start() is allowed to finish. `stop()` bumps it, so a start still in flight — waiting
   * on mic permission, the token, or the WebRTC connect — discovers after its next await that it
   * has been overtaken and tears down what it built instead of carrying on.
   *
   * Without this, "Stop" during those seconds reset the UI to idle while start() kept going:
   * it either connected a LiveKit room with a live mic (verified: an orphaned room, user still
   * connected, on the server) or, when the stop landed mid-connect, treated the failed connect as
   * "LiveKit unavailable" and FELL BACK to browser speech recognition — a live mic behind a button
   * that said "Start voice input", where clicking it only started a second session.
   */
  const sessionRef = useRef(0)

  // Read through a function, not inline: TypeScript narrows `roomRef.current` to `null` after an
  // assignment and keeps that narrowing across awaits, which is wrong for a ref.
  const closeTransports = useCallback(() => {
    const room = roomRef.current
    roomRef.current = null
    room?.disconnect()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.abort()
  }, [])

  const stop = useCallback(() => {
    sessionRef.current += 1
    closeTransports()
    setInterim(null)
    setTransport(null)
    setStatus('idle')
  }, [closeTransports])

  useEffect(() => () => stop(), [stop])

  const startBrowser = useCallback((session: number) => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return false
    if (sessionRef.current !== session) throw new Cancelled()

    const recognition = new Recognition()
    // Hinglish creators speak Indian English; hi-IN mis-handles the Roman script the pipeline uses.
    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true

    // Every handler checks it is still THE recogniser. One that was replaced must not submit
    // speech, and its late `onend` must not reset the state of the session that replaced it.
    const current = () => recognitionRef.current === recognition

    recognition.onresult = (event) => {
      if (!current()) return
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
      if (!current()) return
      recognitionRef.current = null
      setStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied' : 'error')
    }
    recognition.onend = () => {
      if (!current()) return
      recognitionRef.current = null
      setInterim(null)
      setTransport(null)
      setStatus('idle')
    }

    recognitionRef.current = recognition
    recognition.start()
    setTransport('browser')
    setStatus('listening')
    return true
  }, [])

  const startLiveKit = useCallback(async (session: number) => {
    const identity = crypto.randomUUID()
    const { token, url } = await fetchLiveKitToken(`voice-command-${identity}`, identity)
    if (sessionRef.current !== session) throw new Cancelled()

    const room = new Room()
    // Registered BEFORE connecting so that a stop() during the connect can find and close it.
    roomRef.current = room
    const current = () => roomRef.current === room

    room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
      if (!current() || participantInfo.identity !== identity) return
      const attributes = reader.info.attributes as TranscriptionAttributes
      const text = (await reader.readAll()).trim()
      if (!text || !current()) return

      // An interim segment is still being recognised. It is shown so the user can see they are
      // being heard, and never submitted — acting on a half-heard command is worse than waiting.
      if (attributes['lk.transcription_final'] !== 'true') {
        setInterim(text)
        return
      }
      setInterim(null)
      onTranscriptRef.current(text)
    })

    // A room from an earlier session disconnects LATE — after its replacement is already up.
    // Without this check that late event reset the new session to idle and orphaned it.
    room.on(RoomEvent.Disconnected, () => {
      if (!current()) return
      roomRef.current = null
      setInterim(null)
      setTransport(null)
      setStatus('idle')
    })

    await room.connect(url, token)
    if (sessionRef.current !== session) {
      room.disconnect()
      throw new Cancelled()
    }
    await room.localParticipant.setMicrophoneEnabled(true)
    if (sessionRef.current !== session) {
      room.disconnect()
      throw new Cancelled()
    }
    setTransport('livekit')
    setStatus('listening')
  }, [])

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    // Starting twice is stopping the first: never two sessions at once.
    closeTransports()

    const session = ++sessionRef.current
    setInterim(null)
    setStatus('connecting')

    // Ask for the microphone up front so a refusal is one clear state, rather than surfacing
    // differently depending on which transport happened to be used.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (cause) {
      if (sessionRef.current !== session) return 'cancelled'
      const name = cause instanceof DOMException ? cause.name : ''
      const denied = name === 'NotAllowedError' || name === 'SecurityError'
      setStatus(denied ? 'denied' : 'error')
      return denied ? 'denied' : 'unavailable'
    }
    if (sessionRef.current !== session) return 'cancelled'

    try {
      await startLiveKit(session)
      return 'livekit'
    } catch (cause) {
      // Overtaken by stop(): the failure is OURS, not LiveKit's. Falling back here is exactly
      // what turned the mic back on behind a button that said it was off.
      if (cause instanceof Cancelled || sessionRef.current !== session) return 'cancelled'
      // Not configured, not deployed, or unreachable. Fall back rather than failing the feature —
      // and say so, so nobody believes LiveKit is working when it is not.
      console.info('Voice: LiveKit unavailable, falling back to browser speech recognition.', cause)
      closeTransports()
    }

    try {
      if (!startBrowser(session)) {
        setStatus('error')
        return 'unavailable'
      }
    } catch (cause) {
      if (cause instanceof Cancelled) return 'cancelled'
      throw cause
    }
    return 'browser'
  }, [startLiveKit, startBrowser, closeTransports])

  return { status, interim, transport, start, stop }
}
