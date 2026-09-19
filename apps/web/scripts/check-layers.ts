// Media layers: the arithmetic every surface shares (editor preview, Remotion export, agent tools).
// Plain check() script, like its neighbours:  npm run check:layers
import { LayerItem, Project } from '@captions/shared'
import fixture from '../../../packages/shared/fixtures/demo-project.json'
import {
  activeLayerItems,
  layerBox,
  moveItemTo,
  newLayerItem,
  nextLayerId,
  sourceTimeMs,
  splitItem,
  trimItemEnd,
  trimItemStart,
} from '../src/lib/layers'
import { overrideDelta } from '../src/lib/override-delta'
import { applyAgentPatch, createInitialState, projectReducer } from '../src/state/project-reducer'

const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const base: LayerItem = {
  id: 'L1', track: 1, kind: 'video', mediaId: '0123456789ab.mp4', startMs: 2000, endMs: 6000,
  trimStartMs: 1000, sourceDurationMs: 10_000, x: 50, y: 50, width: 40, aspect: 16 / 9,
  rotation: 0, opacity: 1, muted: true,
}
const image: LayerItem = { ...base, id: 'L2', kind: 'image', mediaId: '0123456789ab.png', trimStartMs: 0, sourceDurationMs: undefined, aspect: 1 }
const DURATION = 20_000

console.log('\nschema')
check('a valid item parses', LayerItem.safeParse(base).success)
check('a project with layers parses', Project.safeParse({ ...fixture, layers: [base] }).success)
check('a project WITHOUT layers still parses (additive, no migration)', Project.safeParse(fixture).success)
check('more than 40 items is refused', !Project.safeParse({ ...fixture, layers: Array.from({ length: 41 }, (_, i) => ({ ...base, id: `L${i}` })) }).success)

console.log('\nwhat is on screen')
const items = [{ ...image, track: 2 as const, startMs: 0, endMs: 5000 }, base]
check('end is exclusive', activeLayerItems([base], 6000).length === 0 && activeLayerItems([base], 5999).length === 1)
check('track 1 draws before track 2, whatever the list order', activeLayerItems(items, 3000).map((i) => i.track).join() === '1,2')
check('absent layers is nothing, not a crash', activeLayerItems(undefined, 0).length === 0)
check('a video shows its source from the trim point', sourceTimeMs(base, 2000) === 1000 && sourceTimeMs(base, 3500) === 2500)

console.log('\nwhere it sits')
const box = layerBox(base, 1080, 1920)
check('width is a share of the frame width', box.width === 432)
check('height follows the source aspect — never stretched', Math.abs(box.height - 432 / (16 / 9)) < 1e-9)
check('x/y is the CENTRE', box.left + box.width / 2 === 540 && Math.abs(box.top + box.height / 2 - 960) < 1e-9)

console.log('\nmove, trim, split')
const moved = moveItemTo(base, 9000, DURATION)
check('moving keeps length AND trim — it never changes which part plays', moved.endMs - moved.startMs === 4000 && moved.trimStartMs === 1000 && moved.startMs === 9000)
check('moving cannot run past the end of the video', moveItemTo(base, 19_000, DURATION).endMs === DURATION)
const trimmedIn = trimItemStart(base, 3000)
check('dragging the left edge in advances the source in-point by the same amount', trimmedIn.startMs === 3000 && trimmedIn.trimStartMs === 2000 && trimmedIn.endMs === 6000)
check('a left-edge drag cannot pull in source before the start of the file', trimItemStart(base, 0).trimStartMs === 0 && trimItemStart(base, 0).startMs === 1000)
check('an image has no source, so its trim never moves', trimItemStart(image, 3000).trimStartMs === 0)
check('the right edge cannot run past the end of the source', trimItemEnd(base, 30_000, 60_000).endMs === 2000 + 9000)
check('an image can be stretched as long as the video', trimItemEnd(image, 30_000, DURATION).endMs === DURATION)
check('no trim makes a sliver', trimItemEnd(base, base.startMs, DURATION).endMs - base.startMs >= 100)

const halves = splitItem(base, 3500, 'L9')
check('split makes two items that meet exactly at the cut', !!halves && halves[0].endMs === 3500 && halves[1].startMs === 3500)
check('the second half’s trim advances by the first half’s length — seamless playback', !!halves && halves[1].trimStartMs === 2500)
check('both halves together cover the original', !!halves && halves[0].startMs === base.startMs && halves[1].endMs === base.endMs)
check('the frame at the cut is the same either side of it', !!halves && sourceTimeMs(halves[0], 3499) + 1 === sourceTimeMs(halves[1], 3500))
check('a split at the very edge is refused, not a sliver', splitItem(base, 2050, 'L9') === null && splitItem(base, base.endMs, 'L9') === null)

console.log('\nplacing a new upload')
check('ids count up', nextLayerId([base, { ...base, id: 'L7' }]) === 'L8' && nextLayerId(undefined) === 'L1')
const fresh = newLayerItem({ mediaId: 'aaaaaaaaaaaa.png', kind: 'image', aspect: 2 }, [], 4000, DURATION)
check('lands at the playhead, on track 1, 3 s long', fresh.startMs === 4000 && fresh.endMs === 7000 && fresh.track === 1)
check('the new item is schema-valid', LayerItem.safeParse(fresh).success)
const stacked = newLayerItem({ mediaId: 'bbbbbbbbbbbb.png', kind: 'image', aspect: 1 }, [fresh], 5000, DURATION)
check('dropped where track 1 is busy, it stacks on track 2 instead of covering', stacked.track === 2 && stacked.id === 'L2')
check('a video uses its own length, capped at the project end', newLayerItem({ mediaId: 'cccccccccccc.mp4', kind: 'video', aspect: 1, sourceDurationMs: 60_000 }, [], 1000, DURATION).endMs === DURATION)

console.log('\nundo and saving')
const project = { ...fixture, layers: [base] } as Project
const state = projectReducer(createInitialState(project), { type: 'SET_LAYERS', layers: [...halves!] })
check('a split is ONE undo step', state.past.length === 1 && state.present.layers?.length === 2)
const cleared = applyAgentPatch(project, { type: 'SET_LAYERS', layers: [] })
check('an empty list removes the key, so absent and [] stay one thing', !('layers' in cleared))
check('an agent turn with layers is one commit', projectReducer(createInitialState(project), {
  type: 'APPLY_AGENT_PATCHES',
  patches: [{ type: 'SET_LAYERS', layers: [moved] }, { type: 'SET_PRESET', presetId: 'chamak' }],
}).past.length === 1)

// The persistence bug fixed alongside: an agent turn's preset-override change was never saved.
// It is now sent as the END STATE, which has to survive the server's key-by-key merge.
check('back to the preset is a whole-object null', overrideDelta({ wordsPerLine: 2 }, undefined) === null)
const delta = overrideDelta({ wordsPerLine: 2, reveal: 'dim' }, { reveal: 'none' }) as Record<string, unknown>
check('a key the turn dropped is sent as null, so the server removes it too', delta.wordsPerLine === null && delta.reveal === 'none')
check('an unchanged override round-trips', JSON.stringify(overrideDelta({ wordsPerLine: 3 }, { wordsPerLine: 3 })) === '{"wordsPerLine":3}')

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
