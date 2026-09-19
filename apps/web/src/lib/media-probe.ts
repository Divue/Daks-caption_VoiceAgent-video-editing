/**
 * The two facts about an uploaded file that a layer needs and nothing downstream can afford to
 * find out for itself: its shape (so it is never stretched) and, for a clip, its length (so a trim
 * can never run past its end). Measured once, in the browser, from the file the user picked.
 */
export interface MediaProbe {
  aspect: number
  sourceDurationMs?: number
}

export function probeMedia(file: File): Promise<MediaProbe> {
  const url = URL.createObjectURL(file)
  const done = <T,>(value: T) => {
    URL.revokeObjectURL(url)
    return value
  }

  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () =>
        resolve(done({ aspect: image.naturalWidth / Math.max(1, image.naturalHeight) }))
      image.onerror = () => reject(done(new Error(`Couldn't read "${file.name}" as an image.`)))
      image.src = url
    })
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !Number.isFinite(video.duration)) {
        reject(done(new Error(`"${file.name}" has no picture this browser can play.`)))
        return
      }
      resolve(
        done({
          aspect: video.videoWidth / video.videoHeight,
          sourceDurationMs: Math.round(video.duration * 1000),
        }),
      )
    }
    video.onerror = () => reject(done(new Error(`Couldn't read "${file.name}" as a video.`)))
    video.src = url
  })
}
