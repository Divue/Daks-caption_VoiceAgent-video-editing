// Media layers, driven through the REAL editor against the running stack: it renders, it can be
// selected, moved, scaled, split, deleted, undone, and a new image and a new clip can be uploaded —
// and every one of those is checked against what the SERVER stored, not against the screen.
//
//   npx playwright install chromium          # once
//   npm run dev                              # editor on :5173, API on :8010
//   PROJECT_ID=<a saved project with a video> IMAGE=path.png CLIP=path.mp4 node scripts/check-layers-ui.mjs
//
// It edits that project's layers and puts them back the way it found them at the end.
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require_('playwright'))
} catch {
  console.error('playwright is not installed here. It is deliberately not a repo dependency:\n' +
    '  npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}

const PID = process.env.PROJECT_ID
const API = process.env.API ?? 'http://localhost:8010'
const APP = process.env.APP ?? 'http://localhost:5173'
if (!PID || !process.env.IMAGE || !process.env.CLIP) {
  console.error('PROJECT_ID, IMAGE and CLIP are required')
  process.exit(2)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const stored = async () => (await (await fetch(`${API}/projects/${PID}`)).json()).layers ?? []
const summary = (items) => items.map((i) => `${i.id}@${i.track}[${i.startMs}-${i.endMs}]`).join(' ')
const settle = (page, ms = 1500) => page.waitForTimeout(ms)

const original = await stored()
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
const writes = []
page.on('request', (r) => { if (r.method() === 'PATCH') writes.push(new URL(r.url()).pathname) })

try {
  await page.goto(`${APP}/editor?id=${PID}`, { waitUntil: 'networkidle' })
  await settle(page, 3500)
  const seekTo = async (ms) => {
    await page.evaluate((t) => { const v = document.querySelector('video'); v.pause(); v.currentTime = t / 1000 }, ms)
    await settle(page, 700)
  }

  // --- start from a known state: one image, 0–5 s -------------------------------------------
  const base = original.find((i) => i.kind === 'image')
  check('the project starts with exactly one image layer and nothing else', !!base && original.length === 1, summary(original))
  if (!base) throw new Error('needs a project with an image layer to start from')

  await seekTo(1000)
  const img = page.locator(`img[data-layer-id="${base.id}"]`)
  check('the image is drawn over the video', (await img.count()) === 1 && (await img.isVisible()))
  const frame = await page.locator('[data-layer-stage]').boundingBox()
  const box = await img.boundingBox()
  const cx = ((box.x + box.width / 2 - frame.x) / frame.width) * 100
  check('…centred where the document says (x, y are the CENTRE)', Math.abs(cx - base.x) < 1, `x=${cx.toFixed(1)} want ${base.x}`)
  check('…at the document’s width, height from its aspect', Math.abs((box.width / frame.width) * 100 - base.width) < 1 && Math.abs(box.width / box.height - base.aspect) < 0.05)
  await seekTo(base.endMs + 500)
  check('…and gone after its end', !(await img.isVisible().catch(() => false)))

  // --- select from the timeline --------------------------------------------------------------
  await seekTo(1000)
  await page.locator(`[data-layer-item="${base.id}"]`).click({ position: { x: 30, y: 8 } })
  await settle(page, 600)
  check('clicking it on the timeline selects it and opens its properties', (await page.locator(`[data-layer-properties="${base.id}"]`).count()) === 1)

  // --- move on the preview -------------------------------------------------------------------
  writes.length = 0
  const sel = await page.locator(`[data-layer-selected="${base.id}"]`).boundingBox()
  await page.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2)
  await page.mouse.down()
  await page.mouse.move(sel.x + sel.width / 2 - frame.width * 0.3, sel.y + sel.height / 2 + frame.height * 0.2, { steps: 8 })
  await page.mouse.up()
  await settle(page)
  let now = (await stored()).find((i) => i.id === base.id)
  check('dragging it on the video moves it — and it is SAVED', now && Math.abs(now.x - (base.x - 30)) < 2 && Math.abs(now.y - (base.y + 20)) < 2, `x ${base.x}→${now?.x}, y ${base.y}→${now?.y}`)
  check('…as ONE write, not one per mouse move', writes.filter((w) => w === `/projects/${PID}`).length === 1, `${writes.length} writes`)

  // --- scale by a corner ---------------------------------------------------------------------
  const before = now.width
  const handle = await page.locator(`[data-layer-selected="${base.id}"] [data-handle="se"]`).boundingBox()
  await page.mouse.move(handle.x + 5, handle.y + 5)
  await page.mouse.down()
  await page.mouse.move(handle.x + 5 + 60, handle.y + 5 + 30, { steps: 6 })
  await page.mouse.up()
  await settle(page)
  now = (await stored()).find((i) => i.id === base.id)
  check('dragging a corner scales it, uniformly', now.width > before + 3 && now.aspect === base.aspect, `width ${before}→${now.width}`)

  // --- split at the playhead, then undo ------------------------------------------------------
  await seekTo(2500)
  await page.keyboard.press('Control+b')
  await settle(page)
  let items = await stored()
  const halves = items.filter((i) => i.mediaId === base.mediaId)
  check('Ctrl+B splits it at the playhead into two saved items', halves.length === 2 && halves.some((i) => i.endMs === 2500) && halves.some((i) => i.startMs === 2500), summary(items))
  await page.keyboard.press('Control+z')
  await settle(page, 2500)
  const onScreen = await page.locator('[data-layer-item]').count()
  const onServer = (await stored()).length
  check('one Ctrl+Z undoes the whole split', onScreen === items.length - 1, `${onScreen} on the timeline`)
  // The one that used to fail silently: undo changed the screen and never the server, so a reload —
  // or an export — brought the split back.
  check('…and the undo is SAVED, not just shown', onServer === items.length - 1, `${onServer} on the server`)

  // --- upload an image and a clip through the toolbar ----------------------------------------
  const countBefore = (await stored()).length
  await seekTo(6000)
  await page.locator('input[data-layer-file]').first().setInputFiles(process.env.IMAGE)
  await page.waitForFunction((n) => document.querySelectorAll('[data-layer-item]').length > n, countBefore, { timeout: 30000 })
  await settle(page)
  items = await stored()
  const added = items.find((i) => !original.some((o) => o.id === i.id) && i.kind === 'image' && i.startMs === 6000)
  check('Add media: an image lands at the playhead, saved', !!added, summary(items))

  await seekTo(7000)
  await page.locator('input[data-layer-file]').first().setInputFiles(process.env.CLIP)
  await page.waitForFunction((n) => document.querySelectorAll('[data-layer-item]').length > n, items.length, { timeout: 30000 })
  await settle(page)
  items = await stored()
  // The clip THIS run uploaded — not one the project already had.
  const clip = items.find((i) => i.kind === 'video' && !original.some((o) => o.id === i.id))
  check('Add media: a clip lands with its real length measured', !!clip && clip.sourceDurationMs >= 2900 && clip.sourceDurationMs <= 3200 && clip.endMs - clip.startMs === clip.sourceDurationMs, clip ? `source ${clip.sourceDurationMs}ms, placed ${clip.startMs}-${clip.endMs}` : 'none')
  check('…on the other track when the first is busy there', !!clip && clip.track === 2, clip ? `track ${clip.track}` : '')

  // --- the clip follows the main clock --------------------------------------------------------
  await seekTo(clip.startMs + 1500)
  const t = await page.evaluate((id) => document.querySelector(`video[data-layer-id="${id}"]`)?.currentTime ?? -1, clip.id)
  check('scrubbing shows the right moment of the clip (source time = trim + offset)', Math.abs(t - 1.5) < 0.1, `currentTime=${t.toFixed(2)}`)

  // --- delete --------------------------------------------------------------------------------
  await page.locator(`[data-layer-item="${clip.id}"]`).click({ position: { x: 20, y: 8 } })
  await settle(page, 400)
  await page.keyboard.press('Delete')
  await settle(page)
  check('Delete removes the selected item, saved', !(await stored()).some((i) => i.id === clip.id))

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  // Put the project's layers back exactly as they were.
  const res = await fetch(`${API}/projects/${PID}`)
  const version = res.headers.get('x-project-version')
  await fetch(`${API}/projects/${PID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: Number(version), layers: original }),
  })
  await browser.close()
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
