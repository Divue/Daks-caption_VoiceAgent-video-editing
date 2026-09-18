/**
 * Renders every preset against the shared fixture and checks the result against the MEASURED
 * values in `.claude/audits/14-kalakar-reference-audit.md`.
 *
 * This exists because the two ways this feature fails are both silent:
 *   - a preset names a font index.html never loads, and the caption renders in a fallback face;
 *   - a gradient-filled word gets its glow as a `text-shadow`, and the halo is simply absent,
 *     because gradient text sets `color: transparent` and text-shadow draws from the glyph colour.
 * Neither throws. Both look like "the design is a bit off" rather than a bug.
 *
 * Run: `npx jiti apps/web/scripts/check-caption-style.ts` from the repo root.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPTION_FONTS, PRESETS, Project, deriveBlocks, resolveEmphasis } from '@captions/shared'
import type { Preset, PresetId, Word } from '@captions/shared'
import {
  assertPresetFontsLoadable,
  glowWrapperCss,
  resolveWordStyle,
  revealOpacity,
  shouldCascade,
  styleToCss,
} from '../src/lib/caption-style'

const ROOT = join(import.meta.dirname, '../../..')
const FRAME = 1080 // resolve at reference width so px come out in schema units
const SETTINGS = { emojis: true, emotionLayer: true }

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance
}

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: 'w',
    text: 'bhai',
    startMs: 0,
    endMs: 500,
    emphasis: false,
    emotion: 'neutral',
    stretch: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
console.log('\nfixture + fonts')
// ---------------------------------------------------------------------------
const fixture = JSON.parse(
  readFileSync(join(ROOT, 'packages/shared/fixtures/demo-project.json'), 'utf8'),
)
const parsed = Project.safeParse(fixture)
check(
  'demo-project.json validates against the zod Project schema',
  parsed.success,
  parsed.success ? '' : parsed.error.issues[0]?.message,
)

const missingFonts = assertPresetFontsLoadable()
check('every preset face is in CAPTION_FONTS (incl. italics)', missingFonts.length === 0, missingFonts.join(', '))

const indexHtml = readFileSync(join(ROOT, 'apps/web/index.html'), 'utf8')
const notLinked = CAPTION_FONTS.filter((font) => !indexHtml.includes(font.replace(/ /g, '+')))
check('every CAPTION_FONTS family is in the index.html font link', notLinked.length === 0, notLinked.join(', '))
check(
  'Instrument Serif is requested with its italic axis (rangmanch + nazm depend on it)',
  indexHtml.includes('Instrument+Serif:ital@0;1'),
)

// ---------------------------------------------------------------------------
console.log('\nmeasured emphasis sizes (audit 14 §3, §4)')
// ---------------------------------------------------------------------------
const EXPECTED_EMPHASIS_PX: Partial<Record<PresetId, number>> = {
  rangmanch: 132,
  chamak: 209.92,
  nazm: 108,
  dhamaka: 120.6,
}

for (const [id, expected] of Object.entries(EXPECTED_EMPHASIS_PX) as [PresetId, number][]) {
  const style = resolveWordStyle(word({ emphasis: true }), PRESETS[id], SETTINGS, FRAME)
  check(
    `${id}: emphasis renders at ${expected}px`,
    near(style.fontSize, expected, 0.5),
    `got ${style.fontSize.toFixed(2)}px`,
  )
}

// ---------------------------------------------------------------------------
console.log('\nmeasured base values')
// ---------------------------------------------------------------------------
const rangmanch = resolveWordStyle(word(), PRESETS.rangmanch, SETTINGS, FRAME)
check('rangmanch: base is 45px Instrument Serif italic', rangmanch.fontSize === 45 && rangmanch.italic)
check('rangmanch: letter spacing resolves to -2.05px', near(rangmanch.letterSpacing, -2.05, 0.05),
  `got ${rangmanch.letterSpacing.toFixed(2)}px`)

const dhamaka = resolveWordStyle(word(), PRESETS.dhamaka, SETTINGS, FRAME)
check('dhamaka: base is lowercase', dhamaka.textCase === 'lower')
check('dhamaka: letter spacing resolves to -4.76px', near(dhamaka.letterSpacing, -4.76, 0.05),
  `got ${dhamaka.letterSpacing.toFixed(2)}px`)

const nazmBase = resolveWordStyle(word(), PRESETS.nazm, SETTINGS, FRAME)
check('nazm: base is Instrument Sans 72px with no glow', nazmBase.fontFamily === 'Instrument Sans' && nazmBase.glow === 0)

// ---------------------------------------------------------------------------
console.log('\nangry gets a shake in every rebuilt preset')
// ---------------------------------------------------------------------------
for (const id of ['rangmanch', 'chamak', 'nazm', 'dhamaka'] as PresetId[]) {
  const angry = resolveWordStyle(word({ emotion: 'angry' }), PRESETS[id], SETTINGS, FRAME)
  check(`${id}: an angry word shakes (${angry.shake}px) and recolours`, angry.shake > 0)
}
check(
  'a neutral word never shakes',
  resolveWordStyle(word(), PRESETS.dhamaka, SETTINGS, FRAME).shake === 0,
)
check(
  'the emotion layer off means no shake at all',
  resolveWordStyle(word({ emotion: 'angry' }), PRESETS.dhamaka, { emojis: true, emotionLayer: false }, FRAME).shake === 0,
)

// ---------------------------------------------------------------------------
console.log('\nthe glow trap (audit 14 §3)')
// ---------------------------------------------------------------------------
const chamakEmphasis = resolveWordStyle(word({ emphasis: true }), PRESETS.chamak, SETTINGS, FRAME)
const chamakCss = styleToCss(chamakEmphasis)
const chamakWrapper = glowWrapperCss(chamakEmphasis)

check('chamak: emphasis fill is a gradient clipped to the text', chamakCss.color === 'transparent')
check('chamak: the gradient carries all 7 measured stops',
  String(chamakCss.backgroundImage).split('%,').length === 7, String(chamakCss.backgroundImage))
check('chamak: the halo is a WRAPPER drop-shadow, not a text-shadow',
  Boolean(chamakWrapper?.filter) && chamakCss.textShadow === undefined)
check('chamak: the halo carries glowColor, not the transparent fill colour',
  String(chamakWrapper?.filter).includes('rgba(255, 174, 26'), String(chamakWrapper?.filter))
check('chamak: the readability shadow moved to the wrapper too',
  String(chamakWrapper?.filter).includes('rgba(0,0,0,0.35)'))

const nazmEmphasis = resolveWordStyle(word({ emphasis: true }), PRESETS.nazm, SETTINGS, FRAME)
const nazmShadow = String(styleToCss(nazmEmphasis).textShadow)
check('nazm: solid fill keeps its glow as a text-shadow', glowWrapperCss(nazmEmphasis) === undefined)
// The audit writes these colour-first; CSS accepts either order and we emit offsets first.
for (const layer of ['0 0 10px rgba(214, 236, 255, 0.8)', '0 0 20px rgba(214, 236, 255, 0.6)', '0 0 30px rgba(214, 236, 255, 0.4)']) {
  check(`nazm: glow layer "${layer}" matches the measured Delhi stack`, nazmShadow.includes(layer), nazmShadow)
}

const dhamakaCss = String(styleToCss(dhamaka).textShadow)
check('dhamaka: the halo is built from glowColor, not the white fill',
  dhamakaCss.includes('rgba(94, 17, 48'), dhamakaCss)

// ---------------------------------------------------------------------------
console.log('\nreveal modes (audit 14 §5)')
// ---------------------------------------------------------------------------
// chamak deliberately DIVERGES from audit 14's measured 'none'. The audit read one frame of the
// reference's own player; the product's stacked templates build up a word at a time, which is
// `hidden`, and pairing that with `layout: 'stack'` is what produces the cascade. rangmanch keeps
// 'none' on purpose, so the whole stack lands at once and the set is not all one trick.
const EXPECTED_REVEAL: Record<string, 'none' | 'dim' | 'hidden'> = {
  rangmanch: 'none',
  chamak: 'hidden',
  nazm: 'hidden',
  dhamaka: 'dim',
}
for (const [id, mode] of Object.entries(EXPECTED_REVEAL)) {
  check(`${id}: reveal is "${mode}"`, PRESETS[id as PresetId].reveal === mode)
}
check('a word already spoken is never dimmed', revealOpacity('hidden', true) === 1)
check('hidden makes an upcoming word fully transparent', revealOpacity('hidden', false) === 0)
check('dim fades an upcoming word', revealOpacity('dim', false) === 0.55)
check('none shows the whole line', revealOpacity('none', false) === 1)

// ---------------------------------------------------------------------------
console.log('\nlayering')
// ---------------------------------------------------------------------------
// emphasis is applied AFTER emotion, so the narrower signal wins on a shared key.
const angryEmphasised = resolveWordStyle(word({ emphasis: true, emotion: 'angry' }), PRESETS.rangmanch, SETTINGS, FRAME)
check('emphasis colour beats the angry layer on the same word', angryEmphasised.color === '#E2452A')
check('the angry shake still survives underneath it', angryEmphasised.shake === 3)

// a per-word size override wins outright; it is not multiplied by emphasisScale again.
const pinned = resolveWordStyle(
  word({ emphasis: true, style: { fontSize: 50 } }),
  PRESETS.rangmanch,
  SETTINGS,
  FRAME,
)
check('an explicit per-word fontSize is not re-scaled by emphasisScale', pinned.fontSize === 50,
  `got ${pinned.fontSize}`)

// the emotion "scale" is a multiplier and must never be read as a px size.
const excited = resolveWordStyle(word({ emotion: 'excited' }), PRESETS.minimal, SETTINGS, FRAME)
check('excited scales the base size by 1.15', near(excited.fontSize, 56 * 1.15, 0.01),
  `got ${excited.fontSize}`)

// ---------------------------------------------------------------------------
console.log('\nround trip: a fully-styled project still validates')
// ---------------------------------------------------------------------------
const styled = JSON.parse(JSON.stringify(fixture))
styled.words[0].style = {
  fontFamily: 'Montserrat',
  fontSize: 90,
  italic: true,
  textCase: 'lower',
  letterSpacing: -0.053,
  lineHeight: 0.9,
  strokeWidth: 4,
  strokeColor: '#000000',
  glow: 108,
  glowColor: '#898B26',
  gradientStops: [
    { color: '#A0D83E', at: 0 },
    { color: '#CAE993', at: 50 },
    { color: '#A0D83E', at: 100 },
  ],
}
const styledParse = Project.safeParse(styled)
check('a project carrying every new Style key validates',
  styledParse.success, styledParse.success ? '' : JSON.stringify(styledParse.error.issues[0]))

// The old key must be gone, or a stale client could keep writing it unnoticed.
const stale = JSON.parse(JSON.stringify(fixture))
stale.words[0].style = { uppercase: true }
check('an un-migrated `uppercase` override does not silently survive parsing',
  !('uppercase' in (Project.safeParse(stale).data?.words[0].style ?? {})))

const oldPreset = JSON.parse(JSON.stringify(fixture))
oldPreset.presetId = 'kathmandu'
check('the retired preset id is rejected', !Project.safeParse(oldPreset).success)

// ---------------------------------------------------------------------------
console.log('\nevery preset renders every fixture word without throwing')
// ---------------------------------------------------------------------------
for (const preset of Object.values(PRESETS) as Preset[]) {
  let rendered = 0
  try {
    for (const fixtureWord of parsed.success ? parsed.data.words : []) {
      const style = resolveWordStyle(fixtureWord, preset, SETTINGS, 478)
      styleToCss(style)
      glowWrapperCss(style)
      rendered += 1
    }
    check(`${preset.id}: rendered ${rendered} words`, rendered > 0)
  } catch (cause) {
    check(`${preset.id}: rendered ${rendered} words`, false, String(cause))
  }
}

// ---------------------------------------------------------------------------
console.log('\nemphasis rhythm rule')
// ---------------------------------------------------------------------------
{
  // A plain transcript: no word carries emphasis, which is exactly the case that used to render
  // as flat body text for seconds at a time.
  const plain: Word[] = Array.from({ length: 12 }, (_, index) => ({
    id: `w${index}`,
    text: `word${index}`,
    startMs: index * 400,
    endMs: index * 400 + 350,
    emphasis: false,
    emotion: 'neutral' as const,
    stretch: 1,
  }))
  const plainBlocks = deriveBlocks(plain, { maxWords: 3 })
  const every = 3
  const { ids, promoted } = resolveEmphasis(plain, plainBlocks, every)

  check('a plain transcript gets emphasis promoted into it', promoted.size > 0)
  check('nothing was promoted that was already emphasised', ids.size === promoted.size)

  // The actual guarantee: never more than `every` consecutive blocks with nothing emphasised.
  let run = 0
  let worst = 0
  for (const block of plainBlocks) {
    if (block.wordIds.some((id) => ids.has(id))) run = 0
    else worst = Math.max(worst, ++run)
  }
  check(`no more than ${every} blocks in a row stay flat`, worst <= every, `worst run was ${worst}`)

  // It must not touch the words themselves — that is the whole reason it returns a Set.
  check('promotion never writes to Word.emphasis', plain.every((w) => w.emphasis === false))

  // Off means off.
  check('emphasisEveryBlocks: 0 disables it', resolveEmphasis(plain, plainBlocks, 0).promoted.size === 0)

  // A stored emphasis resets the counter rather than being ignored or duplicated.
  const marked = plain.map((w, i) => (i === 1 ? { ...w, emphasis: true } : w))
  const markedResult = resolveEmphasis(marked, deriveBlocks(marked, { maxWords: 3 }), every)
  check('a stored emphasis is kept and is not counted as promoted',
    markedResult.ids.has('w1') && !markedResult.promoted.has('w1'))

  // One-word blocks are skipped: making the only word big is a bigger line, not emphasis.
  const singles: Word[] = plain.slice(0, 4).map((w) => ({ ...w, single: true }))
  const singleResult = resolveEmphasis(singles, deriveBlocks(singles, { maxWords: 3 }), 1)
  check('a one-word block is never promoted', singleResult.promoted.size === 0)

  // And it works on the real fixture.
  if (parsed.success) {
    const fixtureBlocks = deriveBlocks(parsed.data.words, { maxWords: PRESETS.chamak.wordsPerLine })
    const onFixture = resolveEmphasis(parsed.data.words, fixtureBlocks, every)
    check(`fixture: ${onFixture.ids.size} words emphasised across ${fixtureBlocks.length} blocks`,
      onFixture.ids.size >= fixtureBlocks.length / every - 1)
  }
}

// ---------------------------------------------------------------------------
console.log('\nstack layout')
// ---------------------------------------------------------------------------
// Exactly one preset cascades. The look is strong and specific; the point of having it is that
// one preset reads as typography while the rest read as captions.
check('chamak is the only stacked preset', PRESETS.chamak.layout === 'stack')
for (const id of ['rangmanch', 'nazm', 'dhamaka', 'mrbeast', 'minimal', 'hinglish-bold'] as PresetId[]) {
  check(`${id}: stays inline`, PRESETS[id].layout === 'inline')
}
// The cascade is decided PER BLOCK, not per preset.
{
  const block = [word({ id: 'a', text: 'har' }), word({ id: 'b', text: 'saal' })]
  const withEmphasis = new Set(['b'])
  const none = new Set<string>()

  check('chamak cascades a block that has an emphasised word',
    shouldCascade(block, withEmphasis, PRESETS.chamak))
  check('chamak falls back to a normal line when the block has none',
    !shouldCascade(block, none, PRESETS.chamak))
  check('an inline preset never cascades, emphasis or not',
    !shouldCascade(block, withEmphasis, PRESETS.rangmanch))
}

// A promoted word must resolve to the emphasis face even though its own flag is false — this is
// the join between the rhythm rule and the resolver, and it is silent if it breaks.
{
  const plainWord = word({ emphasis: false })
  const asPlain = resolveWordStyle(plainWord, PRESETS.rangmanch, SETTINGS, FRAME)
  const asPromoted = resolveWordStyle(plainWord, PRESETS.rangmanch, SETTINGS, FRAME, { emphasised: true })
  check('a promoted word renders in the emphasis face', asPromoted.fontFamily === 'Anton' && asPlain.fontFamily === 'Instrument Serif')
  check('a promoted word gets the emphasis size', near(asPromoted.fontSize, 132, 0.5), `got ${asPromoted.fontSize}`)
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
