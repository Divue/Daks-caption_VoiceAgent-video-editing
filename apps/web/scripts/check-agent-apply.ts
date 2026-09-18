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
import { Project, deriveBlocks } from '@captions/shared'
import { applyAgentPatch, createInitialState, projectReducer } from '../src/state/project-reducer'
import type { AgentPatch, ProjectHistoryState } from '../src/state/project-reducer'
import { summarisePatches, summariseTurn } from '../src/lib/agent-summary'
import { DEFAULT_CHIPS, DEMO_PROMPTS, isRefusalPrompt } from '../src/lib/demo-prompts'
import { formatTimecode } from '../src/lib/format'

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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
