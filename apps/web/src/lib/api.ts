// Typed fetch client for services/api. No HTTP library — every call is one fetch.
//
// Three error body shapes exist in the wild and all three are normalised into ApiError:
//   { error: "not_ready", ... }   application error (flat)     — the documented shape
//   { detail: [ {...} ] }         FastAPI 422 request validation
//   { detail: "Not Found" }       unknown route
// A thrown TypeError (server down, CORS, DNS) becomes code 'network'.
import type { Emotion, PresetId, Project, Style, Word } from '@captions/shared'

// The repo-root .env supplies this via vite.config.ts `envDir`. The fallback keeps a
// missed envDir degrading to "works on the dev machine" rather than fetching undefined/projects.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8010'

export const API_BASE = BASE

/** Presigned S3 POST policies are issued for 900 s; the browser must finish inside that. */
export const UPLOAD_MAX_BYTES = 209_715_200 // 200 MB, the policy's own cap

export interface ApiError {
  code: string
  status: number
  /** Human-readable where the server gave one; already flattened out of FastAPI's array. */
  detail?: string
  body: unknown
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value && 'status' in value
}

function normaliseError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>

    // Flat application error: { error: "not_ready", detail?: "..." }
    if (typeof record.error === 'string') {
      return {
        code: record.error,
        status,
        detail: typeof record.detail === 'string' ? record.detail : undefined,
        body,
      }
    }

    // FastAPI 422: { detail: [ { loc, msg, type } ] }
    if (Array.isArray(record.detail)) {
      const first = record.detail[0] as Record<string, unknown> | undefined
      const msg = first && typeof first.msg === 'string' ? first.msg : undefined
      const loc = first && Array.isArray(first.loc) ? first.loc.join('.') : undefined
      return {
        code: 'validation_error',
        status,
        detail: msg && loc ? `${loc}: ${msg}` : msg,
        body,
      }
    }

    // Unknown route: { detail: "Not Found" }
    if (typeof record.detail === 'string') {
      return { code: status === 404 ? 'not_found' : 'error', status, detail: record.detail, body }
    }
  }

  return { code: 'error', status, detail: typeof body === 'string' ? body : undefined, body }
}

/** Short, human sentence for any ApiError — what a banner or toast shows. */
export function describeError(error: ApiError): string {
  if (error.code === 'network') {
    return 'Could not reach the API. Is it running on ' + BASE + '?'
  }
  if (error.detail) return error.detail
  return `${error.code} (HTTP ${error.status})`
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

/** Performs the request and returns both the parsed body and the response, or throws ApiError. */
async function rawRequest(path: string, options: RequestOptions = {}): Promise<{ data: unknown; response: Response }> {
  const { method = 'GET', body, signal } = options

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // AbortError must stay an abort so callers can ignore it; everything else is a network fault.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    const error: ApiError = { code: 'network', status: 0, detail: String(cause), body: cause }
    throw error
  }

  let data: unknown = null
  const text = await response.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text // a non-JSON body (proxy error page, empty 204) stays as text
    }
  }

  if (!response.ok) throw normaliseError(response.status, data)
  return { data, response }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await rawRequest(path, options)
  return data as T
}

// ---------------------------------------------------------------------------
// Project lifecycle
// ---------------------------------------------------------------------------

export interface CreateProjectResponse {
  projectId: string
  upload: { url: string; fields: Record<string, string> }
  expiresInSec: number
}

export function createProject(
  input: { filename: string; contentType: string; presetId?: PresetId },
  signal?: AbortSignal,
): Promise<CreateProjectResponse> {
  return request<CreateProjectResponse>('/projects', { method: 'POST', body: input, signal })
}

/**
 * Multipart POST straight to S3. Uses XHR, not fetch, because fetch cannot report
 * upload progress — the percentage this reports is a real byte count, never a simulation.
 * `fields` must be appended BEFORE `file`; S3 rejects the policy otherwise.
 */
export function uploadToS3(
  upload: { url: string; fields: Record<string, string> },
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value)
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', upload.url)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      reject({
        code: 'upload_failed',
        status: xhr.status,
        // S3 answers with an XML <Error> document; show it rather than inventing a message.
        detail: xhr.responseText?.slice(0, 300) || 'S3 rejected the upload.',
        body: xhr.responseText,
      } satisfies ApiError)
    }
    xhr.onerror = () =>
      reject({ code: 'network', status: 0, detail: 'Upload connection failed.', body: null } satisfies ApiError)
    xhr.onabort = () =>
      reject({ code: 'aborted', status: 0, detail: 'Upload cancelled.', body: null } satisfies ApiError)

    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

export type StageName = 'audio' | 'transcribe' | 'sarvam' | 'align' | 'prosody' | 'tag' | 'build'
export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface Stage {
  state: StageState
  ms?: number
  /** Free text from the pipeline, e.g. "46/46 Sarvam words matched a Transcribe timing".
   *  `tag`'s value is a Python dict repr, not JSON — render verbatim, never parse. */
  detail?: string
  error?: string
}

export interface StatusResponse {
  projectId: string
  runId: string | null
  state: 'not_started' | 'running' | 'done' | 'failed'
  stages: Record<StageName, Stage>
  error: string | null
  detail?: string | null
  elapsedMs?: number
  status?: string
}

/** Render order; `transcribe` and `sarvam` genuinely run concurrently. */
export const STAGE_ORDER: StageName[] = ['audio', 'transcribe', 'sarvam', 'align', 'prosody', 'tag', 'build']

export const STAGE_LABELS: Record<StageName, string> = {
  audio: 'Extract audio',
  transcribe: 'Transcribe (AWS)',
  sarvam: 'Transliterate',
  align: 'Align timings',
  prosody: 'Analyse prosody',
  tag: 'Tag emphasis & tone',
  build: 'Build project',
}

export function startProcess(projectId: string, force = false, signal?: AbortSignal): Promise<unknown> {
  return request(`/projects/${projectId}/process${force ? '?force=true' : ''}`, { method: 'POST', signal })
}

export function getStatus(projectId: string, signal?: AbortSignal): Promise<StatusResponse> {
  return request<StatusResponse>(`/projects/${projectId}/status`, { signal })
}

/** `version` comes from the X-Project-Version header, which the API CORS-exposes. */
export interface LoadedProject {
  project: Project
  version: number
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<LoadedProject> {
  const { data, response } = await rawRequest(`/projects/${projectId}`, { signal })
  return { project: data as Project, version: readVersionHeader(response) }
}

function readVersionHeader(response: Response): number {
  const raw = response.headers.get('X-Project-Version')
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/** The fields PATCH /words/{id} accepts. `style` merges per key; null removes a key. */
export interface WordPatch {
  text?: string
  startMs?: number
  endMs?: number
  emphasis?: boolean
  emotion?: Emotion
  stretch?: number
  /** `true` pulls the word into its own caption block; `null` clears the flag. */
  single?: boolean | null
  emoji?: string | null
  style?: Partial<Record<keyof Style, unknown>> | null
}

/** Returns the ONE updated word, not the project. Merge it; do not replace. */
export function patchWord(
  projectId: string,
  wordId: string,
  patch: WordPatch,
  version: number | undefined,
  signal?: AbortSignal,
): Promise<{ word: Word; version: number }> {
  return request(`/projects/${projectId}/words/${wordId}`, {
    method: 'PATCH',
    body: version === undefined ? patch : { ...patch, version },
    signal,
  })
}

/** One word patch inside a bulk write. */
export interface BulkWordPatch extends WordPatch {
  wordId: string
}

/**
 * All-or-nothing multi-word write: every patch applies, the Project validates once, and the
 * version counter bumps ONCE. This is the endpoint that makes one agent turn one atomic write —
 * the per-word route would be N sequential round trips sharing one counter.
 */
export function patchWordsBulk(
  projectId: string,
  words: BulkWordPatch[],
  version: number | undefined,
  signal?: AbortSignal,
): Promise<{ words: Word[]; version: number }> {
  return request(`/projects/${projectId}/words`, {
    method: 'PATCH',
    body: version === undefined ? { words } : { words, version },
    signal,
  })
}

/** Returns the WHOLE project, with a freshly signed videoUrl. `settings` merges per key. */
export function patchProject(
  projectId: string,
  patch: { presetId?: PresetId; settings?: Partial<Project['settings']> },
  version: number | undefined,
  signal?: AbortSignal,
): Promise<{ project: Project; version: number }> {
  return request(`/projects/${projectId}`, {
    method: 'PATCH',
    body: version === undefined ? patch : { ...patch, version },
    signal,
  })
}

// ---------------------------------------------------------------------------
// Seams owned by other teams — these are expected to 501 today.
// ---------------------------------------------------------------------------

export interface NotImplementedBody {
  error: string
  owner?: string
  responseContract?: unknown
}

export function startRender(projectId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/projects/${projectId}/render`, { method: 'POST', signal })
}

export interface ProjectSummary {
  projectId: string
  filename: string
  presetId: PresetId
  status: string
  version: number
  hasManualEdits: boolean
  createdAt: string
  updatedAt: string
}

export function listProjects(signal?: AbortSignal): Promise<{ projects: ProjectSummary[] }> {
  return request('/projects', { signal })
}
