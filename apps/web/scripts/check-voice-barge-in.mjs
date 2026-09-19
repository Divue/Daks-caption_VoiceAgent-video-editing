// Does a mid-sentence pause still reach the agent as ONE instruction?
//
// The recogniser ends a "sentence" at a pause, so "stop… making things red" arrives as two finals.
// Acting on the first one pauses the video and sends the agent half a command — the exact bug the
// repo owner reported, reintroduced when local playback commands landed. This drives the REAL voice
// path in a REAL browser, because that is the only layer where it shows: every unit test passed
// while the bug was live.
//
//   npx playwright install chromium        # once; the package itself is resolved below
//   npm run dev                            # the editor must be running on :5173
//   node scripts/check-voice-barge-in.mjs
//
// Control: `git stash` the fix in useAgentCommand.ts and re-run — assertions 5 and 6 must FAIL.
// A test that cannot fail proves nothing.
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
let chromium
try {
  ({ chromium } = require_('playwright'))
} catch {
  console.error('playwright is not installed here. It is deliberately not a repo dependency:\n' +
    '  npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}

const BASE = 'http://localhost:5173/editor?demo=1'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] })
const ctx = await browser.newContext({ permissions: ['microphone'] })

// Force the browser-speech path: that is the transport whose finals we can drive precisely.
await ctx.route('**/agent/livekit-token', (r) => r.abort())

// A controllable stand-in for the recogniser, installed before any app code runs.
await ctx.addInitScript(() => {
  class FakeRecognition {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false
      this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null
      window.__rec = this }
    start() { setTimeout(() => this.onstart && this.onstart(), 0) }
    stop() { setTimeout(() => this.onend && this.onend(), 0) }
    abort() { setTimeout(() => this.onend && this.onend(), 0) }
  }
  // Headless Chromium exposes an UNPREFIXED SpeechRecognition, and the hook prefers it, so both
  // names have to be replaced or the app quietly uses the real one and hears nothing.
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true, writable: true })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition, configurable: true, writable: true })
  window.__say = (text) => {
    const rec = window.__rec
    if (!rec || !rec.onresult) throw new Error('recogniser not started')
    rec.onresult({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: text }], { isFinal: true, length: 1 }) } })
  }
})

const page = await ctx.newPage()
const agentCalls = []
page.on('request', (req) => {
  if (/\/agent\/(voice-)?command/.test(req.url())) {
    try { agentCalls.push(JSON.parse(req.postData() || '{}')) } catch { agentCalls.push({ parseError: true }) }
  }
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const videoState = () => page.evaluate(() => {
  const v = document.querySelector('video')
  return v ? { paused: v.paused, t: v.currentTime, rate: v.playbackRate, muted: v.muted } : null
})

// Get the clip playing, so "stop" has something to act on.
await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; return v.play() } })
await page.waitForTimeout(1200)
check('the demo clip is playing before we start', (await videoState())?.paused === false, JSON.stringify(await videoState()))

// Start the mic (browser-speech fallback).
const mic = page.locator('button[aria-label="Start voice input"]').first()
await mic.click()
await page.waitForTimeout(1500)
const started = await page.evaluate(() => !!window.__rec)
check('the recogniser started (browser-speech fallback)', started)

// ---------- the reported scenario ----------
agentCalls.length = 0
await page.evaluate(() => window.__say('stop'))
await page.waitForTimeout(900)
const afterFragment = await videoState()
check('a bare "stop" still pauses the video immediately', afterFragment?.paused === true, JSON.stringify(afterFragment))
check('a bare "stop" alone does NOT call the agent', agentCalls.length === 0, `calls=${agentCalls.length}`)

// ...the rest of the sentence, after the pause the recogniser mistook for a full stop
await page.evaluate(() => window.__say('making things red'))
await page.waitForTimeout(2500)
const sent = agentCalls.map((c) => c.transcript ?? c.command)
check('the agent receives the WHOLE sentence, not the second half',
  sent.includes('stop making things red'), `sent=${JSON.stringify(sent)}`)
const afterMerge = await videoState()
check('the player is put back the way it was (resumed)', afterMerge?.paused === false, JSON.stringify(afterMerge))

// ---------- a deliberate command must still work ----------
await page.waitForTimeout(4200)   // let the window lapse
agentCalls.length = 0
await page.evaluate(() => window.__say('stop the video'))
await page.waitForTimeout(1200)
const afterExplicit = await videoState()
check('"stop the video" pauses and stays paused', afterExplicit?.paused === true, JSON.stringify(afterExplicit))
check('"stop the video" never reaches the agent', agentCalls.length === 0, `calls=${agentCalls.length}`)

// ---------- two deliberate commands in a row are not glued together ----------
agentCalls.length = 0
await page.evaluate(() => window.__say('play'))
await page.waitForTimeout(700)
await page.evaluate(() => window.__say('mute'))
await page.waitForTimeout(1500)
const afterTwo = await videoState()
check('two bare commands in a row both act, neither merges', afterTwo?.muted === true && agentCalls.length === 0,
  `${JSON.stringify(afterTwo)} calls=${agentCalls.length}`)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
