import { useEffect, useRef, useState } from 'react'

/**
 * The landing page's own scrollbar. The native one is hidden on this page (LandingPage adds
 * `landing-native-scrollbar-hidden` to <html>), which also means no layout shift when the intro's
 * scroll lock lifts: an overlay takes no width, a native bar does. Wheel, touch and keyboard
 * scrolling are untouched; this only draws position and adds drag.
 *
 * Fine pointers only. Touch devices already get their own overlay bars.
 */
export function LandingScrollbar({ visible }: { visible: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [finePointer] = useState(() => window.matchMedia('(pointer: fine)').matches)

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb || !finePointer) return

    let frame = 0
    let idleTimer = 0
    const update = () => {
      frame = 0
      const root = document.documentElement
      const max = root.scrollHeight - window.innerHeight
      const trackH = track.clientHeight
      const thumbH = Math.max(36, (trackH * window.innerHeight) / root.scrollHeight)
      const top = max > 0 ? (window.scrollY / max) * (trackH - thumbH) : 0
      thumb.style.height = `${thumbH}px`
      thumb.style.transform = `translate3d(0, ${top}px, 0)`
      track.style.display = max > 0 ? '' : 'none'
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
      // Brighten while scrolling, settle back when idle.
      track.dataset.active = 'true'
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => delete track.dataset.active, 900)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // Sections below the hero change the page height as they load in.
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(update)
    })
    observer.observe(document.body)

    // Drag the thumb; click the track to jump.
    const dragFrom = (event: PointerEvent, startScroll: number) => {
      const root = document.documentElement
      const ratio = (root.scrollHeight - window.innerHeight) / (track.clientHeight - thumb.clientHeight)
      const startY = event.clientY
      const move = (e: PointerEvent) =>
        // 'instant', not the default 'auto': html has scroll-behavior:smooth for anchor links
        // (index.css), and letting a drag inherit it would animate toward a target that every
        // pointermove replaces, so the thumb would lag behind the cursor.
        window.scrollTo({ top: startScroll + (e.clientY - startY) * ratio, behavior: 'instant' })
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        delete track.dataset.dragging
      }
      track.dataset.dragging = 'true'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    const onThumbDown = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragFrom(event, window.scrollY)
    }
    const onTrackDown = (event: PointerEvent) => {
      const rect = track.getBoundingClientRect()
      const fraction = (event.clientY - rect.top - thumb.clientHeight / 2) / (rect.height - thumb.clientHeight)
      const root = document.documentElement
      const target = Math.min(1, Math.max(0, fraction)) * (root.scrollHeight - window.innerHeight)
      window.scrollTo({ top: target, behavior: 'instant' })
      dragFrom(event, target)
    }
    thumb.addEventListener('pointerdown', onThumbDown)
    track.addEventListener('pointerdown', onTrackDown)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(idleTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      observer.disconnect()
      thumb.removeEventListener('pointerdown', onThumbDown)
      track.removeEventListener('pointerdown', onTrackDown)
    }
  }, [finePointer])

  if (!finePointer) return null

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className={`group fixed bottom-2 right-1 top-2 z-[60] w-3 transition-opacity duration-1000 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div
        ref={thumbRef}
        className="absolute right-0.5 top-0 w-1 cursor-grab rounded-full bg-ink-primary/20 transition-[width,background-color] duration-300 ease-out-expo group-hover:w-1.5 group-hover:bg-signal/70 group-data-[active=true]:bg-ink-primary/45 group-data-[dragging=true]:w-1.5 group-data-[dragging=true]:cursor-grabbing group-data-[dragging=true]:bg-signal"
      />
    </div>
  )
}
