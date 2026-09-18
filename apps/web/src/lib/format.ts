/** Formats milliseconds as "mm:ss" (e.g. 72300 -> "01:12"). */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Formats milliseconds as "mm:ss.mmm" — the timeline ruler's format (e.g. 72300 -> "01:12.300"). */
export function formatTimecode(ms: number): string {
  const safe = Math.max(0, ms)
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const millis = Math.floor(safe % 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/** Formats a byte count for upload UI (e.g. 3_900_000 -> "3.9 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
