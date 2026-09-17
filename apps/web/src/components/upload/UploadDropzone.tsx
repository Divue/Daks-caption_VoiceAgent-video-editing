import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project-context'
import type { Project } from '@captions/shared'

interface VideoMetadata {
  width: number
  height: number
  durationMs: number
}

/** Loads a video off-DOM just long enough to read its real dimensions/duration. */
function readVideoMetadata(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: Math.round(video.duration * 1000),
      })
    }
    video.onerror = () => reject(new Error('Could not read video metadata'))
    video.src = url
    setTimeout(() => reject(new Error('Timed out reading video metadata')), 8000)
  })
}

export function UploadDropzone() {
  const { project, dispatch } = useProject()
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('video/')) {
      setError(`"${file.name}" is not a video file.`)
      return
    }

    const objectUrl = URL.createObjectURL(file)

    let metadata: VideoMetadata
    try {
      metadata = await readVideoMetadata(objectUrl)
    } catch {
      URL.revokeObjectURL(objectUrl)
      setError(`Could not read "${file.name}" as a video.`)
      return
    }

    if (project.videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(project.videoUrl)
    }

    const nextProject: Project = {
      ...project,
      id: crypto.randomUUID(),
      videoUrl: objectUrl,
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      words: [],
      overlays: [],
    }

    dispatch({ type: 'SET_PROJECT', project: nextProject })
    setFileName(file.name)
    setError(null)
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <Card
      className={cn(
        'flex flex-col items-center justify-center gap-1 border-dashed p-3 text-center transition-colors',
        isDragging && 'border-ring bg-muted/50',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onInputChange} />
      <p className="text-sm">
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => inputRef.current?.click()}
        >
          Upload a video
        </button>
        <span className="text-muted-foreground"> or drag and drop it here</span>
      </p>
      {fileName && <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  )
}
