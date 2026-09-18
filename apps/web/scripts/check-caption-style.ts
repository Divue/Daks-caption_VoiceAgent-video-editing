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
import { CAPTION_FONTS, PRESETS, Project } from '@captions/shared'
import type { Preset, PresetId, Word } from '@captions/shared'
import {
  assertPresetFontsLoadable,
  glowWrapperCss,
  resolveWordStyle,
  revealOpacity,
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
check('chamak: the halo is green, not the transparent fill colour',
  String(chamakWrapper?.filter).includes('rgba(160, 216, 62'), String(chamakWrapper?.filter))
check('chamak: the readability shadow moved to the wrapper too',
  String(chamakWrapper?.filter).includes('rgba(0,0,0,0.35)'))

const nazmEmphasis = resolveWordStyle(word({ emphasis: true }), PRESETS.nazm, SETTINGS, FRAME)
const nazmShadow = String(styleToCss(nazmEmphasis).textShadow)
check('nazm: solid fill keeps its glow as a text-shadow', glowWrapperCss(nazmEmphasis) === undefined)
// The audit writes these colour-first; CSS accepts either order and we emit offsets first.
for (const layer of ['0 0 10px rgba(255, 255, 255, 0.8)', '0 0 20px rgba(255, 255, 255, 0.6)', '0 0 30px rgba(255, 255, 255, 0.4)']) {
  check(`nazm: glow layer "${layer}" matches the measured Delhi stack`, nazmShadow.includes(layer), nazmShadow)
}

const dhamakaCss = String(styleToCss(dhamaka).textShadow)
check('dhamaka: the olive halo is built from glowColor, not the white fill',
  dhamakaCss.includes('rgba(137, 139, 38'), dhamakaCss)

// ---------------------------------------------------------------------------
console.log('\nreveal modes (audit 14 §5)')
// ---------------------------------------------------------------------------
const EXPECTED_REVEAL: Record<string, 'none' | 'dim' | 'hidden'> = {
  rangmanch: 'none',
  chamak: 'none',
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
check('emphasis colour beats the angry layer on the same word', angryEmphasised.color === '#A6190D')
check('the angry shake still survives underneath it', angryEmphasised.shake === 4)

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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
