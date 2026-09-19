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
