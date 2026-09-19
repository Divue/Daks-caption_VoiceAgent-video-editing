// The local render server: turns a saved Project into an MP4 with the editor's captions burned in.
//
//   POST   /renders            { project, videoUrl, fps, projectId? }  -> 202 { renderId, state }
//   GET    /renders/:id        -> { renderId, state, progress, error, ... }
//   GET    /renders/:id/file   -> the MP4 (once state is "done")
//   DELETE /renders/:id        -> cancels a running render / removes a finished one
//   GET    /health             -> { ok, ready }
//
// One render at a time: a Chromium render needs 1-2 GB, and two at once would get the process killed on
// a small machine. Requests queue. Render state lives here (memory + files in out/renders); the API is
// stateless and proxies, so a restart of this server loses in-flight renders and the client sees "failed".
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ensureBrowser, makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer'
import { ROOT, bundleComposition } from './bundle.mjs'

const PORT = Number(process.env.RENDER_PORT || 3100)
// Loopback by default: this endpoint fetches whatever URL it is given and burns CPU, and has no auth.
const HOST = process.env.RENDER_HOST || '127.0.0.1'
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 2)
const MAX_RENDER_MS = Number(process.env.RENDER_TIMEOUT_MS || 15 * 60 * 1000)
// Optional: render with an installed Chrome instead of downloading Remotion's headless shell.
const BROWSER = process.env.REMOTION_BROWSER_EXECUTABLE || undefined
const KEEP_FILES = 10
const MAX_BODY_BYTES = 4 * 1024 * 1024
const OUT_DIR = path.join(ROOT, 'out', 'renders')
fs.mkdirSync(OUT_DIR, { recursive: true })

/** @type {Map<string, any>} */
const renders = new Map()
const queue = []
let running = false
let serveUrl = null
let bundleError = null
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

/** Presigned URLs carry a signature in the query string; never let one reach a log or an error message. */
const redact = (text) => String(text).replace(/(X-Amz-(Signature|Credential|Security-Token)=)[^&\s"']+/gi, '$1<redacted>')

function send(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) })
  res.end(data)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('body is not valid JSON'), { status: 400 })
  }
}

function validate(body) {
  const { project, videoUrl, fps } = body ?? {}
  if (!project || typeof project !== 'object' || !Array.isArray(project.words)) return 'project must be a Project object with words'
  if (![project.width, project.height, project.durationMs].every((n) => Number.isFinite(n) && n > 0)) return 'project needs positive width, height and durationMs'
  let url
  try {
    url = new URL(videoUrl)
  } catch {
    return 'videoUrl must be a URL'
  }
  if (!/^https?:$/.test(url.protocol)) return 'videoUrl must be http(s)'
  if (fps !== undefined && !(Number.isFinite(fps) && fps >= 1 && fps <= 120)) return 'fps must be between 1 and 120'
  return null
}

function view(r) {
  return {
    renderId: r.id,
    projectId: r.projectId ?? null,
    state: r.state,
    progress: r.progress,
    error: r.error ?? null,
    createdAt: r.createdAt,
    seconds: r.finishedAt ? +((r.finishedAt - (r.startedAt ?? r.createdAt)) / 1000).toFixed(1) : null,
    bytes: r.bytes ?? null,
  }
}

function pruneOldFiles() {
  const done = [...renders.values()].filter((r) => r.file && r.state !== 'rendering').sort((a, b) => b.createdAt - a.createdAt)
  for (const old of done.slice(KEEP_FILES)) {
    fs.rm(old.file, { force: true }, () => {})
    old.file = null
    renders.delete(old.id)
  }
}

async function runOne(r) {
  r.state = 'rendering'
  r.startedAt = Date.now()
  log(`render ${r.id} started (${r.project.width}x${r.project.height}, ${r.project.durationMs}ms @ ${r.fps}fps)`)
  const { cancel, cancelSignal } = makeCancelSignal()
  r.cancel = cancel
  const timer = setTimeout(() => {
    r.timedOut = true
    cancel()
  }, MAX_RENDER_MS)
  try {
    const inputProps = { project: r.project, videoUrl: r.videoUrl, fps: r.fps }
    const composition = await selectComposition({ serveUrl, id: 'CaptionVideo', inputProps, browserExecutable: BROWSER })
    const output = path.join(OUT_DIR, `${r.id}.mp4`)
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 18,
      // Say what the file IS. Left to defaults the output was tagged full-range "yuvj420p" with the old
      // SD colour matrix, which some players render with shifted colours; HD video is limited-range BT.709.
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      // Frames pass through JPEG on their way to the encoder; the default quality (80) softens caption edges.
      jpegQuality: 95,
      outputLocation: output,
      inputProps,
      concurrency: CONCURRENCY,
      cancelSignal,
      browserExecutable: BROWSER,
      onProgress: ({ progress }) => {
        r.progress = +Math.min(0.99, progress).toFixed(3)
      },
    })
    r.file = output
    r.bytes = fs.statSync(output).size
    r.progress = 1
    r.state = 'done'
    log(`render ${r.id} done: ${(r.bytes / 1e6).toFixed(1)} MB in ${((Date.now() - r.startedAt) / 1000).toFixed(1)}s`)
  } catch (error) {
    r.state = 'failed'
    r.error = r.cancelled
      ? 'Render was cancelled'
      : r.timedOut
        ? `Render took longer than ${Math.round(MAX_RENDER_MS / 60000)} minutes and was stopped`
        : redact(error?.message ?? error).split('\n')[0].slice(0, 400)
    log(`render ${r.id} FAILED: ${r.error}`)
  } finally {
    clearTimeout(timer)
    r.finishedAt = Date.now()
    r.cancel = null
    pruneOldFiles()
  }
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      // Still bundling on a first run: leave everything queued. Start-up calls pump() again the moment
      // the bundle is ready, so a request made in the first seconds waits instead of failing.
      if (!serveUrl && !bundleError) break
      const next = queue.shift()
      if (next.state !== 'queued') continue
      if (!serveUrl) {
        next.state = 'failed'
        next.error = `The render server could not start: ${bundleError}`
        next.finishedAt = Date.now()
        continue
      }
      await runOne(next)
    }
  } finally {
    running = false
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    const parts = url.pathname.split('/').filter(Boolean)

    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, ready: !!serveUrl, error: bundleError, queued: queue.length, rendering: running })

    if (req.method === 'POST' && url.pathname === '/renders') {
      const body = await readJson(req)
      const problem = validate(body)
      if (problem) return send(res, 400, { error: 'invalid_request', detail: problem })
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const r = { id, projectId: typeof body.projectId === 'string' ? body.projectId : null, state: 'queued', progress: 0, createdAt: Date.now(), project: body.project, videoUrl: body.videoUrl, fps: body.fps ?? 30 }
      renders.set(id, r)
      queue.push(r)
      void pump()
      return send(res, 202, { renderId: id, state: r.state })
    }

    if (parts[0] === 'renders' && parts[1]) {
      const r = renders.get(parts[1])
      if (!r) return send(res, 404, { error: 'not_found', renderId: parts[1] })

      if (req.method === 'GET' && parts.length === 2) return send(res, 200, view(r))

      if (req.method === 'GET' && parts[2] === 'file') {
        if (r.state !== 'done' || !r.file || !fs.existsSync(r.file)) return send(res, 409, { error: 'not_ready', state: r.state })
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': r.bytes })
        return fs.createReadStream(r.file).pipe(res)
      }

      if (req.method === 'DELETE' && parts.length === 2) {
        if (r.state === 'rendering' && r.cancel) {
          r.cancelled = true
          r.cancel()
        } else {
          r.state = r.state === 'queued' ? 'failed' : r.state
          if (r.file) fs.rm(r.file, { force: true }, () => {})
          renders.delete(r.id)
        }
        return send(res, 200, { renderId: r.id, state: r.state })
      }
    }
    return send(res, 404, { error: 'not_found' })
  } catch (error) {
    return send(res, error.status ?? 500, { error: 'server_error', detail: redact(error.message).slice(0, 300) })
  }
})

server.listen(PORT, HOST, () => log(`render server listening on http://${HOST}:${PORT} (starting up…)`))

// Start-up work happens AFTER listening, so the port is open (a connection is accepted and queued) rather
// than refused while a browser downloads and webpack bundles. Note that bundling runs in THIS process and
// blocks the event loop, so /health may not ANSWER for the first ~20-40 s; it reports ready:true once it does.
;(async () => {
  try {
    if (process.env.REMOTION_BROWSER_EXECUTABLE) log(`using browser ${process.env.REMOTION_BROWSER_EXECUTABLE}`)
    else await ensureBrowser()
    const t0 = Date.now()
    serveUrl = await bundleComposition()
    log(`composition bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s — ready`)
    void pump()
  } catch (error) {
    bundleError = redact(error?.message ?? error).split('\n')[0].slice(0, 300)
    log(`START-UP FAILED: ${bundleError}`)
  }
})()

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0))
