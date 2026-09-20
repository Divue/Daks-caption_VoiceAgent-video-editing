// Hand edits to a word's TEXT and TIMING. Pure, no React, no DOM — same contract as lib/layers.ts,
// and for the same reason: the arithmetic is testable on its own (scripts/check-word-edit.ts) and
// the component is left with nothing but the widget.
//
// THE INVARIANT THIS FILE EXISTS FOR: `Project.words` is in PLAYBACK ORDER, and a great deal of
// code assumes it without checking. `deriveBlocks` says so in its header; `findBlockIndexAt`
// (hooks/useCaptionBlocks.ts) BINARY-SEARCHES the blocks that come out of it, so a single word
// dragged past its neighbour makes the playhead silently find no caption at all; the agent's
// `select_word_range` and `get_timeline` (services/api/app/agent/tools/context_tools.py) both read
// the array index, not the id. Nothing re-sorts: `store/projects.py:_apply_word_patch` writes a
// word in place, and the agent's `shift_timing` clamps at 0 and checks end > start but never looks
// at the neighbours.
//
// So a timing edit RIPPLES: the edited word goes where it is put and any word it runs into is
// pushed along, keeping its own duration, until one has room. The order can then never break and
// there is nothing to re-sort, while the word is still free to move as far as the user needs —
// which a clamp into the neighbours' gap was not (see `retimeWord`, and the bug that rewrote it).
import type { Word } from '@captions/shared'

/**
 * The shortest a word may be. A zero-length word is legal in the schema (both bounds are
 * `int().min(0)`, with no cross-field rule) and renders as a caption that flashes for no frames,
 * which reads as the renderer being broken. 40 ms is one frame at 25 fps — the smallest span that
 * can actually be seen.
 */
export const MIN_WORD_MS = 40

/**
 * Retime one word, RIPPLING its neighbours out of the way.
 *
 * THE FIRST VERSION OF THIS CLAMPED THE WORD INTO THE GAP ITS NEIGHBOURS LEFT, AND THAT WAS
 * WRONG. It preserved the order invariant perfectly and made the feature useless: on a real
 * 160-word reel the neighbours are touching, so the window was often a few milliseconds wide and
 * the field simply would not move. Measured on project 6c437eb52961, where the word "nine" sits
 * at 19649-19659ms between two words that touch it on both sides: the allowed window was 10 ms,
 * narrower than MIN_WORD_MS, so the edit was refused outright. The words most in need of fixing
 * are exactly the ones the pipeline crushed together, which is precisely where a neighbour-tight
 * clamp locks up.
 *
 * So the neighbours move instead. The edited word goes where it is put; any word it now overlaps
 * is pushed along, keeping its own duration, and the push stops at the first word that already
 * has room. That is what every timeline editor calls a ripple, and it keeps the ordering
 * invariant (see the header) by construction rather than by refusal.
 *
 * Returns every word whose times changed, the edited one first, or `null` if the ripple cannot
 * fit before the end of the video — the caller says so rather than silently truncating.
 */
export interface TimingChange {
  id: string
  startMs: number
  endMs: number
}

export function retimeWord(
  words: Word[],
  wordId: string,
  durationMs: number,
  proposed: { startMs?: number; endMs?: number },
): TimingChange[] | null {
  const index = words.findIndex((word) => word.id === wordId)
  if (index === -1) return null
  const word = words[index]

  const movedStart = proposed.startMs !== undefined
  let startMs = clamp(Math.round(proposed.startMs ?? word.startMs), 0, durationMs)
  let endMs = clamp(Math.round(proposed.endMs ?? word.endMs), 0, durationMs)
  // The edge the user moved gets its way; the other yields, so a drag feels obeyed.
  if (endMs - startMs < MIN_WORD_MS) {
    if (movedStart) endMs = startMs + MIN_WORD_MS
    else startMs = endMs - MIN_WORD_MS
  }
  if (startMs < 0 || endMs > durationMs) return null

  const changes: TimingChange[] = [{ id: word.id, startMs, endMs }]

  // Forward: push every word the new span now runs into, stopping at the first with room.
  let edge = endMs
  for (let k = index + 1; k < words.length; k += 1) {
    const next = words[k]
    if (next.startMs >= edge) break
    const span = Math.max(MIN_WORD_MS, next.endMs - next.startMs)
    if (edge + span > durationMs) return null // no room left before the end of the video
    changes.push({ id: next.id, startMs: edge, endMs: edge + span })
    edge += span
  }

  // Backward: the same, for a word dragged earlier than the one before it.
  edge = startMs
  for (let k = index - 1; k >= 0; k -= 1) {
    const previous = words[k]
    if (previous.endMs <= edge) break
    const span = Math.max(MIN_WORD_MS, previous.endMs - previous.startMs)
    if (edge - span < 0) return null // no room left before the start of the video
    changes.unshift({ id: previous.id, startMs: edge - span, endMs: edge })
    edge -= span
  }

  return changes
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export type TextEdit =
  | { ok: true; text: string; /** Set when the typed text was changed to make it storable. */ note?: string }
  | { ok: false; reason: string }

/**
 * What a typed word should actually become.
 *
 * EMPTY IS REFUSED. The REST route and the agent disagree here — `WordFields.text`
 * (services/api/app/routers/projects.py) has no `min_length`, while the agent's `SetTextArgs`
 * requires >= 1 — and the agent is right: an empty word still holds its slot in the caption line
 * and its span on the timeline, so it renders as a gap that looks like a bug. Clearing a word is
 * really "delete this word", which has no endpoint and no agent tool (phase two), so the honest
 * answer is to refuse and say why rather than to store something that renders wrong.
 *
 * A TYPED SPACE IS COLLAPSED, NOT SPLIT. "two words" in one field arguably means "split this into
 * two", but splitting mints a word id and inserts into `words`, which is phase two for the same
 * reason. Collapsing to a single space keeps the text storable and the note says what did not
 * happen — silently dropping the space, or silently splitting, would both be worse.
 */
export function cleanWordText(raw: string): TextEdit {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return { ok: false, reason: 'A word can’t be empty. Deleting words isn’t available yet.' }
  if (collapsed.includes(' ')) {
    return { ok: true, text: collapsed, note: 'Kept as one word — splitting a word into two isn’t available yet.' }
  }
  return { ok: true, text: collapsed }
}
