import { useCallback, useRef, useState } from 'react'
import { Upload, AlertCircle, ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoute } from '@/router'
import { readRecentProjects, rememberProject } from '@/lib/recents'
import type { RecentProject } from '@/lib/recents'
import {
  createProject,
  uploadToS3,
  startProcess,
  UPLOAD_MAX_BYTES,
  isApiError,
  describeError,
} from '@/lib/api'
import type { ApiError, StatusResponse } from '@/lib/api'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { useSync } from '@/state/sync-context'
import { formatBytes } from '@/lib/format'
import { ProcessingPanel } from './ProcessingPanel'

const ACCEPTED_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
]

export function EmptyEditor() {
  const { navigate } = useRoute()
  const {
    lifecycle,
    projectId,
    setProjectId,
    setLifecycle,
    setLocalPreviewUrl,
    setLastError,
  } = useSync()

  const [recents] = useState<RecentProject[]>(() => readRecentProjects())
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isProcessing = lifecycle.k === 'processing' || lifecycle.k === 'queued'

  const handleSettled = useCallback(
    (status: StatusResponse) => {
      if (status.state === 'failed') {
        const failedStage = Object.entries(status.stages).find(
          ([, s]) => s.state === 'failed',
        )
        setLifecycle({
          k: 'failed',
          stage: failedStage?.[0],
          message:
            failedStage?.[1]?.error ?? status.error ?? 'The pipeline failed.',
        })
        return
      }
      if (projectId) {
        rememberProject(projectId, fileRef.current?.name ?? 'Untitled')
        navigate('/editor', projectId)
      }
    },
    [projectId, navigate, setLifecycle],
  )

  const { status: pipelineStatus, unreachable } = usePipelineStatus(
    projectId,
    isProcessing,
    handleSettled,
  )

  const startUpload = useCallback(
    async (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(
          `Unsupported format: ${file.type || 'unknown'}. Use MP4, MOV, MKV, or WebM.`,
        )
        return
      }
      if (file.size > UPLOAD_MAX_BYTES) {
        setError(
          `File too large (${formatBytes(file.size)}). Maximum is ${formatBytes(UPLOAD_MAX_BYTES)}.`,
        )
        return
      }

      fileRef.current = file
      setLocalPreviewUrl(URL.createObjectURL(file))

      const controller = new AbortController()
      abortRef.current = controller

      try {
        setLifecycle({ k: 'creating' })
        const { projectId: newId, upload } = await createProject(
          // New uploads start on Dhamaka; the API's own default (rangmanch) stays for other callers.
          { filename: file.name, contentType: file.type, presetId: 'dhamaka' },
          controller.signal,
        )
        setProjectId(newId)

        setLifecycle({ k: 'uploading', pct: 0 })
        await uploadToS3(
          upload,
          file,
          (pct) => setLifecycle({ k: 'uploading', pct }),
          controller.signal,
        )

        setLifecycle({ k: 'queued' })
        await startProcess(newId, false, controller.signal)
        setLifecycle({ k: 'processing', status: null })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        const apiErr: ApiError = isApiError(cause)
          ? cause
          : { code: 'network', status: 0, detail: String(cause), body: cause }
        setError(describeError(apiErr))
        setLastError(apiErr)
        setLifecycle({ k: 'idle' })
      }
    },
    [setProjectId, setLifecycle, setLocalPreviewUrl, setLastError],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) startUpload(file)
    },
    [startUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) startUpload(file)
      e.target.value = ''
    },
    [startUpload],
  )

  const handleStartOver = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setProjectId(null)
    setLifecycle({ k: 'idle' })
    setLocalPreviewUrl(null)
    setError(null)
    fileRef.current = null
  }, [setProjectId, setLifecycle, setLocalPreviewUrl])

  // --- Processing ---
  if (lifecycle.k === 'processing' || lifecycle.k === 'queued') {
    return (
      <ProcessingPanel
        status={pipelineStatus}
        filename={fileRef.current?.name}
        unreachable={unreachable}
        onCancel={handleStartOver}
      />
    )
  }

  // --- Creating / Uploading ---
  if (lifecycle.k === 'creating') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Creating project…</p>
      </div>
    )
  }

  if (lifecycle.k === 'uploading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <div className="w-full max-w-xs">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="truncate text-muted-foreground">
              {fileRef.current?.name ?? 'Uploading…'}
            </span>
            <span className="ml-2 shrink-0 font-mono text-xs">
              {lifecycle.pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${lifecycle.pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {fileRef.current
              ? `${formatBytes(Math.round((fileRef.current.size * lifecycle.pct) / 100))} / ${formatBytes(fileRef.current.size)}`
              : 'Uploading to S3…'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleStartOver}>
          Cancel
        </Button>
      </div>
    )
  }

  // --- Failed ---
  if (lifecycle.k === 'failed') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <AlertCircle className="size-8 text-destructive" />
        <div>
          <h1 className="text-lg font-semibold">Pipeline failed</h1>
          {lifecycle.stage && (
            <p className="text-sm text-muted-foreground">
              Failed at: {lifecycle.stage}
            </p>
          )}
          <p className="mt-1 max-w-md text-sm text-destructive">
            {lifecycle.message}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleStartOver}>
            Start over
          </Button>
          {projectId && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setLifecycle({ k: 'queued' })
                startProcess(projectId, true)
                  .then(() => setLifecycle({ k: 'processing', status: null }))
                  .catch((cause) => {
                    const msg = isApiError(cause)
                      ? describeError(cause)
                      : String(cause)
                    setLifecycle({ k: 'failed', message: msg })
                  })
              }}
            >
              Retry pipeline
            </Button>
          )}
        </div>
      </div>
    )
  }

  // --- Idle: dropzone + recents ---
  //
  // This screen had no chrome at all: a dropzone floating in a black void, with no title and no
  // way back to anywhere. It is the first thing "Get started" lands on, so it gets a header —
  // the mark, a name, and a route home.
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4">
        <div className="flex items-center gap-2.5">
          <div className="sunset-stripe flex size-7 shrink-0 items-center justify-center rounded-md">
            <Sparkles className="size-3.5 text-[oklch(0.2_0.02_45)]" />
          </div>
          <span className="font-display text-lg leading-none">Expressive Captions</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="size-4" />
          Home
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-3xl leading-tight">Start a new project</h1>
          <p className="text-sm text-muted-foreground">
            Drop a reel in and we transcribe it, read its tone, and caption it.
          </p>
        </div>
      <div
        className={`group flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <Upload className="size-10 text-muted-foreground transition-colors group-hover:text-primary" />
        <div className="text-center">
          <p className="font-medium">Drop a video here</p>
          <p className="text-sm text-muted-foreground">
            or click to browse — MP4, MOV, MKV, WebM up to{' '}
            {formatBytes(UPLOAD_MAX_BYTES)}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {error && (
        <p className="max-w-md text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {recents.length > 0 && (
        <div className="w-full max-w-md text-left">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Recent projects
          </p>
          <ul className="flex flex-col gap-1">
            {recents.map((recent) => (
              <li key={recent.projectId}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-normal"
                  onClick={() => navigate('/editor', recent.projectId)}
                >
                  <span className="truncate">{recent.filename}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                    {recent.projectId}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  )
}
