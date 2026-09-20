// Does a preset SEGMENT actually change the EXPORTED PIXELS?
//
// `apps/web`'s check:segments proves the preview and the export RESOLVE the same preset for
// every frame. It cannot prove the export draws it, because it never renders anything. This
// does: real stills, through the real bundle, the real Chromium and the real CaptionRenderer,
// compared by hash.
//
// It needs no API and no stored project — the shared fixture IS the project, and a local clip
// from the STT bake-off is served over http so OffthreadVideo has something to fetch. That
// clip is the same in every render, so the background cancels out and a hash difference can
// only be the captions.
//
// Slow (a bundle plus 8 Chromium stills), so it is a dev tool like still.mjs, not part of
// `npm run check`. Run: `npm run check:export-segments -w @captions/remotion`
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { ensureBrowser, renderStill, selectComposition } from '@remotion/renderer'
import { ROOT as REMOTION_ROOT, bundleComposition } from '../server/bundle.mjs'

const ROOT = path.resolve(REMOTION_ROOT, '..')
const OUT = process.argv[2] ?? path.join(REMOTION_ROOT, 'out', 'segment-stills')
mkdirSync(OUT, { recursive: true })
const CLIP = path.join(ROOT, 'services/api/scripts/stt_bakeoff/clips/Normal.mp4')
if (!statSync(CLIP, { throwIfNoEntry: false })) {
  console.error(`missing the background clip: ${CLIP}`)
  process.exit(1)
}

// The background clip, so the caption layer is drawn over the same pixels in every render.
const server = createServer((req, res) => {
  const size = statSync(CLIP).size
  const range = req.headers.range
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-')
    const start = Number(s)
    const end = e ? Number(e) : size - 1
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' })
    createReadStream(CLIP, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' })
    createReadStream(CLIP).pipe(res)
  }
})
await new Promise((r) => server.listen(5188, r))
const videoUrl = 'http://localhost:5188/clip.mp4'

const fixture = JSON.parse(readFileSync(path.join(ROOT, 'packages/shared/fixtures/demo-project.json'), 'utf8'))
const fps = 30

// Four projects. `mrbeast` packs 2 words a line against `rangmanch`'s 3 and is a totally
// different face, so if a segment reaches the renderer at all it is unmissable.
const base = { ...fixture, presetId: 'rangmanch' }
const allMrBeast = { ...fixture, presetId: 'mrbeast' }
const wholeAsSegment = { ...fixture, presetId: 'rangmanch', presetSegments: [{ id: 's', startMs: 0, endMs: fixture.durationMs, presetId: 'mrbeast' }] }
const halfSegment = { ...fixture, presetId: 'rangmanch', presetSegments: [{ id: 's', startMs: 4400, endMs: fixture.durationMs, presetId: 'mrbeast' }] }

console.log('ensuring a browser…')
await ensureBrowser()
console.log('bundling the composition…')
const t0 = Date.now()
const serveUrl = await bundleComposition()
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const shot = async (name, project, timeMs) => {
  const inputProps = { project, videoUrl, fps }
  const composition = await selectComposition({ serveUrl, id: 'CaptionVideo', inputProps })
  const output = path.join(OUT, `${name}.png`)
  await renderStill({ composition, serveUrl, output, inputProps, frame: Math.round((timeMs / 1000) * fps) })
  const hash = createHash('sha256').update(readFileSync(output)).digest('hex').slice(0, 16)
  console.log(`  rendered ${name} @${timeMs}ms -> ${hash}`)
  return hash
}

// t=5300 sits inside "bekaar" (5120-5650), i.e. inside the half segment.
// t=800  sits inside "Hello" (300-1350), i.e. outside it.
console.log('rendering…')
const IN = 5300
const OUT_MS = 800
const h = {
  baseIn: await shot('base-in', base, IN),
  mrbeastIn: await shot('mrbeast-in', allMrBeast, IN),
  wholeIn: await shot('whole-segment-in', wholeAsSegment, IN),
  halfIn: await shot('half-segment-in', halfSegment, IN),
  baseOut: await shot('base-out', base, OUT_MS),
  mrbeastOut: await shot('mrbeast-out', allMrBeast, OUT_MS),
  halfOut: await shot('half-segment-out', halfSegment, OUT_MS),
}

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
console.log('\nexported pixels')
check('a segment covering the whole video renders IDENTICALLY to setting the base preset',
  h.wholeIn === h.mrbeastIn, `${h.wholeIn} vs ${h.mrbeastIn}`)
check('…and that is not trivially true: the base preset renders differently',
  h.mrbeastIn !== h.baseIn, `${h.mrbeastIn} vs ${h.baseIn}`)
check('INSIDE a half segment, the export uses the SEGMENT’s preset',
  h.halfIn === h.mrbeastIn, `${h.halfIn} vs ${h.mrbeastIn}`)
check('OUTSIDE it, the export uses the project’s own preset',
  h.halfOut === h.baseOut, `${h.halfOut} vs ${h.baseOut}`)
check('…and those two are genuinely different frames',
  h.baseOut !== h.mrbeastOut, `${h.baseOut} vs ${h.mrbeastOut}`)
check('the render is deterministic (same project, same frame, same bytes)',
  (await shot('base-in-again', base, IN)) === h.baseIn)

server.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nAll export checks passed.')
process.exit(failures.length ? 1 : 0)
