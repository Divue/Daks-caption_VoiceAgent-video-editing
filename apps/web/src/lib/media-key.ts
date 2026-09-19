/**
 * The file a media URL points at, WITHOUT the signature.
 *
 * A presigned URL is re-minted on every project fetch, so the same video arrives with a different
 * query string each time. Two URLs with the same key are the same file; handing the second to
 * `<video src>` makes the browser reload it for nothing, which is how playback used to jump back
 * to 0:00 and stop after any write that raced another one.
 *
 * Pure and dependency-free so it can be checked without a browser.
 */
export function mediaKey(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}
