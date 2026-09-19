// Guards for the two ways the EXPORT can silently stop matching the EDITOR. Run: npm run check -w @captions/remotion
//
// 1. CSS. The caption renderer is styled with Tailwind classes; the export bundle has no Tailwind, only the
//    hand-written src/caption-utilities.css. A new class in the renderer would export as unstyled text with
//    no error anywhere. This fails if the renderer uses a class the stylesheet does not define.
// 2. Fonts. The export loads the same Google Fonts link as the editor. This fails if the two drift.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
// Arguments let the checks be pointed at other files, which is how they are tested against known-bad input.
const [rendererPath = path.join(ROOT, '../apps/web/src/components/preview/CaptionRenderer.tsx'), cssPath = path.join(ROOT, 'src/caption-utilities.css'),
  htmlPath = path.join(ROOT, '../apps/web/index.html'), fontsPath = path.join(ROOT, 'src/fonts.ts')] = process.argv.slice(2)

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// --- 1. CSS classes ---------------------------------------------------------------------------------
const renderer = fs.readFileSync(rendererPath, 'utf8')
const css = fs.readFileSync(cssPath, 'utf8')

const used = new Set()
for (const [, value] of renderer.matchAll(/className="([^"]*)"/g)) for (const token of value.split(/\s+/).filter(Boolean)) used.add(token)
// A class built at runtime cannot be checked, so refuse it rather than pretend the check covered it.
const dynamic = [...renderer.matchAll(/className=\{/g)].length

const defined = new Set()
for (const [, selector] of css.matchAll(/\.((?:\\.|[\w-])+)\s*[,{]/g)) defined.add(selector.replace(/\\(.)/g, '$1'))

const missing = [...used].filter((c) => !defined.has(c))
console.log('css — every class the caption renderer uses is defined for the export')
check(`the renderer uses ${used.size} classes (found by reading it, not assumed)`, used.size > 0)
check('none is missing from caption-utilities.css', missing.length === 0, `missing: ${missing.join(', ')}`)
check('no dynamic className expression that this check cannot see', dynamic === 0, `${dynamic} found — use literal classes in CaptionRenderer, or extend this check`)

// --- 2. Fonts ---------------------------------------------------------------------------------------
console.log('fonts — the export loads the same typefaces as the editor')
const html = fs.readFileSync(htmlPath, 'utf8')
const fontsTs = fs.readFileSync(fontsPath, 'utf8')
const editorHref = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"/)?.[1]
const exportHref = fontsTs.match(/GOOGLE_FONTS_HREF\s*=\s*\n?\s*'([^']+)'/)?.[1]
check('the editor loads a Google Fonts stylesheet', !!editorHref)
check('the export declares one', !!exportHref)
check('they are the identical link', !!editorHref && editorHref === exportHref, editorHref && exportHref ? 'the two links differ — copy the one from apps/web/index.html' : '')

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
