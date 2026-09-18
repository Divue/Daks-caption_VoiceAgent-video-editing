/** Bar heights (fraction of the loader) and their breathing offsets: a small speech shape. */
const BARS = [
  { height: 0.45, delay: '0ms' },
  { height: 0.8, delay: '-180ms' },
  { height: 1, delay: '-360ms' },
  { height: 0.7, delay: '-540ms' },
  { height: 0.4, delay: '-720ms' },
]

/**
 * Full-screen fallback while the landing page's code loads: five coral waveform bars
 * breathing like a level meter (design.md §7 waveform motif), with a mono label.
 * Announced to screen readers as a busy status. Bars are static under reduced motion.
 */
export function BrandLoader() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background">
      <div aria-hidden className="flex h-10 items-center gap-1.5">
        {BARS.map((bar, index) => (
          <span
            key={index}
            className="loader-bar w-1.5 rounded-full bg-signal"
            style={{ height: `${bar.height * 100}%`, animationDelay: bar.delay }}
          />
        ))}
      </div>
      <p className="fade-in font-mono text-[11px] tracking-[0.2em] text-faint uppercase">Loading</p>
    </div>
  )
}
