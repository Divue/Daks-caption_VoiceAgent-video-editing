/**
 * Checks the agent-apply path: a whole agent turn must be ONE undo step, must fold heterogeneous
 * patches correctly, and must be dropped entirely rather than applied halfway when invalid.
 *
 * This exists because every one of those failures is silent:
 *   - N dispatches instead of one batch still LOOKS right; it only shows up as the user pressing
 *     Ctrl+Z four times to take back one sentence they said;
 *   - an explicit `null` arriving in a patch (Pydantic serialises untouched optionals as null
 *     unless `response_model_exclude_none=True` holds) blanks a real word field through the
 *     reducer's `{...word, ...patch}` spread, and the caption just quietly loses its text;
 *   - a batch that fails validation is rejected by commit() with only a console.error.
 *
 * Run: `npx jiti apps/web/scripts/check-agent-apply.ts` from the repo root.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRESETS, Project, deriveBlocks } from '@captions/shared'
import type { Preset } from '@captions/shared'
import { applyAgentPatch, createInitialState, projectReducer } from '../src/state/project-reducer'
import type { AgentPatch, ProjectHistoryState } from '../src/state/project-reducer'
import { summarisePatches, summariseTurn } from '../src/lib/agent-summary'
import {
  FILLER,
  MIN_VOICE_CHARS,
  STOP_LISTENING,
  UNDO_PHRASES,
  describeTransport,
  mergeUtterances,
  parseTransportIntent,
  resolveTransport,
} from '../src/lib/voice-intents'
import { DEFAULT_CHIPS, DEMO_PROMPTS, isRefusalPrompt } from '../src/lib/demo-prompts'
import { formatTimecode } from '../src/lib/format'
import { mediaKey } from '../src/lib/media-key'
import {
  INITIAL_EXPORT,
  exportPercent,
  exportReducer,
  exportStatusText,
  isLinkStale,
} from '../src/lib/export'
import type { ExportEvent, ExportState } from '../src/lib/export'
import type { RenderStatus } from '../src/lib/api'
import { resolvePreset } from '../src/lib/resolve-preset'
import type { PresetOverride } from '../src/lib/resolve-preset'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const fixturePath = join(import.meta.dirname, '../../../packages/shared/fixtures/demo-project.json')
const fixture = Project.parse(JSON.parse(readFileSync(fixturePath, 'utf8')))

function fresh(): ProjectHistoryState {
  return createInitialState(fixture)
}
const ids = fixture.words.slice(0, 4).map((w) => w.id)

console.log('\nagent apply — one turn, one undo step')
{
  const patches: AgentPatch[] = ids.map((wordId) => ({
    type: 'UPDATE_WORD' as const,
    wordId,
    patch: { emotion: 'angry' as const },
  }))
  const next = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches })

  check('four word patches produce ONE history entry', next.past.length === 1, `got ${next.past.length}`)
  check(
    'every targeted word changed',
    ids.every((id) => next.present.words.find((w) => w.id === id)?.emotion === 'angry'),
  )
  check(
    'untargeted words are untouched',
    next.present.words.filter((w) => !ids.includes(w.id)).every((w) => w.emotion !== 'angry') ||
      fixture.words.some((w) => w.emotion === 'angry'),
  )

  const undone = projectReducer(next, { type: 'UNDO' })
  check('ONE undo restores the whole turn', JSON.stringify(undone.present) === JSON.stringify(fixture))
  check('redo is available after undo', undone.future.length === 1)
}

console.log('\nagent apply — heterogeneous batch')
{
  const patches: AgentPatch[] = [
    { type: 'UPDATE_WORD', wordId: ids[0], patch: { emphasis: true } },
    { type: 'SET_PRESET', presetId: 'chamak' },
    { type: 'SET_SETTINGS', settings: { emotionLayer: false } },
  ]
  const next = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches })

  check('mixed word/preset/settings patches are one commit', next.past.length === 1)
  check('word patch applied', next.present.words.find((w) => w.id === ids[0])?.emphasis === true)
  check('preset applied', next.present.presetId === 'chamak')
  check('settings merged, not replaced', next.present.settings.emotionLayer === false && 'emojis' in next.present.settings)
}

console.log('\nagent apply — the null hazard')
{
  // If `response_model_exclude_none` is ever lost server-side, this is the shape that arrives.
  const hostile = { emphasis: true, text: null } as unknown as AgentPatch extends { patch: infer P } ? P : never
  const patches: AgentPatch[] = [{ type: 'UPDATE_WORD', wordId: ids[0], patch: hostile }]
  const next = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches })

  // Project.safeParse must reject `text: null`, so the WHOLE batch is dropped — never half of it.
  check('a null on a required field is rejected, not written', next.past.length === 0)
  check('state is left exactly as it was', next.present === fresh().present || JSON.stringify(next.present) === JSON.stringify(fixture))
}

console.log('\nagent apply — commit-or-nothing')
{
  const patches: AgentPatch[] = [
    { type: 'UPDATE_WORD', wordId: ids[0], patch: { emphasis: true } },
    { type: 'UPDATE_WORD', wordId: ids[1], patch: { stretch: -5 } }, // stretch must be >= 1
  ]
  const next = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches })
  check('an invalid patch drops the entire batch', next.past.length === 0)
  check('the valid patch beside it is NOT applied', next.present.words.find((w) => w.id === ids[0])?.emphasis === fixture.words.find((w) => w.id === ids[0])?.emphasis)
}

console.log('\nagent apply — an unknown word id is a no-op, not a crash')
{
  const patches: AgentPatch[] = [{ type: 'UPDATE_WORD', wordId: 'does-not-exist', patch: { emphasis: true } }]
  const next = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches })
  check('project still validates', Project.safeParse(next.present).success)
  check('nothing changed', JSON.stringify(next.present) === JSON.stringify(fixture))
}

console.log('\nagent apply — empty batch')
{
  const state = fresh()
  const next = projectReducer(state, { type: 'APPLY_AGENT_PATCHES', patches: [] })
  check('an empty batch costs no undo step', next === state)
}

console.log('\nagent apply — the pure fold matches the reducer')
{
  const patches: AgentPatch[] = [
    { type: 'UPDATE_WORD', wordId: ids[0], patch: { emphasis: true } },
    { type: 'SET_PRESET', presetId: 'nazm' },
  ]
  const folded = patches.reduce(applyAgentPatch, fixture)
  const viaReducer = projectReducer(fresh(), { type: 'APPLY_AGENT_PATCHES', patches }).present
  check('applyAgentPatch and the reducer agree', JSON.stringify(folded) === JSON.stringify(viaReducer))
}

console.log('\nagent apply — preset overrides')
{
  const set = projectReducer(fresh(), {
    type: 'APPLY_AGENT_PATCHES',
    patches: [{ type: 'SET_PRESET_OVERRIDE', override: { wordsPerLine: 3 } }],
  })
  check('a preset override is stored on the project', set.present.presetOverride?.wordsPerLine === 3)
  check('it is one undo step', set.past.length === 1)

  const merged = projectReducer(set, {
    type: 'APPLY_AGENT_PATCHES',
    patches: [{ type: 'SET_PRESET_OVERRIDE', override: { emphasisScale: 1.4 } }],
  })
  check(
    'a second override MERGES key by key rather than replacing',
    merged.present.presetOverride?.wordsPerLine === 3 && merged.present.presetOverride?.emphasisScale === 1.4,
  )

  // An explicit null is how a key is removed — `undefined` is dropped by JSON.stringify and the
  // removal would never leave the browser (the bug audit 15 §4 records for style overrides).
  const cleared = projectReducer(merged, {
    type: 'APPLY_AGENT_PATCHES',
    patches: [{ type: 'SET_PRESET_OVERRIDE', override: { wordsPerLine: null } as never }],
  })
  check('an explicit null removes just that key', cleared.present.presetOverride?.wordsPerLine === undefined)
  check('the other keys survive', cleared.present.presetOverride?.emphasisScale === 1.4)

  const all = projectReducer(cleared, {
    type: 'APPLY_AGENT_PATCHES',
    patches: [{ type: 'SET_PRESET_OVERRIDE', override: null }],
  })
  check('a whole-object null clears every override', all.present.presetOverride === undefined)
  check('the project still validates with no override key at all', Project.safeParse(all.present).success)
}

console.log('\nagent summary — a change, not JSON')
{
  const patches: AgentPatch[] = ids.map((wordId) => ({
    type: 'UPDATE_WORD' as const,
    wordId,
    patch: { style: { color: '#ff2d55' } },
  }))
  const lines = summarisePatches(patches, fixture)
  check('identical changes collapse to one line', lines.length === 1, JSON.stringify(lines))
  check('it counts the words', lines[0]?.includes('4 words'), lines[0])
  check('it names the change in words', lines[0]?.includes('colour #ff2d55'), lines[0])

  const single = summarisePatches(
    [{ type: 'UPDATE_WORD', wordId: ids[0], patch: { emphasis: true } }],
    fixture,
  )
  const text = fixture.words.find((w) => w.id === ids[0])?.text ?? ''
  check('a single word is quoted by its text', single[0]?.includes(text), single[0])
  check('turn summary counts words', summariseTurn(patches) === '4 words changed', summariseTurn(patches))

  const preset = summarisePatches([{ type: 'SET_PRESET', presetId: 'chamak' }], fixture)
  check('preset renders by name, not id', preset[0] === 'Preset → Chamak', preset[0])

  const settings = summarisePatches([{ type: 'SET_SETTINGS', settings: { emotionLayer: false } }], fixture)
  check('settings render in plain words', settings[0] === 'Emotion colours → off', settings[0])

  const override = summarisePatches([{ type: 'SET_PRESET_OVERRIDE', override: { wordsPerLine: 3 } }], fixture)
  check('a preset override reads as words per line', override[0] === '3 words per line', override[0])

  const cleared = summarisePatches(
    [{ type: 'UPDATE_WORD', wordId: ids[0], patch: { style: { color: null } as never } }],
    fixture,
  )
  check('a cleared style key says cleared', cleared[0]?.includes('cleared'), cleared[0])
}

console.log('\ndemo prompts — the tested set cannot drift')
{
  // `lib/demo-prompts.ts` is a hand-copy of `services/api/scripts/agent_demo.py`, and the whole
  // value of it is that the strings are the ones that were actually run against Bedrock. Nothing
  // here can prove a string still matches the Python (different language, different process), but
  // it can stop the half-edit: a dropped prompt, a duplicate left behind by a copy-paste, an empty
  // command, or a refusal that quietly became a suggestion.
  check('eleven prompts', DEMO_PROMPTS.length === 11, `got ${DEMO_PROMPTS.length}`)
  check(
    'numbered 1..11 in order',
    DEMO_PROMPTS.every((p, i) => p.n === i + 1),
    DEMO_PROMPTS.map((p) => p.n).join(','),
  )
  check(
    'every command is non-empty',
    DEMO_PROMPTS.every((p) => p.command.trim().length > 0),
  )
  check(
    'every title and reason is non-empty',
    DEMO_PROMPTS.every((p) => p.title.trim().length > 0 && p.why.trim().length > 0),
  )
  check(
    'commands are unique',
    new Set(DEMO_PROMPTS.map((p) => p.command)).size === DEMO_PROMPTS.length,
  )
  check('titles are unique', new Set(DEMO_PROMPTS.map((p) => p.title)).size === DEMO_PROMPTS.length)
  check(
    'no command has leading/trailing whitespace',
    DEMO_PROMPTS.every((p) => p.command === p.command.trim()),
  )

  const refusals = DEMO_PROMPTS.filter(isRefusalPrompt)
  check('exactly one prompt is tagged as the refusal', refusals.length === 1, `got ${refusals.length}`)
  check('the refusal is prompt 11', refusals[0]?.n === 11, `got ${refusals[0]?.n}`)
  check(
    'every prompt carries at least one tag',
    DEMO_PROMPTS.every((p) => p.tags.length > 0),
  )

  // The inline chips are the ones shown without a click, so the refusal must not be among them.
  check('the default chips are real prompts', DEFAULT_CHIPS.every((c) => DEMO_PROMPTS.includes(c)))
  check('there are 1-4 default chips', DEFAULT_CHIPS.length >= 1 && DEFAULT_CHIPS.length <= 4, `got ${DEFAULT_CHIPS.length}`)
  check('no default chip is the refusal', !DEFAULT_CHIPS.some(isRefusalPrompt))
}

console.log('\ncaption block timings — what the transcript rows print')
{
  // The caption list shows each block's start and end with `formatTimecode(ms, 100)`. That
  // branch of the formatter had no coverage, and a wrong one is the kind of bug you only catch
  // by reading a number that was never quite right: tenths silently rounding, or a minute
  // printing as 72 seconds.
  const t = (ms: number) => formatTimecode(ms, 100)
  check('zero prints a full time, not an empty one', t(0) === '0:00.0', t(0))
  check('sub-second keeps its tenth', t(250) === '0:00.2', t(250))
  check('a tenth is truncated, never rounded up past its second', t(1950) === '0:01.9', t(1950))
  check('the last tenth of a second stays in that second', t(999) === '0:00.9', t(999))
  check('over a minute rolls into minutes', t(72_300) === '1:12.3', t(72_300))
  check('an exact minute is 1:00.0, not 0:60.0', t(60_000) === '1:00.0', t(60_000))
  check('a negative time clamps to zero', t(-5) === '0:00.0', t(-5))

  // The row for a `single` word claims to be showing THAT WORD's own start and end. It gets
  // away with reading them off the block only because rule 4 fences a single word into a block
  // of exactly one and mergeShortBlocks never folds it away. If that ever stops being true the
  // transcript starts attributing a neighbour's time to a solo word, so assert it here.
  const words = fixture.words.map((word, index) => (index === 3 ? { ...word, single: true } : word))
  const blocks = deriveBlocks(words)
  const soloBlocks = blocks.filter((block) => block.isSingle)
  check('marking a word single yields exactly one single block', soloBlocks.length === 1, `got ${soloBlocks.length}`)
  const solo = soloBlocks[0]
  check('the single block holds only that word', solo?.wordIds.length === 1 && solo.wordIds[0] === words[3].id)
  check(
    "the single block's times ARE the word's own times",
    solo?.startMs === words[3].startMs && solo?.endMs === words[3].endMs,
    `${solo?.startMs}-${solo?.endMs} vs ${words[3].startMs}-${words[3].endMs}`,
  )
}

console.log('\nvoice — what never reaches the agent')
{
  // A live mic hears things that were never aimed at us. Each one that gets through is a
  // Bedrock round trip, a spinner, and a history entry saying "I'm not sure what you meant".
  const junk = ['uh', 'ummm', 'hmm', 'okay', 'so', 'yeah', 'a', 'I']
  check('filler is recognised as filler', junk.every((w) => FILLER.test(w)), junk.filter((w) => !FILLER.test(w)).join(','))

  const real = ['make it red', 'stop making things red', 'bigger', 'put a fire emoji on bekaar']
  check('real commands are NOT filtered', real.every((w) => !FILLER.test(w)), real.filter((w) => FILLER.test(w)).join(','))

  check('a command shorter than the minimum is dropped', 'no'.length < MIN_VOICE_CHARS)
  check('a short real command survives', 'red'.length >= MIN_VOICE_CHARS)

  const stops = ["stop listening", "mic off", "that's all", "I'm done"]
  check('stop phrases are recognised', stops.every((w) => STOP_LISTENING.test(w)), stops.filter((w) => !STOP_LISTENING.test(w)).join(','))
  check('"stop making things red" is NOT a stop phrase', !STOP_LISTENING.test('stop making things red'))

  const undos = ['undo', 'undo that', 'take that back', 'never mind']
  check('undo phrases are recognised locally', undos.every((w) => UNDO_PHRASES.test(w)), undos.filter((w) => !UNDO_PHRASES.test(w)).join(','))
  check('"undo the red on that word" is NOT a bare undo', !UNDO_PHRASES.test('undo the red on that word'))
}

console.log('\nvoice — a pause is not the end of an instruction')
{
  const merged = mergeUtterances('Hey, increase the size of the white font.', 'From 10 s marker to 12 s.')
  check(
    'the reported case keeps BOTH halves',
    merged.includes('increase the size of the white font') && merged.includes('From 10 s marker to 12 s'),
    merged,
  )
  check('the pause-period between the halves is dropped', !merged.includes('font. From'), merged)

  check('a repeated final is not doubled', mergeUtterances('make it red', 'Make it red.') === 'make it red')
  check(
    'an engine re-sending the whole utterance, extended, replaces rather than doubles',
    mergeUtterances('make it red', 'make it red and bigger') === 'make it red and bigger',
  )
  check(
    'a question mark said on purpose survives',
    mergeUtterances('can you make it red?', 'and bigger').startsWith('can you make it red?'),
  )
  check('an empty first half yields the second', mergeUtterances('', 'bigger') === 'bigger')
  check('an empty second half yields the first', mergeUtterances('make it red', '  ') === 'make it red')
  check(
    'three fragments accumulate in order',
    mergeUtterances(mergeUtterances('make the word pagal', 'blue'), 'and shake it') === 'make the word pagal blue and shake it',
  )
}

console.log('\nvoice — the video obeys "play", "pause", "go to 5 seconds" without a Bedrock round trip')
{
  const t = (text: string) => JSON.stringify(parseTransportIntent(text))
  const is = (text: string, expected: object) => t(text) === JSON.stringify(expected)

  const plays = ['play', 'Play the video.', 'please play it', 'resume', 'continue playing', 'start the video', 'can you play the video', 'video chalao']
  check('play phrases', plays.every((w) => is(w, { type: 'play' })), plays.filter((w) => !is(w, { type: 'play' })).map((w) => `${w}=>${t(w)}`).join('; '))

  const pauses = ['pause', 'Pause the video', 'pause it', 'stop the video', 'hold on', 'freeze', 'ruko', 'video rok do']
  check('pause phrases', pauses.every((w) => is(w, { type: 'pause' })), pauses.filter((w) => !is(w, { type: 'pause' })).map((w) => `${w}=>${t(w)}`).join('; '))

  // Sarvam heard a spoken "pause" as "Pass" — recogniser errors that would otherwise leave the video playing.
  check('a recogniser\'s "Pass" for "pause" still pauses', is('Pass.', { type: 'pause' }) && is('pass', { type: 'pause' }) && is('paws', { type: 'pause' }))
  check('"pass" inside a real sentence is NOT a pause', parseTransportIntent('pass the emphasis to the next word') === null && parseTransportIntent('make it pass') === null)
  // Sarvam also returned "House" for a spoken "pause". Only while the video is playing is that read as a pause.
  const playing = { playing: true }
  check('"House" while PLAYING is read as a mis-heard pause', JSON.stringify(parseTransportIntent('House.', playing)) === JSON.stringify({ type: 'pause' }) && JSON.stringify(parseTransportIntent('hours', playing)) === JSON.stringify({ type: 'pause' }))
  check('"House" while PAUSED is left alone, for the agent', parseTransportIntent('House.', { playing: false }) === null && parseTransportIntent('House.') === null)
  check('the playing-only aliases never fire inside a longer sentence', ['house of cards', 'make the house red', 'force it bigger'].every((w) => parseTransportIntent(w, playing) === null))
  check('edit words are not stolen while playing', ['bigger', 'red', 'undo', 'yellow'].every((w) => parseTransportIntent(w, playing) === null))
  check('real transport words keep their own meaning while playing', parseTransportIntent('faster', playing)?.type === 'rateStep' && parseTransportIntent('mute', playing)?.type === 'mute' && parseTransportIntent('restart', playing)?.type === 'restart')

  const restarts = ['restart', 'start over', 'play from the beginning', 'replay', 'go to the start', 'play it again', 'rewind to the beginning']
  check('restart phrases', restarts.every((w) => is(w, { type: 'restart' })), restarts.filter((w) => !is(w, { type: 'restart' })).map((w) => `${w}=>${t(w)}`).join('; '))

  const seeks: Array<[string, number]> = [
    ['go to 5 seconds', 5000],
    ['jump to the 5 second mark', 5000],
    ['go to five seconds', 5000],
    ['go to twenty five seconds', 25000],
    ['seek to 1:30', 90000],
    ['go to two minutes', 120000],
    ['take me to 12 seconds', 12000],
  ]
  check('absolute seeks', seeks.every(([w, ms]) => is(w, { type: 'seek', ms })), seeks.filter(([w, ms]) => !is(w, { type: 'seek', ms })).map(([w]) => `${w}=>${t(w)}`).join('; '))

  const skips: Array<[string, number]> = [
    ['skip 10 seconds', 10000],
    ['skip ahead 10 seconds', 10000],
    ['forward 15 seconds', 15000],
    ['go back 5 seconds', -5000],
    ['skip back ten seconds', -10000],
    ['rewind 3 seconds', -3000],
    ['back 2 seconds', -2000],
  ]
  check('relative skips', skips.every(([w, ms]) => is(w, { type: 'skip', ms })), skips.filter(([w, ms]) => !is(w, { type: 'skip', ms })).map(([w]) => `${w}=>${t(w)}`).join('; '))

  check('faster steps the speed up', is('faster', { type: 'rateStep', direction: 1 }) && is('speed up', { type: 'rateStep', direction: 1 }))
  check('slower steps the speed down', is('slower', { type: 'rateStep', direction: -1 }) && is('slow down', { type: 'rateStep', direction: -1 }))
  check(
    'named speeds',
    is('normal speed', { type: 'rate', rate: 1 }) && is('double speed', { type: 'rate', rate: 2 }) && is('half speed', { type: 'rate', rate: 0.5 }) && is('play at 1.5x', { type: 'rate', rate: 1.5 }),
    ['normal speed', 'double speed', 'half speed', 'play at 1.5x'].map((w) => `${w}=>${t(w)}`).join('; '),
  )
  check(
    'mute and unmute',
    is('mute', { type: 'mute' }) && is('sound off', { type: 'mute' }) && is('unmute', { type: 'unmute' }) && is('sound on', { type: 'unmute' }),
  )

  // The dangerous half: a transport parser that is too greedy would swallow real edit commands.
  const notTransport = [
    'make that line angry',
    'play the word bekaar in red',
    'put a fire emoji on the word play',
    'stop making things red',
    'start making it bigger',
    'pause the emphasis on that word',
    'skip the first word',
    'go to the third line',
    'make the video bigger',
    'stop listening',
    'stop the mic',
    'undo',
    'faster captions please',
  ]
  check('real edit commands are NOT read as playback', notTransport.every((w) => parseTransportIntent(w) === null), notTransport.filter((w) => parseTransportIntent(w) !== null).map((w) => `${w}=>${t(w)}`).join('; '))

  check('a transport intent has a plain-English description', describeTransport({ type: 'seek', ms: 5000 }, 21170) === 'Jumped to 0:05' && describeTransport({ type: 'play' }, 1000) === 'Playing')

  // The arithmetic a user can SEE go wrong: landing past the end, before the start, or off the speed list.
  const ctx = { timeMs: 8000, durationMs: 21170, rate: 1 }
  const seekTo = (i: Parameters<typeof resolveTransport>[0], c = ctx) => resolveTransport(i, c).action
  check('a skip past the end lands on the end, not beyond it', JSON.stringify(seekTo({ type: 'skip', ms: 60000 })) === JSON.stringify({ kind: 'seek', ms: 21170 }))
  check('a skip back past the start lands on 0, not negative', JSON.stringify(seekTo({ type: 'skip', ms: -60000 })) === JSON.stringify({ kind: 'seek', ms: 0 }))
  check('skip is relative to where the playhead is now', JSON.stringify(seekTo({ type: 'skip', ms: 5000 })) === JSON.stringify({ kind: 'seek', ms: 13000 }))
  check('"go to 90 seconds" on a 21 s clip clamps to the end and says so', JSON.stringify(seekTo({ type: 'seek', ms: 90000 })) === JSON.stringify({ kind: 'seek', ms: 21170 }) && resolveTransport({ type: 'seek', ms: 90000 }, ctx).label === 'Jumped to the end')
  check('"go to the end" reaches the end', JSON.stringify(seekTo(parseTransportIntent('go to the end')!)) === JSON.stringify({ kind: 'seek', ms: 21170 }))
  check('restart seeks to 0 AND keeps playing', JSON.stringify(seekTo({ type: 'restart' })) === JSON.stringify({ kind: 'seek', ms: 0, thenPlay: true }))
  check('faster steps 1x -> 1.5x', JSON.stringify(seekTo({ type: 'rateStep', direction: 1 })) === JSON.stringify({ kind: 'rate', rate: 1.5 }))
  check('faster at the top speed does nothing and says why', resolveTransport({ type: 'rateStep', direction: 1 }, { ...ctx, rate: 2 }).action.kind === 'none' && resolveTransport({ type: 'rateStep', direction: 1 }, { ...ctx, rate: 2 }).label === 'Already at the fastest speed')
  check('slower at the bottom speed does nothing and says why', resolveTransport({ type: 'rateStep', direction: -1 }, { ...ctx, rate: 0.5 }).action.kind === 'none')
  check('a speed that is not on the list still steps to a neighbour', JSON.stringify(seekTo({ type: 'rateStep', direction: 1 }, { ...ctx, rate: 1.25 })) === JSON.stringify({ kind: 'rate', rate: 1.5 }) || JSON.stringify(seekTo({ type: 'rateStep', direction: 1 }, { ...ctx, rate: 1.25 })) === JSON.stringify({ kind: 'rate', rate: 2 }))
  check('an absurd speed is clamped', JSON.stringify(seekTo({ type: 'rate', rate: 50 })) === JSON.stringify({ kind: 'rate', rate: 4 }))
}

console.log('\nexport — the exported video applies a preset override exactly as the preview does')
{
  // The merge as it was written INLINE in preset-override-context.tsx before it was extracted, kept
  // here verbatim as the reference. If resolvePreset ever disagrees with it, the export no longer
  // matches what the user saw.
  const reference = (basePreset: Preset, merged: PresetOverride): Preset => ({
    ...basePreset,
    ...merged,
    base: merged.baseFontSize ? { ...basePreset.base, fontSize: merged.baseFontSize } : basePreset.base,
    emphasis: { ...basePreset.emphasis, ...merged.emphasis },
    emotion: merged.emotion ?? basePreset.emotion,
  })
  const overrides: PresetOverride[] = [
    {},
    { wordsPerLine: 2 },
    { baseFontSize: 64 },
    { emphasisScale: 2.5 },
    { emphasis: { color: '#ff2d55' } },
    { emphasis: { color: '#00ff88' }, emphasisScale: 1.4, wordsPerLine: 4, baseFontSize: 40 },
    { emotion: { angry: { style: { color: '#f00' } } } },
  ]
  const ids = Object.keys(PRESETS) as Array<keyof typeof PRESETS>
  let same = 0
  const drift: string[] = []
  for (const id of ids) {
    for (const [i, o] of overrides.entries()) {
      if (JSON.stringify(resolvePreset(PRESETS[id], o)) === JSON.stringify(reference(PRESETS[id], o))) same += 1
      else drift.push(`${id}#${i}`)
    }
  }
  check(`resolvePreset equals the original inline merge for all ${ids.length * overrides.length} preset x override pairs`, drift.length === 0 && same === ids.length * overrides.length, drift.join(','))

  const chamak = PRESETS.chamak
  check('a base-size override lands inside `base`, not on the preset root', resolvePreset(chamak, { baseFontSize: 64 }).base.fontSize === 64 && resolvePreset(chamak, { baseFontSize: 64 }).base.color === chamak.base.color)
  check('an emphasis override changes one key and keeps the rest of the emphasis face', resolvePreset(chamak, { emphasis: { color: '#123456' } }).emphasis?.color === '#123456' && resolvePreset(chamak, { emphasis: { color: '#123456' } }).emphasis?.fontFamily === chamak.emphasis?.fontFamily)
  check('no override leaves the preset untouched', JSON.stringify(resolvePreset(chamak, {})) === JSON.stringify(chamak))
  check('resolvePreset never mutates its inputs', (() => { const before = JSON.stringify(chamak); resolvePreset(chamak, { emphasis: { color: '#000' }, baseFontSize: 10 }); return JSON.stringify(chamak) === before })())
}

console.log('\nexport — the flow: starting, rendering, done, and every way it can go wrong')
{
  const st = (state: RenderStatus['state'], progress = 0, extra: Partial<RenderStatus> = {}): RenderStatus => ({
    renderId: 'r1', state, progress, outputUrl: null, error: null, ...extra,
  })
  const run = (events: ExportEvent[], from: ExportState = INITIAL_EXPORT) => events.reduce(exportReducer, from)

  let s = run([{ type: 'start' }])
  check('start moves idle -> starting', s.phase === 'starting')
  s = run([{ type: 'started', renderId: 'r1' }], s)
  check('once started it is rendering and still queued', s.phase === 'rendering' && s.queued && s.progress === 0)
  s = run([{ type: 'status', status: st('rendering', 0.4), now: 1 }], s)
  check('a rendering status advances progress and clears queued', s.phase === 'rendering' && s.progress === 0.4 && !s.queued)
  s = run([{ type: 'status', status: st('rendering', 0.25), now: 2 }], s)
  check('progress never goes backwards', s.phase === 'rendering' && s.progress === 0.4)
  s = run([{ type: 'status', status: st('done', 1, { outputUrl: 'https://x/y.mp4' }), now: 99 }], s)
  check('done carries the link and when it became ready', s.phase === 'done' && s.url === 'https://x/y.mp4' && s.readyAt === 99)

  check('a second click while starting is ignored', run([{ type: 'start' }], { phase: 'starting' }).phase === 'starting')
  const busy: ExportState = { phase: 'rendering', renderId: 'r1', progress: 0.3, queued: false, failedPolls: 0 }
  check('a second click while rendering does not start another render', run([{ type: 'start' }], busy) === busy)
  check('a new export can start after done', run([{ type: 'start' }], { phase: 'done', renderId: 'r', url: 'u', readyAt: 0 }).phase === 'starting')
  check('a new export can start after a failure', run([{ type: 'start' }], { phase: 'failed', message: 'x' }).phase === 'starting')

  check('a late status after done is ignored', run([{ type: 'status', status: st('rendering', 0.5), now: 1 }], { phase: 'done', renderId: 'r', url: 'u', readyAt: 0 }).phase === 'done')
  check('a status while idle is ignored', run([{ type: 'status', status: st('rendering', 0.5), now: 1 }]).phase === 'idle')
  check('"done" with no link is a failure, not a success with nothing to click', run([{ type: 'status', status: st('done', 1), now: 1 }], busy).phase === 'failed')
  const failed = run([{ type: 'status', status: st('failed', 0.3, { error: 'Render took longer than 15 minutes' }), now: 1 }], busy)
  check('a failed render shows the server\'s own reason', failed.phase === 'failed' && failed.message.includes('15 minutes'))
  const failedBare = run([{ type: 'status', status: st('failed'), now: 1 }], busy)
  check('a failed render without a reason still says something useful', failedBare.phase === 'failed' && failedBare.message.length > 10)

  let p = run([{ type: 'pollFailed', message: 'net' }, { type: 'pollFailed', message: 'net' }], busy)
  check('two failed polls in a row are tolerated', p.phase === 'rendering' && p.failedPolls === 2)
  p = run([{ type: 'status', status: st('rendering', 0.5), now: 1 }], p)
  check('a good poll resets the failure count', p.phase === 'rendering' && p.failedPolls === 0)
  check('three failed polls in a row fail the export', run([{ type: 'pollFailed', message: 'net' }, { type: 'pollFailed', message: 'net' }, { type: 'pollFailed', message: 'gone' }], busy).phase === 'failed')

  check('an error starting the export fails it with the reason', run([{ type: 'fail', message: 'The render server isn\'t running.' }], { phase: 'starting' }).phase === 'failed')
  check('reset returns to idle from anywhere', run([{ type: 'reset' }], failed).phase === 'idle')

  check('the percentage is never 100 until the export is done', exportPercent(1) === 99 && exportPercent(0.996) === 99)
  check('the percentage is clamped and survives garbage', exportPercent(-1) === 0 && exportPercent(Number.NaN) === 0 && exportPercent(0.42) === 42)
  check('status text: queued vs rendering vs done', exportStatusText(run([{ type: 'started', renderId: 'r' }], { phase: 'starting' })) === 'Waiting for the renderer…' && exportStatusText({ ...busy, progress: 0.42 }) === 'Rendering… 42%' && exportStatusText({ phase: 'done', renderId: 'r', url: 'u', readyAt: 0 }) === 'Your video is ready')
  check('a link is stale only after 45 minutes', !isLinkStale(0, 44 * 60_000) && isLinkStale(0, 45 * 60_000))
}

console.log('\nplayer — a re-minted presigned link is the same file, so it must not reload the video')
{
  const a = 'https://bucket.s3.ap-south-1.amazonaws.com/p4/projects/abc/source.mp4?X-Amz-Signature=111&X-Amz-Date=20260919T010000Z&X-Amz-Expires=3600'
  const b = 'https://bucket.s3.ap-south-1.amazonaws.com/p4/projects/abc/source.mp4?X-Amz-Signature=999&X-Amz-Date=20260919T020000Z&X-Amz-Expires=3600'
  check('the same object with a new signature has the same key', mediaKey(a) === mediaKey(b) && mediaKey(a) !== null)
  check('a different object has a different key', mediaKey(a) !== mediaKey(a.replace('/abc/', '/xyz/')))
  check('a different bucket has a different key', mediaKey(a) !== mediaKey(a.replace('bucket.', 'other.')))
  check('no video has no key', mediaKey(null) === null && mediaKey('') === null)
  check('a local preview URL keeps its own identity', mediaKey('blob:http://localhost:5173/aaa') !== mediaKey('blob:http://localhost:5173/bbb'))
  check('an unparseable string still yields a stable key', mediaKey('not a url') === 'not a url')
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
