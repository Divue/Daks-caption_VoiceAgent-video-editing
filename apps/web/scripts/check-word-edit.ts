// Hand editing of a word's text and timing: the arithmetic, and the order invariant it protects.
// Plain check() script, like its neighbours:  npm run check:word-edit
import { Project, deriveBlocks } from '@captions/shared'
import type { Word } from '@captions/shared'
import fixture from '../../../packages/shared/fixtures/demo-project.json'
import { MIN_WORD_MS, cleanWordText, retimeWord } from '../src/lib/word-edit'
import { createInitialState, projectReducer } from '../src/state/project-reducer'

/**
 * `findBlockIndexAt` (src/hooks/useCaptionBlocks.ts) is a BINARY SEARCH over the derived blocks.
 * It is not imported here — that module reaches `@/state/project-context`, a .tsx file jiti will
 * not parse — so its PRECONDITION is asserted instead, which is the thing a timing edit can
 * actually break: blocks in ascending, non-overlapping start order. A binary search over a list
 * that fails this silently returns -1, and the playhead finds no caption at all.
 */
const blocksAreSearchable = (blocks: { startMs: number; endMs: number }[]) =>
  blocks.every((block, index) => index === 0 || blocks[index - 1].endMs <= block.startMs)

const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const project = Project.parse(fixture)
const words = project.words
const duration = project.durationMs

const apply = (list: Word[], changes: { id: string; startMs: number; endMs: number }[] | null) =>
  changes === null ? list : list.map((w) => {
    const hit = changes.find((c) => c.id === w.id)
    return hit ? { ...w, startMs: hit.startMs, endMs: hit.endMs } : w
  })
const sorted = (list: Word[]) => list.every((w, i) => i === 0 || list[i - 1].endMs <= w.startMs)

console.log('\nretimeWord — the regression that rewrote this file')
{
  // Real data from project 6c437eb52961: four words crushed into 51ms by the pipeline, each
  // fenced in by the next. The first version of this file CLAMPED into the neighbours' gap and
  // refused every edit here, which is the bug the user hit. A run this tight must stay editable.
  const crushed: Word[] = [
    { ...words[0], id: 'a', text: 'next', startMs: 19120, endMs: 19649 },
    { ...words[1], id: 'b', text: 'nine', startMs: 19649, endMs: 19659 },
    { ...words[2], id: 'c', text: 'seconds', startMs: 19659, endMs: 19690 },
    { ...words[3], id: 'd', text: 'I', startMs: 19690, endMs: 19700 },
    { ...words[4], id: 'e', text: 'want', startMs: 19712, endMs: 20032 },
    { ...words[5], id: 'f', text: 'the', startMs: 21900, endMs: 22000 },
  ]
  const room = 74136

  const grown = retimeWord(crushed, 'b', room, { endMs: 20400 })
  check('a word wedged between two touching neighbours CAN now be stretched', grown !== null)
  const after = apply(crushed, grown)
  check('…the edited word got exactly what was asked',
    after[1].endMs === 20400, JSON.stringify(after[1]))
  check('…the words it ran into were pushed, not overwritten',
    after[2].startMs === 20400 && after[3].startMs === after[2].endMs, JSON.stringify(after.slice(2, 4)))
  check('…each pushed word kept at least its own length',
    after[2].endMs - after[2].startMs >= 31 && after[3].endMs - after[3].startMs >= MIN_WORD_MS)
  check('…the push stopped at the first word with room (the 1.87s hole)',
    after[5].startMs === 21900, JSON.stringify(after[5]))
  check('…and the words are still in playback order', sorted(after))

  const early = retimeWord(crushed, 'd', room, { startMs: 19100 })
  check('dragging a word EARLIER pushes the ones before it', early !== null)
  const back = apply(crushed, early)
  check('…and still leaves them in order', sorted(back), JSON.stringify(back.map((w) => [w.startMs, w.endMs])))
  check('…the edited word got what was asked', back[3].startMs === 19100, JSON.stringify(back[3]))

  const reach = retimeWord(crushed, 'b', room, { endMs: 19700 })!
  check('a ripple returns ONLY the words it actually moved — and stops at the hole',
    reach.map((c) => c.id).join() === 'b,c,d,e', JSON.stringify(reach.map((c) => c.id)))

  check('a word pushed past the end of the video is refused, not truncated',
    retimeWord(crushed, 'f', 22050, { startMs: 22030 }) === null)
  check('a ripple that would shove a predecessor past 0 is refused',
    retimeWord(crushed, 'b', room, { startMs: 0 }) === null)
}

console.log('\nretimeWord — every listed timing edge case')
{
  const id = words[5].id
  const self = words[5]

  const inverted = apply(words, retimeWord(words, id, duration, { endMs: self.startMs - 500 }))
  const iw = inverted.find((w) => w.id === id)!
  check('endMs dragged before startMs never inverts the span', iw.endMs - iw.startMs >= MIN_WORD_MS, JSON.stringify(iw))

  const zero = apply(words, retimeWord(words, id, duration, { endMs: self.startMs }))
  const zw = zero.find((w) => w.id === id)!
  check('a zero-length word is refused', zw.endMs - zw.startMs >= MIN_WORD_MS, JSON.stringify(zw))

  check('a time past durationMs is refused rather than silently truncated',
    retimeWord(words, id, duration, { endMs: duration + 90_000 }) === null)

  const back = apply(words, retimeWord(words, id, duration, { startMs: 0 }))
  check('a word dragged to 0 pushes everything before it and stays ordered', sorted(back))

  const moved = retimeWord(words, id, duration, { startMs: self.startMs + 30 })!
  check('the edge the user moved gets its way',
    moved.find((c) => c.id === id)!.startMs === self.startMs + 30, JSON.stringify(moved[0]))
  check('times come back as integers, as the schema requires',
    moved.every((c) => Number.isInteger(c.startMs) && Number.isInteger(c.endMs)))

  const noop = retimeWord(words, id, duration, { startMs: self.startMs })!
  check('a no-op edit moves nothing but the word itself', noop.length === 1, JSON.stringify(noop))
}

console.log('\nthe order invariant the ripple exists for')
{
  const unclamped = words.map((word, index) =>
    index === 5 ? { ...word, startMs: 11_000, endMs: 11_500 } : word,
  )
  const brokenBlocks = deriveBlocks(unclamped, { mergeShorterThanMs: 0 })
  check('WITHOUT the ripple, an out-of-order word breaks the binary search’s precondition',
    !blocksAreSearchable(brokenBlocks),
    brokenBlocks.map((block) => `${block.startMs}-${block.endMs}`).join(' '))

  // Every edge of every word, pushed to every extreme, always leaves a sorted project.
  let stressed = words
  for (const word of words) {
    for (const edge of ['startMs', 'endMs'] as const) {
      for (const target of [0, 500, duration - 500, duration]) {
        const next = retimeWord(stressed, word.id, duration, { [edge]: target })
        if (next === null) continue // refused; the project must be untouched
        stressed = apply(stressed, next)
      }
    }
  }
  check('after rippling every edge to every extreme, words are still in playback order', sorted(stressed))
  check('…and every word still has a visible span',
    stressed.every((word) => word.endMs - word.startMs >= MIN_WORD_MS))
  check('…and none escaped the video',
    stressed.every((word) => word.startMs >= 0 && word.endMs <= duration))
  const blocks = deriveBlocks(stressed, { mergeShorterThanMs: 0 })
  check('…so the blocks the playhead binary-searches are still in order', blocksAreSearchable(blocks))
  check('…and the stressed project still passes the shared schema',
    Project.safeParse({ ...project, words: stressed }).success)
}

console.log('\ncleanWordText')
{
  check('an ordinary correction passes through', cleanWordText('bekaar').ok)
  check('surrounding whitespace is trimmed',
    cleanWordText('  bhai \n').ok && (cleanWordText('  bhai \n') as { text: string }).text === 'bhai')
  check('empty is refused', !cleanWordText('').ok)
  check('whitespace-only is refused', !cleanWordText('   ').ok)

  const spaced = cleanWordText('do  shabd')
  check('a typed space is collapsed, not split', spaced.ok && (spaced as { text: string }).text === 'do shabd')
  check('…and says splitting is not available', spaced.ok && Boolean((spaced as { note?: string }).note))

  const devanagari = cleanWordText('नमस्ते')
  check('Devanagari survives untouched', devanagari.ok && (devanagari as { text: string }).text === 'नमस्ते')

  const long = 'a'.repeat(400)
  check('a very long word is stored as typed — layout is the renderer’s problem, not a data rule',
    cleanWordText(long).ok && (cleanWordText(long) as { text: string }).text === long)

  const injection = '<img src=x onerror=alert(1)>'
  check('markup is neither stripped nor executed — it is data, rendered as a text node',
    cleanWordText(injection).ok && (cleanWordText(injection) as { text: string }).text === injection)
}

console.log('\nthe write path: a hand edit is ONE undo step and survives the agent’s reducer')
{
  const id = words[5].id
  let state = createInitialState(project)
  const edited = retimeWord(words, id, duration, { startMs: words[5].startMs + 40 })!.find((c) => c.id === id)!

  state = projectReducer(state, { type: 'UPDATE_WORD', wordId: id, patch: { text: 'theek' } })
  state = projectReducer(state, { type: 'UPDATE_WORD', wordId: id, patch: { startMs: edited.startMs, endMs: edited.endMs } })
  check('two field edits are two commits', state.past.length === 2)

  const after = state.present.words.find((word) => word.id === id)!
  check('the text edit landed', after.text === 'theek')
  check('the timing edit landed', after.startMs === edited.startMs && after.endMs === edited.endMs)
  check('the word’s signals are untouched by either edit',
    JSON.stringify(after.signals) === JSON.stringify(words[5].signals))

  // No new reducer action was introduced, so an agent turn and a hand edit go down one path.
  const viaAgent = projectReducer(createInitialState(project), {
    type: 'APPLY_AGENT_PATCHES',
    patches: [
      { type: 'UPDATE_WORD', wordId: id, patch: { text: 'theek' } },
      { type: 'UPDATE_WORD', wordId: id, patch: { startMs: edited.startMs, endMs: edited.endMs } },
    ],
  })
  const agentWord = viaAgent.present.words.find((word) => word.id === id)!
  check('the same two patches through APPLY_AGENT_PATCHES give the identical word',
    JSON.stringify(agentWord) === JSON.stringify(after))
  check('…but as ONE undo step, because one utterance is one step', viaAgent.past.length === 1)
}

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('All word-edit checks passed.')
