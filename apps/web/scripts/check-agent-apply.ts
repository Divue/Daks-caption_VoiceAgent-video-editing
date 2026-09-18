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
import { Project } from '@captions/shared'
import { applyAgentPatch, createInitialState, projectReducer } from '../src/state/project-reducer'
import type { AgentPatch, ProjectHistoryState } from '../src/state/project-reducer'
import { summarisePatches, summariseTurn } from '../src/lib/agent-summary'

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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
