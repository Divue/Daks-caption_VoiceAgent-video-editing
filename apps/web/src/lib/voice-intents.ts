/**
 * What the editor handles itself, before anything reaches the agent.
 *
 * Pure and dependency-free on purpose: these are the rules that decide whether a Bedrock
 * round trip happens at all, so they need to be testable without mounting React.
 */

/** "Undo that" is the editor's job, not a tool call — see useAgentCommand for why. */
export const UNDO_PHRASES =
  /^(undo( that| it| the last( one)?)?|take that back|revert that|nevermind|never mind)[.!]?$/i
export const REDO_PHRASES = /^(redo( that| it)?|put it back)[.!]?$/i

/**
 * Speech that is not a command. A live microphone hears throat-clearing, the tail of a
 * sentence aimed at someone else, and the recogniser's own guesses at silence — and every one
 * of those cost a Bedrock round trip and a history entry saying "I'm not sure what you meant".
 *
 * Anchored and whole-string: "so" is filler, "so make it bigger" is a command.
 */
export const FILLER =
  /^(uh+|um+|hm+|mm+|ah+|oh+|er+|eh+|yeah|yep|ok(ay)?|so|and|the|a|i|you know|like)[.,!?]*$/i

/** Below this, a "command" is recogniser noise. */
export const MIN_VOICE_CHARS = 3

/** Stopping by voice, because reaching for the mouse to stop talking is silly. */
export const STOP_LISTENING =
  /^(stop listening|stop the mic|mic off|that'?s all|i'?m done|thats all)[.!]?$/i

/** True when a voice transcript should be dropped rather than sent to the agent. */
export function isNotACommand(transcript: string): boolean {
  const words = transcript.replace(/[.,!?]/g, '').trim()
  return words.length < MIN_VOICE_CHARS || FILLER.test(words)
}

/**
 * Two things said with a pause between them, as the one instruction the user meant.
 *
 * People pause mid-sentence — "increase the size of the white font … from 10 s to 12 s" — and
 * the recogniser, which only hears the silence, emits the first half as a finished sentence.
 * That half reaches the agent, the agent starts, and the second half arrives as a new command.
 * Treating it as a replacement threw the first instruction away; this treats it as what it was.
 *
 * Handles the recogniser's own habits:
 * - it ends a fragment with "." just because the speaker paused — that period is dropped, so the
 *   halves read as one sentence;
 * - it sometimes emits the same final twice — a repeat is ignored;
 * - some engines re-send the whole utterance so far — a fragment that already CONTAINS the
 *   previous one replaces it rather than doubling it.
 */
export function mergeUtterances(previous: string, next: string): string {
  const prev = previous.trim()
  const cur = next.trim()
  if (!prev) return cur
  if (!cur) return prev

  const norm = (text: string) =>
    text
      .toLowerCase()
      .replace(/[.,!?…]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const p = norm(prev)
  const c = norm(cur)

  if (c === p || p.endsWith(c)) return prev // a repeat of what we already have
  if (c.startsWith(p)) return cur // the engine re-sent the whole utterance, extended

  // Only the recogniser's pause-period is dropped: "!" and "?" were said on purpose.
  return `${prev.replace(/\.+$/, '')} ${cur}`
}

// --- the video's own controls, by voice ----------------------------------------------------------
//
// "Play the video" used to go to Bedrock, which has no playback tool, and came back
// "UNSUPPORTED: I can't control video playback" — eight seconds and a model call to say no to the
// most obvious thing a person says to a video editor. Playback belongs to the editor, like undo, so
// it is answered here: instantly, offline, and for free.
//
// The parser is deliberately STRICT — anchored whole-phrase, like every other intent in this file.
// A greedy one would swallow real edits ("play the word bekaar in red", "stop making things red"),
// and a command silently eaten by the wrong handler is worse than one that reaches the agent.

export type TransportIntent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'restart' }
  | { type: 'seek'; ms: number }
  | { type: 'skip'; ms: number }
  | { type: 'rate'; rate: number }
  | { type: 'rateStep'; direction: 1 | -1 }
  | { type: 'mute' }
  | { type: 'unmute' }

/** "Go to the end". Clamped to the real duration by `resolveTransport`. */
export const SEEK_TO_END = Number.MAX_SAFE_INTEGER

/** The speeds the transport bar offers. Voice steps through the same list. */
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

/** "5", "five", "twenty five", "twenty-five" → a number; anything else → null. */
function toNumber(text: string): number | null {
  const t = text.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  let total = 0
  const tokens = t.split(/[\s-]+/).filter((w) => w && w !== 'and')
  if (tokens.length === 0) return null
  for (const token of tokens) {
    if (token in UNITS) total += UNITS[token]
    else if (token in TENS) total += TENS[token]
    else return null
  }
  return total
}

/** "second(s)", "sec", "minute(s)", "min" → milliseconds per unit. */
function unitMs(unit: string): number {
  return /^min/.test(unit) ? 60_000 : 1000
}

/** How a person opens a sentence they mean as a command. Stripped before matching, never after. */
const LEAD_IN = /^(?:(?:hey|ok|okay|so|now|please|can you|could you|will you|would you|let'?s|just|i want you to|i want to)\s+)+/
const TRAIL_OFF = /(?:\s+(?:please|now|for me))+$/
/** What the verb may be pointed at. Anything else ("the word", "the emphasis") means it is an edit. */
const THING = '(?: (?:the )?(?:video|clip|playback|footage|reel|it|this))?'

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?…]+(?=\s|$)/g, '') // sentence punctuation, but not the dot in "1.5x"
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEAD_IN, '')
    .replace(TRAIL_OFF, '')
    .trim()
}

/** "1:30", "5 seconds", "the 5 second mark", "two minutes", "one minute thirty" → ms, else null. */
function parseTimeExpression(expr: string): number | null {
  const e = expr.replace(/^the /, '').trim()
  const clock = e.match(/^(\d+):(\d{1,2})$/)
  if (clock) return (Number(clock[1]) * 60 + Number(clock[2])) * 1000
  const mixed = e.match(/^(.+?) minutes?(?: and)? (.+?)(?: seconds?)?$/)
  if (mixed) {
    const m = toNumber(mixed[1])
    const s = toNumber(mixed[2])
    if (m !== null && s !== null) return (m * 60 + s) * 1000
  }
  const simple = e.match(/^(.+?) (seconds?|secs?|minutes?|mins?)(?: mark)?$/)
  if (simple) {
    const n = toNumber(simple[1])
    if (n !== null) return n * unitMs(simple[2])
  }
  return null
}

/**
 * The transport command in `text`, or null when it is anything else (an edit, a question, noise).
 * `ctx.playing` lets the parser read a garbled one-word "pause" for what it almost certainly was.
 */
export function parseTransportIntent(text: string, ctx?: { playing?: boolean }): TransportIntent | null {
  const s = normalise(text)
  if (!s) return null

  // Restart first: "play it again" and "rewind" must not be read as plain play / skip.
  if (
    new RegExp(
      `^(?:restart|replay|start over|start again|rewind|play(?: it| the video| the clip)? again|` +
        `play(?: it| the video| the clip)? from the (?:start|beginning)|from the (?:start|beginning)|` +
        `(?:go|jump|skip|seek|take me|rewind|head)(?: back)? to the (?:start|beginning))${THING}$`,
    ).test(s)
  ) {
    return { type: 'restart' }
  }

  // Absolute seek: "go to 5 seconds", "jump to the 5 second mark", "seek to 1:30".
  const seek = s.match(/^(?:go|jump|skip|seek|move|scrub|take me|head)(?: forward| ahead| back)? to (.+)$/)
  if (seek) {
    if (/^(?:the )?end$/.test(seek[1])) return { type: 'seek', ms: SEEK_TO_END }
    const ms = parseTimeExpression(seek[1])
    if (ms !== null) return { type: 'seek', ms }
    return null // "go to the third line" is a request about the captions, not the clock
  }

  // Relative skip: "skip 10 seconds", "go back 5 seconds", "rewind 3 seconds".
  const skip = s.match(/^(skip|go|jump|move|fast forward|forward|rewind|back|seek)( forward| ahead| back| backwards?)?(?: by)? (.+?) (seconds?|secs?|minutes?|mins?)$/)
  if (skip) {
    const n = toNumber(skip[3])
    if (n !== null) {
      const backwards = skip[1] === 'rewind' || skip[1] === 'back' || /back/.test(skip[2] ?? '')
      return { type: 'skip', ms: (backwards ? -1 : 1) * n * unitMs(skip[4]) }
    }
    return null
  }

  // Speed.
  const times = s.match(/^(?:play(?: it)?(?: at)? )?(\d(?:\.\d+)?) ?x(?: speed)?$/)
  if (times) return { type: 'rate', rate: Number(times[1]) }
  if (/^(?:normal|regular|standard|default) speed$|^reset speed$/.test(s)) return { type: 'rate', rate: 1 }
  if (/^(?:double|twice)(?: the)?(?: speed)?$/.test(s)) return { type: 'rate', rate: 2 }
  if (/^half(?: the)? speed$/.test(s)) return { type: 'rate', rate: 0.5 }
  if (/^(?:(?:go |play |a bit |a little )?faster|speed (?:it )?up)$/.test(s)) return { type: 'rateStep', direction: 1 }
  if (/^(?:(?:go |play |a bit |a little )?slower|slow (?:it )?down)$/.test(s)) return { type: 'rateStep', direction: -1 }

  // Sound.
  if (new RegExp(`^(?:mute|silence)(?: the)?(?: (?:video|sound|audio|volume|it))?$`).test(s) || /^(?:turn (?:the )?(?:sound|audio|volume) off|turn off (?:the )?(?:sound|audio|volume)|(?:sound|audio|volume) off)$/.test(s)) {
    return { type: 'mute' }
  }
  if (new RegExp(`^unmute(?: the)?(?: (?:video|sound|audio|volume|it))?$`).test(s) || /^(?:turn (?:the )?(?:sound|audio|volume) on|turn on (?:the )?(?:sound|audio|volume)|(?:sound|audio|volume) on)$/.test(s)) {
    return { type: 'unmute' }
  }

  // Play / pause. The noun list is closed on purpose: "play the word bekaar…" is not a transport command.
  if (new RegExp(`^(?:play|resume|unpause|continue(?: playing)?|start(?: playing)?)${THING}$`).test(s) || /^(?:video )?(?:chalao|chala do|chalu karo|shuru karo|play karo)(?: video)?$/.test(s)) {
    return { type: 'play' }
  }
  if (new RegExp(`^(?:pause|stop|freeze|halt|hold on|hold)${THING}$`).test(s) || /^(?:video )?(?:ruko|ruk jao|rok do|thehro|thahro|pause karo)(?: video)?$/.test(s)) {
    return { type: 'pause' }
  }
  // Measured, not guessed: a clearly spoken "pause" came back from Sarvam (en-IN) as "Pass", "Pass"
  // and "House" — three tries, never once "pause" — and the video kept playing. One short word is
  // the hardest thing for a recogniser to get right, and "pause" is the command people say most.
  // A BARE "pass"/"paws" means nothing else to a video editor, so it always counts.
  if (/^(?:pass|paws|pores)$/.test(s)) return { type: 'pause' }
  // While the video is PLAYING, any other bare word that sounds like "pause" is far more likely a
  // mis-heard pause than a real command: a wrong guess costs one "play", a miss makes the app feel
  // dead. Deliberately not applied when paused, and never to a word inside a longer sentence.
  if (ctx?.playing && /^(?:pours|pose|house|hours|force|cause|paused|pausing)$/.test(s)) return { type: 'pause' }

  return null
}

/** `0:05`, for the activity log. Local on purpose: this file has no imports. */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** What to tell the user happened, in plain words. */
export function describeTransport(intent: TransportIntent, durationMs: number): string {
  switch (intent.type) {
    case 'play':
      return 'Playing'
    case 'pause':
      return 'Paused'
    case 'restart':
      return 'Restarted from the beginning'
    case 'seek':
      return intent.ms >= durationMs ? 'Jumped to the end' : `Jumped to ${clock(intent.ms)}`
    case 'skip':
      return `Skipped ${intent.ms >= 0 ? 'forward' : 'back'} ${Math.round(Math.abs(intent.ms) / 1000)}s`
    case 'rate':
      return `Speed ${intent.rate}×`
    case 'rateStep':
      return intent.direction > 0 ? 'Faster' : 'Slower'
    case 'mute':
      return 'Muted'
    case 'unmute':
      return 'Unmuted'
  }
}

/** What the player should do, and what to say about it. Pure, so the arithmetic is testable. */
export interface TransportContext {
  timeMs: number
  durationMs: number
  rate: number
}
export type TransportAction =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'seek'; ms: number; thenPlay?: boolean }
  | { kind: 'rate'; rate: number }
  | { kind: 'mute'; muted: boolean }
  | { kind: 'none' }

export function resolveTransport(
  intent: TransportIntent,
  ctx: TransportContext,
): { action: TransportAction; label: string } {
  const clamp = (ms: number) => Math.max(0, Math.min(ms, ctx.durationMs))
  switch (intent.type) {
    case 'play':
    case 'pause':
    case 'mute':
    case 'unmute':
      return {
        action: intent.type === 'play' ? { kind: 'play' } : intent.type === 'pause' ? { kind: 'pause' } : { kind: 'mute', muted: intent.type === 'mute' },
        label: describeTransport(intent, ctx.durationMs),
      }
    case 'restart':
      return { action: { kind: 'seek', ms: 0, thenPlay: true }, label: describeTransport(intent, ctx.durationMs) }
    case 'seek': {
      const ms = clamp(intent.ms)
      return { action: { kind: 'seek', ms }, label: describeTransport({ type: 'seek', ms: intent.ms }, ctx.durationMs) }
    }
    case 'skip':
      return { action: { kind: 'seek', ms: clamp(ctx.timeMs + intent.ms) }, label: describeTransport(intent, ctx.durationMs) }
    case 'rate': {
      const rate = Math.max(0.25, Math.min(intent.rate, 4))
      return { action: { kind: 'rate', rate }, label: describeTransport({ type: 'rate', rate }, ctx.durationMs) }
    }
    case 'rateStep': {
      const at = PLAYBACK_RATES.reduce((best, r, i) => (Math.abs(r - ctx.rate) < Math.abs(PLAYBACK_RATES[best] - ctx.rate) ? i : best), 0)
      const next = PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, at + intent.direction))]
      if (next === PLAYBACK_RATES[at]) {
        return { action: { kind: 'none' }, label: intent.direction > 0 ? 'Already at the fastest speed' : 'Already at the slowest speed' }
      }
      return { action: { kind: 'rate', rate: next }, label: `Speed ${next}×` }
    }
  }
}
