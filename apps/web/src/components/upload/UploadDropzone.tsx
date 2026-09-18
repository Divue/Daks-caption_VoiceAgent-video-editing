import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        'flex flex-col items-center justify-center gap-2 rounded-[20px] border-dashed border-hairline-strong bg-surface p-4 text-center shadow-none transition-colors duration-150',
        isDragging && 'border-signal bg-signal-dim/40',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onInputChange} />
      <UploadCloud className="size-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">Upload a video</p>
        <p className="font-mono text-[11px] text-faint">or drag and drop · MP4, WebM, MOV</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => inputRef.current?.click()}>
        Browse files
      </Button>
      {fileName && <p className="font-mono text-[11px] text-muted-foreground">Loaded: {fileName}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  )
}
