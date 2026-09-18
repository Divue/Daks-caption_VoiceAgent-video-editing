# Prompt — caption style panel + 4 sentiment presets

*Hand this to a Claude Code session working in `apps/web` (P3). It assumes audit 14 exists.*

---

## Goal

Build the caption styling panel: every visual property of a caption editable from the right-hand
panel, plus four new presets rebuilt from measured reference values. The panel is modelled on the
reference product's (audit 14 §6) **but restructured around our sentiment model**, which theirs has
no equivalent of — that is the point of the feature, not a detail.

## Read first, in order

1. `CLAUDE.md` — ownership, and the rule that schema changes stop and ask
2. `.claude/INDEX.md` — invariants, especially "PRESETS is the single source of truth for preset visuals"
3. `.claude/audits/14-kalakar-reference-audit.md` — every measured value this task uses, and §7's schema gap list
4. `.claude/audits/13-caption-emotion-and-single.md` — how word writes are serialised; you will be adding more writers
5. `packages/shared/src/project.ts` and `presets.ts` — the contract and the current four presets
6. `apps/web/src/lib/caption-style.ts` — the layer resolver you will be extending
7. `apps/web/src/components/inspector/{WordInspector,StyleOverrideFields}.tsx` — the panel that exists today

## The one architectural lever to understand before planning

`Preset` (`presets.ts`) is **not part of the stored Project**. Only `presetId` is. So the `Preset`
type can grow freely in TypeScript with no `schema.py` mirror, no migration and no lead sign-off.

`Style` **is** stored (per-word overrides) and `PresetId` **is** an enum in the Project schema.
Those two need the lead, a `schema.py` change in the same commit, and agreement.

**Put as much as possible in `Preset` and as little as possible in `Style`.** Read audit 14 §7
before deciding which side of that line each new property belongs on.

---

## Part A — naming (decided, change only if the lead objects)

We are rebuilding four reference looks. They get Hinglish names, not the reference's city names:

| reference template | ours | the look |
|---|---|---|
| Kalakar Motion | **`rangmanch`** — "Rangmanch" | editorial serif body, huge red Anton emphasis |
| Kalakar Glow | **`chamak`** — "Chamak" | heavy Inter, green gradient emphasis with a big halo |
| Delhi | **`nazm`** — "Nazm" | grotesque body, italic serif emphasis, white glow |
| Kathmandu | **`dhamaka`** — "Dhamaka" | tight lowercase Montserrat, yellow emphasis, olive glow |

**Resolve this collision first.** Our existing `kathmandu` preset is *already* a rough copy of
Kalakar Motion (Instrument Serif + Anton + `#A6190D`) — while the reference's actual "Kathmandu" is
the yellow Montserrat look we are calling `dhamaka`. Leaving a preset called `kathmandu` that looks
like Kalakar Motion next to a `dhamaka` that looks like Kalakar Kathmandu will confuse everyone.

Recommended: **rename `kathmandu` → `rangmanch`** and upgrade it in place to the measured values.
That is a `PresetId` enum change, so it needs the lead and a `schema.py` mirror — and any stored
project carrying `presetId: "kathmandu"` needs a migration. `store/projects.py` has an empty
`MIGRATIONS` list ready for exactly this; add the first entry rather than breaking old rows.

Keep `mrbeast`, `minimal`, `hinglish-bold` as they are.

---

## Part B — schema changes (lead sign-off, both files in one commit)

Add to `Style` in `project.ts`, mirrored in `services/api/app/schema.py`:

```
letterSpacing?: number   // em-relative, e.g. -0.053. NOT px — it must survive frame scaling.
lineHeight?: number      // multiplier, e.g. 0.9
strokeWidth?: number     // px at 1080p, 0 = none
strokeColor?: string
glowColor?: string       // glow currently borrows `color`, which is wrong for gradient text (see Part E)
```

**Text case.** `Style` has `uppercase?: boolean` and `dhamaka` needs *lowercase*. Two options — pick
one and say which:
- (a) add `lowercase?: boolean` — additive, no migration, mildly ugly to have two booleans
- (b) replace both with `textCase?: 'none' | 'upper' | 'lower'` — cleaner, but breaking, needs a migration

**Gradient stops.** `Style.gradient` is a 2-tuple. `chamak`'s real fill is a 7-stop symmetric sheen
(audit 14 §3). A 2-tuple cannot express it. Either add `gradientStops?: Array<{ color: string; at: number }>`
or accept the approximation and say so in the commit message. Do not silently ship the 2-stop version
as if it matched.

Everything else in this task goes in `Preset` and needs none of the above.

## Part C — `Preset` extensions (TypeScript only, no schema change)

```
emphasisScale: number              // emphasis fontSize as a multiple of base — see the table below
reveal: 'none' | 'dim' | 'hidden'  // how words before the playhead render
glowLayers?: number                // how many stacked shadows to build from `glow` (default 3)
emotion?: Partial<Record<Emotion, Partial<Style>>>  // per-preset override of EMOTION_STYLES
```

`reveal` is the behaviour audit 14 §5 found is per-template: `hidden` paints upcoming words fully
transparent, `dim` fades them, `none` shows the whole line. We currently hardcode `opacity: 0.55`
for every preset (`CaptionRenderer.tsx:117`), which is a fourth behaviour the reference uses nowhere.

## Part D — the four presets

All values are **px at 1080p width**, which is what `Style.fontSize` already means, so they drop in
unconverted (audit 14 §1). Sources are measured, not estimated.

| | `rangmanch` | `chamak` | `nazm` | `dhamaka` |
|---|---|---|---|---|
| base family | Instrument Serif *Italic* | Inter | Instrument Sans | Montserrat |
| base weight | 400 | 800 | 400 | 800 |
| base size | 45 | 96 | 72 | 90 |
| base colour | `#FFFFF0` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| letterSpacing | −0.046 | 0 | 0 | −0.053 |
| lineHeight | 0.9 | 0.9 | 1.0 | 1.0 |
| case | none | none | none | **lower** |
| emphasis family | Anton | Inter | Instrument Serif *Italic* | Montserrat |
| emphasis weight | 400 | 900 | 400 | 800 |
| emphasisScale | **2.93** | **2.19** | **1.5** | **1.34** |
| emphasis case | upper | upper | none | lower |
| emphasis fill | `#A6190D` | gradient `#A0D83E → #AADC53 → #CAE993 (50%) → #AADC53 → #A0D83E` | `#FFFFFF` | `#F9FD45` |
| glow | none | `#A0D83E`, radius 100 | `#FFFFFF`, radius 30 | `rgba(137,139,38)`, radius 108 |
| reveal | `none` | `none` | `hidden` | `dim` |

Fonts: `Instrument Sans` must be added to `CAPTION_FONTS` (open-licence Google Font). `Montserrat`,
`Inter`, `Anton`, `Instrument Serif` are already there — but **`Instrument Serif` must load its
italic**, which `rangmanch` and `nazm` both depend on. Check `index.html`'s font link and
`assertPresetFontsLoadable()` covers the new family, or these render in a silent fallback.

## Part E — renderer

`caption-style.ts` layer order is already right: preset base → emotion → emphasis → per-word override
(line 29). Keep it. Changes:

1. **`emphasisScale`** — emphasis size is currently an absolute px in `preset.emphasis.fontSize`.
   Make it a multiple of the resolved base so a user changing base size keeps the proportion. Mind the
   existing `< 10 means multiplier` heuristic at line 56 — do not add a second, conflicting convention.
2. **Multi-layer glow.** One `0 0 Npx` shadow bands visibly. Both reference glows stack three at
   decreasing alpha and increasing radius — `nazm` is `.8/10px, .6/20px, .4/30px`. Derive N layers from
   `glow` + `glowColor` + `glowLayers`.
3. **Glow on gradient text must be a wrapper `filter: drop-shadow()`, not `text-shadow`.** This is the
   trap audit 14 §3 documents: gradient text sets `color: transparent`, and `text-shadow` draws from the
   glyph colour. `chamak` will render with no halo at all if you use `text-shadow`. The reference wraps
   the word and filters the wrapper; do the same.
4. **`reveal`** — replace the hardcoded `opacity: 0.55` with the preset's mode.
5. **`letterSpacing` / `lineHeight`** — resolve and emit; letterSpacing is em-relative so multiply by
   the resolved font size, not by the frame scale.
6. **Stroke** — `strokeWidth`/`strokeColor` via `-webkit-text-stroke` plus `paint-order: stroke fill`,
   or the effect eats the glyph interiors.

`caption-style.ts` is pure and ports to Remotion unchanged (its header says so). **Keep it pure** —
no React, no DOM. P2 swaps `CaptionRenderer` for `<Player>` and takes this file with it.

## Part F — the panel itself

Replace `StyleOverrideFields` with a sectioned panel. Sections marked **[ours]** have no counterpart
in the reference product and are the reason this is not a clone.

| section | controls |
|---|---|
| TEXT | font family, weight/face, size, case, alignment |
| EMPHASIS | its own family, weight, size (as a scale), colour, solid/gradient — emphasis is a **full independent face**, not a weight bump |
| **SENTIMENT [ours]** | per-emotion styling for `neutral` / `angry` / `excited`: colour, weight, case, shake amplitude, scale. Writes `Preset.emotion`, falling back to `EMOTION_STYLES` |
| **STRETCH [ours]** | ms-per-repeat and max-repeats, currently hardcoded at `caption-style.ts:10-13`. Live preview of a held word |
| **PER-WORD [ours]** | emphasis, emotion, Single (already built — audit 13), emoji |
| POSITION | x %, y % |
| SPACING | letter spacing, line spacing |
| EFFECTS | glow (colour + radius), drop shadow, stroke |
| REVEAL | none / dim / hidden |

Two rules for the whole panel:

- **Preset vs word scope must be visible at all times.** Every control edits either the preset (all
  words) or the selected word (one word). Today `StyleOverrideFields` only does per-word and it is
  already ambiguous; with preset-level controls in the same panel it becomes genuinely confusing. Label
  the scope, or split it into two tabs.
- **All writes go through `useWordPatch`** (`state/word-patch-context.tsx`). It is a single serialised
  queue for a reason — audit 13 §5. A preset-level change that touches N words must use `patchWords`,
  never a loop of `patch` calls, and never a second queue.

## Known bug to fix on the way in

`StyleOverrideFields.withField` emits `undefined` for a cleared key, `JSON.stringify` drops it, and the
server never sees the removal — **clearing any style override silently does not persist**. The backend
already supports per-key removal via an explicit `null`. This is blocker 1 from the integration review
and you will be rewriting this exact function, so fix it here rather than porting the bug forward.

## Out of scope

Per `CLAUDE.md`'s MVP cuts and audit 14 §7.6: 3D Depth, Arc, Background fill, Spotlight emphasis mode,
Transitions, AI Audio, custom font upload. Do not add a colour-picker dependency — `<input type="color">`
is already in use.

## Verification

- `npm run build` and `npx tsc --noEmit` clean in `apps/web`
- `npx oxlint src` — no **new** warnings (the repo has pre-existing ones)
- If `Style` or `PresetId` changed: `docker compose run --rm api pytest` green, and a round-trip test
  that a patched project still validates against both the zod and pydantic schemas
- Render all four presets against `packages/shared/fixtures/demo-project.json` and eyeball each against
  audit 14's specimen images — especially `chamak`'s halo, which is the one most likely to silently
  render as nothing
- Confirm clearing a style override actually survives a reload
