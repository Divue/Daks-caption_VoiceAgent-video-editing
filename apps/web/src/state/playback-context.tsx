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
interface PlaybackContextValue {
  timeMs: number
  isPlaying: boolean
  durationMs: number
  volume: number
  muted: boolean
  rate: number
  /** Attach to the one <video>. Callback ref: listeners bind when the element mounts. */
  attachVideo: (el: HTMLVideoElement | null) => void
  seek: (ms: number) => void
  toggle: () => void
  play: () => void
  pause: () => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null)

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const [timeMs, setTimeMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRateState] = useState(1)

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
      if (video) setTimeMs(video.currentTime * 1000)
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
        return
      }

      const publishTime = () => setTimeMs(el.currentTime * 1000)
      const onPlay = () => {
        setIsPlaying(true)
        startLoop()
      }
      const onPause = () => {
        setIsPlaying(false)
        stopLoop()
        publishTime() // land the playhead exactly where playback stopped
      }
      // Scrubbing while paused runs no rAF loop, so seeking must publish time itself.
      const onSeek = publishTime
      const onLoaded = () => {
        if (Number.isFinite(el.duration)) setDurationMs(el.duration * 1000)
      }
      const onVolume = () => {
        setVolumeState(el.volume)
        setMuted(el.muted)
      }

      el.addEventListener('play', onPlay)
      el.addEventListener('pause', onPause)
      el.addEventListener('ended', onPause)
      el.addEventListener('seeking', onSeek)
      el.addEventListener('seeked', onSeek)
      el.addEventListener('loadedmetadata', onLoaded)
      el.addEventListener('durationchange', onLoaded)
      el.addEventListener('volumechange', onVolume)

      detachRef.current = () => {
        el.removeEventListener('play', onPlay)
        el.removeEventListener('pause', onPause)
        el.removeEventListener('ended', onPause)
        el.removeEventListener('seeking', onSeek)
        el.removeEventListener('seeked', onSeek)
        el.removeEventListener('loadedmetadata', onLoaded)
        el.removeEventListener('durationchange', onLoaded)
        el.removeEventListener('volumechange', onVolume)
      }

      // A remounted element may already be mid-load; sync now rather than wait for an event.
      onLoaded()
      onVolume()
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
    if (!video) return
    const durationLimit = Number.isFinite(video.duration) ? video.duration * 1000 : ms
    const clamped = Math.max(0, Math.min(ms, durationLimit))
    video.currentTime = clamped / 1000
    setTimeMs(clamped) // publish immediately; 'seeked' can lag a frame or two
  }, [])

  const play = useCallback(() => {
    // A rejected play() (autoplay policy, detached src) must not become an unhandled rejection.
    void videoRef.current?.play().catch(() => undefined)
  }, [])

  const pause = useCallback(() => videoRef.current?.pause(), [])

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }, [])

  const setRate = useCallback((next: number) => {
    const video = videoRef.current
    if (video) video.playbackRate = next
    setRateState(next)
  }, [])

  const setVolume = useCallback((next: number) => {
    const video = videoRef.current
    if (video) {
      video.volume = next
      if (next > 0) video.muted = false
    }
    setVolumeState(next)
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [])

  const value = useMemo<PlaybackContextValue>(
    () => ({
      timeMs,
      isPlaying,
      durationMs,
      volume,
      muted,
      rate,
      attachVideo,
      seek,
      toggle,
      play,
      pause,
      setRate,
      setVolume,
      toggleMute,
    }),
    [timeMs, isPlaying, durationMs, volume, muted, rate, attachVideo, seek, toggle, play, pause, setRate, setVolume, toggleMute],
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
