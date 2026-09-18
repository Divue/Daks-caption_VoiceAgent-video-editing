import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

const POINT_COUNT = 1100
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Sphere radius as a fraction of the canvas edge; the rest is room for the ripple. */
const RADIUS = 0.4
const TILT = -0.35
const DOT_RGB = '232, 232, 237'
const REDRAW_EVENT = 'orb-redraw'
/** Dots are drawn in this many depth bands, one path + one fill() each (see draw()). */
const DEPTH_BANDS = 12

interface VoiceOrbProps {
  /** 0 = idle, 1 = speaking. Eased internally, so it can jump between values. */
  energy: number
  /** Effect colour the orb's rim picks up, or null for plain dots. */
  tint: string | null
  /** Fewer dots for small orbs; every n-th lattice point is drawn. 1 = all 1100. */
  density?: 1 | 2 | 3
  className?: string
}

/** Points evenly spread on a unit sphere (Fibonacci lattice), with their lat/lon for the ripple. */
function buildSphere(count: number) {
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const z = new Float32Array(count)
  const lat = new Float32Array(count)
  const lon = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const py = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - py * py)
    const theta = i * GOLDEN_ANGLE
    x[i] = Math.cos(theta) * ring
    y[i] = py
    z[i] = Math.sin(theta) * ring
    lat[i] = Math.asin(py)
    lon[i] = Math.atan2(z[i], x[i])
  }
  return { x, y, z, lat, lon }
}

const SPHERE = buildSphere(POINT_COUNT)

/**
 * The hero's voice orb: a rotating dot sphere drawn on a canvas. While "speaking" its
 * surface ripples like a voice; when an effect is applied its rim takes that effect's
 * colour. It is decorative (aria-hidden); the state it shows is also shown as text.
 *
 * The loop only runs while the orb is on screen and the tab is visible. Under
 * prefers-reduced-motion it draws a single still frame instead of animating.
 */
export function VoiceOrb({ energy, tint, density = 1, className }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const energyRef = useRef(energy)
  const tintRef = useRef(tint)
  const reducedMotion = usePrefersReducedMotion()

  // Props reach the running loop through refs, so changing them never restarts it.
  useEffect(() => {
    energyRef.current = energy
    tintRef.current = tint
    // A still (reduced-motion) frame is redrawn so it shows the new tint.
    canvasRef.current?.dispatchEvent(new Event(REDRAW_EVENT))
  }, [energy, tint])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let size = 0
    let frame = 0
    let visible = true
    let easedEnergy = energyRef.current
    const depth = new Float32Array(POINT_COUNT)
    const screenX = new Float32Array(POINT_COUNT)
    const screenY = new Float32Array(POINT_COUNT)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size = canvas.clientWidth * dpr
      canvas.width = size
      canvas.height = size
    }

    const draw = (time: number) => {
      easedEnergy += (energyRef.current - easedEnergy) * 0.06
      const rotation = time * 0.00016
      const cosY = Math.cos(rotation)
      const sinY = Math.sin(rotation)
      const cosX = Math.cos(TILT)
      const sinX = Math.sin(TILT)
      const center = size / 2
      const radius = size * RADIUS
      const breath = 1 + 0.012 * Math.sin(time * 0.0015)
      const dotScale = size / 420

      for (let i = 0; i < POINT_COUNT; i += density) {
        const ripple = Math.sin(SPHERE.lat[i] * 6 + time * 0.004) * Math.cos(SPHERE.lon[i] * 3 - time * 0.003)
        const k = breath + easedEnergy * 0.07 * ripple
        const x1 = SPHERE.x[i] * cosY + SPHERE.z[i] * sinY
        const z1 = -SPHERE.x[i] * sinY + SPHERE.z[i] * cosY
        const y2 = SPHERE.y[i] * cosX - z1 * sinX
        const z2 = SPHERE.y[i] * sinX + z1 * cosX
        screenX[i] = center + x1 * radius * k
        screenY[i] = center + y2 * radius * k
        depth[i] = z2
      }

      context.clearRect(0, 0, size, size)
      const rimTint = tintRef.current
      // Batched drawing: dots are grouped into depth bands and each band is one path with a
      // single fill(), back band first so nearer dots sit on top. ~13 fills per frame instead
      // of one per dot — the per-dot beginPath/fill was the page's main frame cost.
      for (let band = 0; band < DEPTH_BANDS; band += 1) {
        const near = (band + 0.5) / DEPTH_BANDS
        const radius = (0.6 + near * 1.65) * dotScale
        context.beginPath()
        for (let i = 0; i < POINT_COUNT; i += density) {
          const z = depth[i]
          if (rimTint !== null && Math.abs(z) < 0.28) continue // drawn in the rim pass below
          if (Math.min(DEPTH_BANDS - 1, Math.floor(((z + 1) / 2) * DEPTH_BANDS)) !== band) continue
          context.moveTo(screenX[i] + radius, screenY[i])
          context.arc(screenX[i], screenY[i], radius, 0, Math.PI * 2)
        }
        context.fillStyle = `rgba(${DOT_RGB}, ${0.1 + near * 0.9})`
        context.fill()
      }
      if (rimTint !== null) {
        context.beginPath()
        for (let i = 0; i < POINT_COUNT; i += density) {
          if (Math.abs(depth[i]) >= 0.28) continue
          const radius = (0.6 + ((depth[i] + 1) / 2) * 1.65) * dotScale
          context.moveTo(screenX[i] + radius, screenY[i])
          context.arc(screenX[i], screenY[i], radius, 0, Math.PI * 2)
        }
        context.globalAlpha = 0.6
        context.fillStyle = rimTint
        context.fill()
        context.globalAlpha = 1
      }
    }

    const loop = (time: number) => {
      draw(time)
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      if (reducedMotion) {
        easedEnergy = 0
        draw(0)
      } else if (visible && !document.hidden) {
        frame = requestAnimationFrame(loop)
      }
    }

    resize()
    start()

    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (reducedMotion) draw(0)
    })
    resizeObserver.observe(canvas)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else cancelAnimationFrame(frame)
    })
    intersectionObserver.observe(canvas)
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start())
    document.addEventListener('visibilitychange', onVisibility)
    const onRedraw = () => {
      if (reducedMotion) draw(0)
    }
    canvas.addEventListener(REDRAW_EVENT, onRedraw)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener(REDRAW_EVENT, onRedraw)
    }
  }, [reducedMotion, density])

  return <canvas ref={canvasRef} aria-hidden className={cn('aspect-square w-full', className)} />
}
