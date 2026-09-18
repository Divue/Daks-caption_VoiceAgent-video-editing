/** Formats milliseconds as "mm:ss" (e.g. 72300 -> "01:12"). */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * A ruler label, as short as the tick spacing allows: "0:05", or "0:05.5" only when the ticks are
 * closer together than a second.
 *
 * The old form printed "00:00.500" on every tick — leading zeros and three decimal places on a
 * label that only has to say where you are. Two dozen of those across the width was the densest,
 * noisiest thing on the screen, labelling the least interesting axis (audit 16 §2.4).
 */
export function formatTimecode(ms: number, stepMs = 1000): string {
  const safe = Math.max(0, ms)
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const base = `${minutes}:${String(seconds).padStart(2, '0')}`
  if (stepMs >= 1000) return base
  // Sub-second ticks need one decimal to be distinguishable at all; never more than one.
  return `${base}.${Math.floor((safe % 1000) / 100)}`
}

/** Formats a byte count for upload UI (e.g. 3_900_000 -> "3.9 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
