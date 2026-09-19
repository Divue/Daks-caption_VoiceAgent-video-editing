// Dev tool: render ONE frame of a real project, to look at the composition without a full export.
//   node scripts/still.mjs <projectId> <timeMs> [apiBase]
import path from 'node:path'
import fs from 'node:fs'
import { ensureBrowser, renderStill, selectComposition } from '@remotion/renderer'
import { ROOT, bundleComposition } from '../server/bundle.mjs'

const [projectId, timeArg = '1500', apiBase = 'http://localhost:8010'] = process.argv.slice(2)
if (!projectId) {
  console.error('usage: node scripts/still.mjs <projectId> <timeMs> [apiBase]')
  process.exit(1)
}
const fps = 30
const res = await fetch(`${apiBase}/projects/${projectId}`)
if (!res.ok) throw new Error(`GET /projects/${projectId} -> ${res.status}`)
const project = await res.json()
const inputProps = { project, videoUrl: project.videoUrl, fps }

console.log('ensuring a browser…')
await ensureBrowser()
console.log('bundling…')
const t0 = Date.now()
const serveUrl = await bundleComposition()
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const composition = await selectComposition({ serveUrl, id: 'CaptionVideo', inputProps })
console.log(`composition: ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames`)
const frame = Math.min(composition.durationInFrames - 1, Math.round((Number(timeArg) / 1000) * fps))
const output = path.join(ROOT, 'out', `still-${projectId}-${timeArg}.png`)
fs.mkdirSync(path.dirname(output), { recursive: true })
const t1 = Date.now()
await renderStill({ composition, serveUrl, output, inputProps, frame })
console.log(`rendered frame ${frame} in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${output}`)
