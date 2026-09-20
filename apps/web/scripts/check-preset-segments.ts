/**
 * `Project.presetSegments`: the arithmetic, the grouping, and the one invariant the preview and
 * the export both rest on.
 *
 * The three ways this feature fails are all silent:
 *   - a block spans a segment boundary, so one line has to be drawn in two presets and quietly
 *     gets one of them;
 *   - the editor draws the block with the preset at the PLAYHEAD while the export draws it with
 *     the preset of the BLOCK, and the two disagree for exactly the frames at a boundary;
 *   - a list is written that the schema refuses, so the reducer drops it and the edit just does
 *     nothing.
 * None throws. All three look like "the segment didn't take".
 *
 * Run: `npm run check:segments -w @captions/web` (needs the `@` alias, hence the package script).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_EMPHASIS_EVERY_BLOCKS, MIN_BLOCK_MS, PRESETS, Project } from '@captions/shared'
import type { PresetSegment, Word } from '@captions/shared'
import { buildCaptionTimeline, findBlockIndexAt } from '@/lib/caption-timeline'
import { resolvePreset } from '@/lib/resolve-preset'
import { normaliseSegments, removeSegment, segmentAt, setSegment } from '@/lib/preset-segments'
import { assertPresetFontsLoadable } from '@/lib/caption-style'
import { collectFontFamilies } from '../../../remotion/src/fonts'

const ROOT = join(import.meta.dirname, '../../..')

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const seg = (id: string, startMs: number, endMs: number, presetId = 'chamak' as const): PresetSegment => ({
  id,
  startMs,
  endMs,
  presetId,
})

// ---------------------------------------------------------------------------
console.log('normaliseSegments — the shape the schema demands')
{
  const DURATION = 10_000
  check(
    'sorts by start',
    normaliseSegments([seg('b', 4000, 5000), seg('a', 1000, 2000)], DURATION).map((s) => s.id).join() ===
      'a,b',
  )
  check('drops a zero-length segment', normaliseSegments([seg('a', 1000, 1000)], DURATION).length === 0)
  check(
    'clamps a segment past durationMs to the end of the video',
    normaliseSegments([seg('a', 9000, 99_000)], DURATION)[0].endMs === DURATION,
  )
  check(
    'drops a segment entirely past durationMs',
    normaliseSegments([seg('a', 20_000, 30_000)], DURATION).length === 0,
  )
  // An overlap can only arrive as an upstream bug; the later one yields so the list can never
  // reach the reducer in a shape it would silently drop.
  const overlapping = normaliseSegments([seg('a', 0, 5000), seg('b', 3000, 8000, 'nazm')], DURATION)
  check(
    'an overlap is resolved rather than written',
    overlapping.length === 2 && overlapping[1].startMs === 5000,
    JSON.stringify(overlapping),
  )
  // Two touching segments of the same look are indistinguishable on screen, so leaving them split
  // would put a caption break where the viewer sees no change at all.
  check(
    'two touching segments of the same look are merged',
    normaliseSegments([seg('a', 0, 3000), seg('b', 3000, 6000)], DURATION).length === 1,
  )
  check(
    'two touching segments of DIFFERENT presets are not merged',
    normaliseSegments([seg('a', 0, 3000), seg('b', 3000, 6000, 'nazm')], DURATION).length === 2,
  )
  check(
    'same preset, different override, is not merged',
    normaliseSegments(
      [{ ...seg('a', 0, 3000), presetOverride: { wordsPerLine: 2 } }, seg('b', 3000, 6000)],
      DURATION,
    ).length === 2,
  )
  check(
    'every normalised list satisfies the schema rule',
    Project.safeParse({
      ...JSON.parse(readFileSync(join(ROOT, 'packages/shared/fixtures/demo-project.json'), 'utf8')),
      presetSegments: overlapping,
    }).success,
  )
}

// ---------------------------------------------------------------------------
console.log('\nsetSegment — create, move and resize are one carve')
{
  const DURATION = 10_000
  const base = [seg('a', 2000, 6000)]
  check(
    'a segment dropped inside another splits it in two',
    setSegment(base, seg('n', 3000, 4000, 'nazm'), DURATION).map((s) => `${s.startMs}-${s.endMs}`).join() ===
      '2000-3000,3000-4000,4000-6000',
  )
  check(
    'overlapping the left edge trims it',
    setSegment(base, seg('n', 1000, 3000, 'nazm'), DURATION).map((s) => `${s.startMs}-${s.endMs}`).join() ===
      '1000-3000,3000-6000',
  )
  check(
    'overlapping the right edge trims it',
    setSegment(base, seg('n', 5000, 8000, 'nazm'), DURATION).map((s) => `${s.startMs}-${s.endMs}`).join() ===
      '2000-5000,5000-8000',
  )
  check(
    'covering one entirely removes it',
    setSegment(base, seg('n', 0, 9000, 'nazm'), DURATION).length === 1,
  )
  // Resizing must replace the old copy, not carve against it and leave a stub behind.
  check(
    'resizing a segment by its own id replaces it',
    setSegment(base, seg('a', 2000, 9000), DURATION).map((s) => `${s.startMs}-${s.endMs}`).join() ===
      '2000-9000',
  )
  check('removeSegment removes exactly one', removeSegment(base, 'a', DURATION).length === 0)
  check('segmentAt is half-open — the end belongs to the next segment', segmentAt(base, 6000) === undefined)
  check('segmentAt finds the start', segmentAt(base, 2000)?.id === 'a')
}

// ---------------------------------------------------------------------------
console.log('\nbuildCaptionTimeline — grouping and emphasis per segment')

const raw = JSON.parse(readFileSync(join(ROOT, 'packages/shared/fixtures/demo-project.json'), 'utf8'))
const fixture = Project.parse(raw)

const words: Word[] = Array.from({ length: 24 }, (_, index) => ({
  id: `w${index}`,
  text: `word${index}`,
  startMs: index * 400,
  endMs: index * 400 + 350,
  emphasis: false,
  emotion: 'neutral' as const,
  stretch: 1,
}))
// 24 words at 400 ms each = 9600 ms. Read off presets.ts: mrbeast packs 2 words to a line and
// nazm packs 4, which is the widest gap available and so the clearest grouping signal.
const project = { ...fixture, durationMs: 9600, words, presetId: 'mrbeast' as const, presetOverride: undefined }

{
  const plain = buildCaptionTimeline(project, { mergeShorterThanMs: MIN_BLOCK_MS })
  check(
    'with no segments, nothing changes: every block is the project preset',
    plain.blocks.every((b) => plain.presetOfBlock(b.id).id === 'mrbeast'),
  )
  check('no segments means no key on the project', project.presetSegments === undefined)

  const halves = {
    ...project,
    presetSegments: [{ id: 's', startMs: 4800, endMs: 9600, presetId: 'nazm' as const }],
  }
  const split = buildCaptionTimeline(halves, { mergeShorterThanMs: MIN_BLOCK_MS })

  // THE grouping guarantee: a block's words all sit in one segment, so a block always has exactly
  // one preset to be drawn with.
  const straddles = split.blocks.filter((block) => {
    const inside = block.wordIds
      .map((id) => split.wordById.get(id)!)
      .map((word) => segmentAt(halves.presetSegments, word.startMs)?.id ?? null)
    return new Set(inside).size > 1
  })
  check('no block spans a segment boundary', straddles.length === 0, `${straddles.length} do`)

  // Grouping is per-segment because `wordsPerLine` is a preset property.
  const first = split.blocks.filter((b) => b.startMs < 4800)
  const second = split.blocks.filter((b) => b.startMs >= 4800)
  check(
    `mrbeast packs ${PRESETS.mrbeast.wordsPerLine} words a line before the boundary`,
    first.every((b) => b.wordIds.length <= PRESETS.mrbeast.wordsPerLine),
  )
  check(
    `nazm packs up to ${PRESETS.nazm.wordsPerLine} after it`,
    second.some((b) => b.wordIds.length > PRESETS.mrbeast.wordsPerLine),
    `widest was ${Math.max(...second.map((b) => b.wordIds.length))}`,
  )
  check('every block resolves to its own segment’s preset', second.every((b) => split.presetOfBlock(b.id).id === 'nazm'))
  check('a word in no segment falls back to the project preset', first.every((b) => split.presetOfBlock(b.id).id === 'mrbeast'))

  // A segment's own override, merged by the same resolvePreset the project's override uses.
  const tweaked = {
    ...project,
    presetSegments: [
      { id: 's', startMs: 4800, endMs: 9600, presetId: 'nazm' as const, presetOverride: { wordsPerLine: 1 } },
    ],
  }
  const withOverride = buildCaptionTimeline(tweaked, { mergeShorterThanMs: 0 })
  check(
    'a segment’s own presetOverride reaches deriveBlocks',
    withOverride.blocks.filter((b) => b.startMs >= 4800).every((b) => b.wordIds.length === 1),
  )

  // A segment covering the whole video IS just that preset, everywhere.
  const whole = buildCaptionTimeline(
    { ...project, presetSegments: [{ id: 's', startMs: 0, endMs: 9600, presetId: 'nazm' as const }] },
    { mergeShorterThanMs: MIN_BLOCK_MS },
  )
  const asBase = buildCaptionTimeline({ ...project, presetId: 'nazm' as const }, { mergeShorterThanMs: MIN_BLOCK_MS })
  check(
    'a segment covering the whole video is identical to setting the base preset',
    JSON.stringify(whole.blocks) === JSON.stringify(asBase.blocks),
  )
}

// ---------------------------------------------------------------------------
console.log('\nemphasisEveryBlocks — one counter per segment, not one per project')
{
  // `minimal` disables promotion (emphasisEveryBlocks: 0); the project's own preset does not.
  const mixed = {
    ...project,
    presetId: 'nazm' as const,
    presetSegments: [{ id: 's', startMs: 0, endMs: 4800, presetId: 'minimal' as const }],
  }
  const timeline = buildCaptionTimeline(mixed, { mergeShorterThanMs: MIN_BLOCK_MS })
  const early = [...timeline.promotedIds].filter((id) => timeline.wordById.get(id)!.startMs < 4800)
  const late = [...timeline.promotedIds].filter((id) => timeline.wordById.get(id)!.startMs >= 4800)
  check('a segment that disables promotion disables it only for itself', early.length === 0, `${early.length} promoted`)
  check('the rest of the video still gets the rhythm rule', late.length > 0)

  // The counter restarts at a boundary: a new look is itself the break in monotony the rule is for.
  const twoLooks = {
    ...project,
    presetId: 'nazm' as const,
    presetSegments: [{ id: 's', startMs: 4800, endMs: 9600, presetId: 'dhamaka' as const }],
  }
  const split = buildCaptionTimeline(twoLooks, { mergeShorterThanMs: MIN_BLOCK_MS })
  const everyBlocks = DEFAULT_EMPHASIS_EVERY_BLOCKS
  let run = 0
  let worst = 0
  let previous: string | null = null
  for (const block of split.blocks) {
    const presetId = split.presetOfBlock(block.id).id
    if (presetId !== previous) run = 0
    previous = presetId
    if (block.wordIds.some((id) => split.emphasisIds.has(id))) run = 0
    else worst = Math.max(worst, ++run)
  }
  check(`never more than ${everyBlocks} flat blocks in a row within one segment`, worst <= everyBlocks, `worst run ${worst}`)
  check('promotion still never writes to Word.emphasis', twoLooks.words.every((w) => w.emphasis === false))
}

// ---------------------------------------------------------------------------
console.log('\npreview === export')
{
  // What each side hands CaptionRenderer, computed the way each side computes it:
  //   - the export (remotion/src/CaptionVideo.tsx): the preset of the block under the frame,
  //   - the preview (App.tsx's `previewPreset`): the preset of the block under the playhead.
  // Both are `presetOfBlock(activeBlockId)`, and that is the whole reason they agree. The first
  // version of this used the PLAYHEAD's segment for the preview, which differs from the block's
  // for the tail of a block whose last word starts before a boundary and ends after it — a real
  // mismatch, in the MP4, for exactly those frames, with nothing throwing anywhere.
  const projectWithSegments = {
    ...project,
    presetSegments: [
      // 3800 falls INSIDE w9 (3600-3950), so that word starts in segment 'a' and ends in 'b' —
      // the case the block-vs-playhead distinction exists for. Not a coincidence: pick it.
      { id: 'a', startMs: 1200, endMs: 3800, presetId: 'dhamaka' as const },
      { id: 'b', startMs: 3800, endMs: 7000, presetId: 'nazm' as const, presetOverride: { wordsPerLine: 2 } },
    ],
  }
  const timeline = buildCaptionTimeline(projectWithSegments, { mergeShorterThanMs: MIN_BLOCK_MS })

  let mismatches = 0
  let sampled = 0
  for (let t = 0; t < projectWithSegments.durationMs; t += 33) {
    const index = findBlockIndexAt(timeline.blocks, t)
    if (index === -1) continue // a gap between blocks draws nothing, in both
    sampled += 1
    const exported = timeline.presetOfBlock(timeline.blocks[index].id)
    // The preview, with no session tweaks — the export cannot have any, so this is the comparison
    // that matters. `resolvePreset(p, {})` must also be a no-op, which this proves.
    const previewed = resolvePreset(timeline.presetOfBlock(timeline.blocks[index].id), {})
    if (JSON.stringify(exported) !== JSON.stringify(previewed)) mismatches += 1
  }
  check(`every drawn frame resolves identically in preview and export (${sampled} sampled)`, mismatches === 0 && sampled > 0, `${mismatches} differ`)

  // A word can START before a boundary and END after it, so a block's span can reach past its own
  // segment. That is exactly why the renderer is driven by the BLOCK and not by the playhead.
  const overhang = timeline.blocks.filter((block) => {
    const segment = segmentAt(projectWithSegments.presetSegments, block.startMs)
    return segment !== undefined && block.endMs > segment.endMs
  })
  check('the fixture really does contain an overhanging block (this check is not vacuous)', overhang.length > 0)
  check(
    'a block whose last word overhangs its segment still has ONE preset',
    overhang.every((block) => timeline.presetOfBlock(block.id).id === segmentAt(projectWithSegments.presetSegments, block.startMs)!.presetId),
    `${overhang.length} blocks overhang`,
  )

  // Fonts: every segment's typeface has to be loaded before the first frame, not when its segment
  // arrives — a face that starts loading late draws its opening frames in the fallback.
  const presets = timeline.blocks.map((b) => timeline.presetOfBlock(b.id))
  const families = collectFontFamilies([presets, projectWithSegments.words.map((w) => w.style)])
  check(
    'collectFontFamilies walks an ARRAY of presets and finds all of them',
    families.has(PRESETS.dhamaka.base.fontFamily) &&
      families.has(PRESETS.nazm.base.fontFamily) &&
      families.has(PRESETS.mrbeast.base.fontFamily),
    [...families].join(', '),
  )
  const unloadable = assertPresetFontsLoadable()
  check('every preset a segment can name is loadable by the editor', unloadable.length === 0, unloadable.join(', '))
}

// ---------------------------------------------------------------------------
console.log('\nthe schema refuses what the arithmetic never produces')
{
  const bad = (presetSegments: unknown) => Project.safeParse({ ...raw, presetSegments }).success
  check('overlapping segments are rejected', !bad([seg('a', 0, 5000), seg('b', 3000, 8000)]))
  check('out-of-order segments are rejected', !bad([seg('b', 5000, 8000), seg('a', 0, 3000)]))
  check('a zero-length segment is rejected', !bad([seg('a', 1000, 1000)]))
  check('sorted, disjoint segments are accepted', bad([seg('a', 0, 3000), seg('b', 5000, 8000)]))
  check('the fixture still parses with no presetSegments at all', Project.safeParse(raw).success)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
