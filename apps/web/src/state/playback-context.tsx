import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * The playback clock. The <video> element IS the clock — nothing here simulates time.
 *
 * Two hard rules from plan §3.2:
 *  - `timeupdate` is NOT used. It fires ~4x/s, far too coarse to highlight a 200 ms word.
 *    A requestAnimationFrame loop reads video.currentTime instead, started on play and
 *    cancelled on pause/ended so an idle tab costs nothing.
 *  - timeMs NEVER enters project-reducer. Every reducer action re-validates the whole
 *    Project with Zod; at 60 fps that would be 60 full-project validations per second.
 *    Playback time is ephemeral UI state and stays here.
 */
/** Why `play()` did not start playback, in words a person can act on. */
export type PlayResult = { ok: true } | { ok: false; reason: string }

/** `null` for an AbortError: that is the user pausing again, not a failure worth showing. */
function describePlayFailure(cause: unknown): string | null {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'AbortError') return null
  if (name === 'NotAllowedError') return 'The browser blocked playback — click the video once, then try again'
  if (name === 'NotSupportedError') return "This video's format can't be played by your browser"
  return cause instanceof Error && cause.message ? cause.message : 'The video could not start'
}

/** While the microphone is open the video is turned down to this share of its volume. */
const DUCK_FACTOR = 0.25

interface PlaybackContextValue {
  timeMs: number
  isPlaying: boolean
  durationMs: number
  volume: number
  muted: boolean
  rate: number
  /** Waiting on data mid-playback. Without this a stalled stream looks exactly like a frozen app. */
  buffering: boolean
  /** The first frame is available. False while the file is still loading. */
  ready: boolean
  /** The reason the last `play()` failed, until playback next succeeds. */
  playError: string | null
  /** Attach to the one <video>. Callback ref: listeners bind when the element mounts. */
  attachVideo: (el: HTMLVideoElement | null) => void
  seek: (ms: number) => void
  toggle: () => void
  /** Resolves with the outcome, so a voice command can say "couldn't play" instead of nothing. */
  play: () => Promise<PlayResult>
  pause: () => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setMuted: (muted: boolean) => void
  /** Turn the video down (true) or back up (false), remembering the user's own volume. */
  duck: (on: boolean) => void
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null)

/**
 * `fallbackDurationMs` drives a clock when NO <video> element is attached — the project's own
 * `durationMs`, so the timeline and the caption preview work with the fixture or while a real
 * upload is still processing. It is never used once a video exists: the element's own metadata
 * always wins, because only the file knows its real length.
 */
export function PlaybackProvider({
  children,
  fallbackDurationMs = 0,
}: {
  children: ReactNode
  fallbackDurationMs?: number
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const [timeMs, setTimeMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(fallbackDurationMs)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRateState] = useState(1)
  const rateRef = useRef(1)
  const [buffering, setBuffering] = useState(false)
  const [ready, setReady] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  // The volume the USER chose, kept apart from what the element is set to while it is ducked.
  const userVolumeRef = useRef(1)
  const duckingRef = useRef(false)
  // The playhead, readable from a callback without making every callback depend on the render.
  const timeMsRef = useRef(0)
  const durationRef = useRef(0)
  // Where the detached clock started, as (wall clock, playhead). Only read when no video is
  // attached; a real element is always its own source of truth.
  const detachedOriginRef = useRef<{ at: number; fromMs: number } | null>(null)

  // A video's own metadata always wins; the fallback only fills in before (or without) one.
  useEffect(() => {
    if (!videoRef.current) setDurationMs(fallbackDurationMs)
  }, [fallbackDurationMs])

  // Mirror the state the detached clock reads into refs, so its rAF tick and the transport
  // callbacks can read a current value without every one of them depending on the render.
  // In an effect, not during render: a render-phase ref write is not safe under concurrent
  // rendering, and a one-commit lag is invisible to a clock that is sampled per frame.
  useEffect(() => {
    timeMsRef.current = timeMs
  }, [timeMs])
  useEffect(() => {
    durationRef.current = durationMs
  }, [durationMs])

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const startLoop = useCallback(() => {
    stopLoop()
    const tick = () => {
      const video = videoRef.current
      if (video) {
        setTimeMs(video.currentTime * 1000)
      } else {
        const origin = detachedOriginRef.current
        if (origin) {
          const elapsed = (performance.now() - origin.at) * rateRef.current
          const next = origin.fromMs + elapsed
          if (next >= durationRef.current) {
            setTimeMs(durationRef.current)
            setIsPlaying(false)
            stopLoop()
            return
          }
          setTimeMs(next)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [stopLoop])

  // Holds the teardown for whichever element is currently attached. Listener identities are
  // created per attach, so removal must close over them rather than re-derive them.
  const detachRef = useRef<(() => void) | null>(null)

  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (videoRef.current === el) return

      detachRef.current?.()
      detachRef.current = null
      videoRef.current = el
      stopLoop()

      if (!el) {
        setIsPlaying(false)
        setBuffering(false)
        setReady(false)
        return
      }

      const publishTime = () => setTimeMs(el.currentTime * 1000)
      const onPlay = () => {
        setIsPlaying(true)
        startLoop()
      }
      const onPause = () => {
        setIsPlaying(false)
        setBuffering(false)
        stopLoop()
        publishTime() // land the playhead exactly where playback stopped
      }
      // A playing clip that runs out of data fires `waiting`; nothing else tells the UI it is
      // not frozen. Cleared the moment frames flow again.
      const onWaiting = () => {
        if (!el.paused) setBuffering(true)
      }
      const onFlowing = () => {
        setBuffering(false)
        setPlayError(null)
      }
      const onData = () => {
        setReady(el.readyState >= 2)
        if (el.readyState >= 3) setBuffering(false)
      }
      const onEmptied = () => {
        setReady(false)
        setBuffering(false)
      }
      // Scrubbing while paused runs no rAF loop, so seeking must publish time itself.
      const onSeek = publishTime
      const onLoaded = () => {
        if (Number.isFinite(el.duration)) setDurationMs(el.duration * 1000)
      }
      const onVolume = () => {
        // While ducked the element is quieter than the user's setting; showing THAT would make the
        // slider jump every time the mic opens, and would overwrite the volume we must restore.
        if (duckingRef.current) return
        userVolumeRef.current = el.volume
        setVolumeState(el.volume)
        setMuted(el.muted)
      }

      const listeners: Array<[string, () => void]> = [
        ['play', onPlay],
        ['pause', onPause],
        ['ended', onPause],
        ['seeking', onSeek],
        ['seeked', () => { onSeek(); onData() }],
        ['loadedmetadata', onLoaded],
        ['durationchange', onLoaded],
        ['volumechange', onVolume],
        ['waiting', onWaiting],
        ['stalled', onWaiting],
        ['playing', onFlowing],
        ['canplay', onData],
        ['canplaythrough', onData],
        ['loadeddata', onData],
        ['emptied', onEmptied],
      ]
      for (const [name, handler] of listeners) el.addEventListener(name, handler)

      detachRef.current = () => {
        for (const [name, handler] of listeners) el.removeEventListener(name, handler)
      }

      // A remounted element may already be mid-load; sync now rather than wait for an event.
      onLoaded()
      onVolume()
      onData()
      publishTime()
      if (!el.paused) onPlay()
    },
    [startLoop, stopLoop],
  )

  useEffect(
    () => () => {
      detachRef.current?.()
      stopLoop()
    },
    [stopLoop],
  )

  const seek = useCallback((ms: number) => {
    const video = videoRef.current
    if (!video) {
      const clamped = Math.max(0, Math.min(ms, durationRef.current))
      detachedOriginRef.current = { at: performance.now(), fromMs: clamped }
      setTimeMs(clamped)
      return
    }
    const durationLimit = Number.isFinite(video.duration) ? video.duration * 1000 : ms
    const clamped = Math.max(0, Math.min(ms, durationLimit))
    video.currentTime = clamped / 1000
    setTimeMs(clamped) // publish immediately; 'seeked' can lag a frame or two
  }, [])

  const startDetached = useCallback(
    (fromMs: number) => {
      if (durationRef.current <= 0) return
      detachedOriginRef.current = {
        at: performance.now(),
        fromMs: fromMs >= durationRef.current ? 0 : fromMs,
      }
      setIsPlaying(true)
      startLoop()
    },
    [startLoop],
  )

  const stopDetached = useCallback(() => {
    setIsPlaying(false)
    stopLoop()
  }, [stopLoop])

  const play = useCallback(async (): Promise<PlayResult> => {
    const video = videoRef.current
    if (!video) {
      startDetached(timeMsRef.current)
      return { ok: true }
    }
    try {
      await video.play()
      setPlayError(null)
      return { ok: true }
    } catch (cause) {
      // Reported, not swallowed: a play() that fails must be visible, or "the video is stuck"
      // is the only symptom anyone gets. An AbortError is the user pausing again — not an error.
      const reason = describePlayFailure(cause)
      if (reason) setPlayError(reason)
      return { ok: false, reason: reason ?? 'interrupted' }
    }
  }, [startDetached])

  const pause = useCallback(() => {
    const video = videoRef.current
    if (!video) return stopDetached()
    video.pause()
  }, [stopDetached])

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      if (frameRef.current !== null) stopDetached()
      else startDetached(timeMsRef.current)
      return
    }
    if (video.paused) void play()
    else video.pause()
  }, [play, startDetached, stopDetached])

  const setRate = useCallback((next: number) => {
    const video = videoRef.current
    if (video) video.playbackRate = next
    else if (detachedOriginRef.current) {
      // Re-origin, or the elapsed time already accrued would be re-scaled by the new rate.
      detachedOriginRef.current = { at: performance.now(), fromMs: timeMsRef.current }
    }
    rateRef.current = next
    setRateState(next)
  }, [])

  const setVolume = useCallback((next: number) => {
    const video = videoRef.current
    userVolumeRef.current = next
    if (video) {
      // Still ducked: remember what the user chose, apply it when the duck ends.
      video.volume = duckingRef.current ? next * DUCK_FACTOR : next
      if (next > 0) video.muted = false
    }
    setVolumeState(next)
  }, [])

  const setMutedTo = useCallback((next: boolean) => {
    const video = videoRef.current
    if (!video) return
    video.muted = next
    setMuted(next)
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setMutedTo(!video.muted)
  }, [setMutedTo])

  /**
   * The microphone is open, and the clip's own narration comes out of the same speakers the mic is
   * listening to: the recogniser would hear the video and act on it. Turning the video down while
   * listening cuts what leaks back in without pausing it — the user may be about to say "pause".
   */
  const duck = useCallback((on: boolean) => {
    const video = videoRef.current
    if (on === duckingRef.current) return
    duckingRef.current = on
    if (!video) return
    if (on) userVolumeRef.current = video.volume
    video.volume = on ? userVolumeRef.current * DUCK_FACTOR : userVolumeRef.current
  }, [])

  const value = useMemo<PlaybackContextValue>(
    () => ({
      timeMs,
      isPlaying,
      durationMs,
      volume,
      muted,
      rate,
      buffering,
      ready,
      playError,
      attachVideo,
      seek,
      toggle,
      play,
      pause,
      setRate,
      setVolume,
      toggleMute,
      setMuted: setMutedTo,
      duck,
    }),
    [
      timeMs, isPlaying, durationMs, volume, muted, rate, buffering, ready, playError,
      attachVideo, seek, toggle, play, pause, setRate, setVolume, toggleMute, setMutedTo, duck,
    ],
  )

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext)
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider')
  }
  return context
}
