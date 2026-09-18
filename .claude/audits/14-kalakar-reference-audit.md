# 14 — Kalakar reference audit (competitor teardown, for implementation)

**Source:** `app.kalakar.io/editor/` — the reference product, inspected live in Chrome on the
account's own project. **Date:** 2026-09-18. **Status:** reference only, nothing implemented.
**Method:** values are `getComputedStyle` reads off the live rendered preview, not eyeballed from
screenshots. Anything not measured is called out as inferred.

> **They are built on Remotion.** `__remotion-player` sits in the caption layer's transform chain.
> Same renderer P2 is using — so their per-word layout is reproducible for us, not a black box.

---

## 1. The number that makes everything else portable

The composition renders at **1080×1920** and the player CSS-scales it down. Evidence: the player
box is 478 px wide, and a word computed at `font-size: 108px` measured 48 px on screen —
108 × (478/1080) = 47.8. So **every px below is authored at 1080p width**, which is exactly how
our `Style.fontSize` is already defined ("px at 1080p width"). Values copy across with no
conversion.

Their **UI "Font Size" field is ⅓ of the composition px** (UI 32 → 96px, UI 15 → 45px). If we ever
mirror their numbers in our inspector, that factor is why they look small.

## 2. Templates: 42 total, 7 free

Free: **Kalakar Motion** (default), **Kathmandu**, **Dhaka**, **Double Trouble**, **Clean Motion**,
**Editing Skool**, **Kalakar Word**. The other 35 carry a `lucide-crown` badge — including
**Kalakar Glow** and **Delhi**. Per the user, crowned templates **preview fine and are only blocked
at export**, so they are fully inspectable (and were inspected).

Full list: Kalakar Motion, Kathmandu, Dhaka, Kalakar Glow, Delhi, Double Trouble, Ali Abdaal,
Bubble Style, Mumbai, Clean Motion, Highlighted Word, Goa, Islamabad, Editing Skool, Kalakar Shadow,
Pop Up, Kalakar, Hormozi Style, Mr Beast Style 1, Mr Beast Style 2, Iman Gadzhi, Devin Jatho,
Clean Glow Style, Kalakar Clean, Black Punch, Kalakar Word, Pixelated Word, Ziada, Shamani,
Shamani 2, Karachi, Liquid Glass, Top Up, Mota, Tabahi, Deep Glow, Seedha Saadha, Thora Cinematic,
Flicker, Zero Gravity, Underline, IJ Template.

## 3. The two priority templates, measured

### Kalakar Glow

| layer | measured |
|---|---|
| base | `Inter` **800**, 96px, line-height 86.4px (0.9), `#FFFFFF` |
| emphasis | `Inter` **900**, **209.92px** (2.187× base), `text-transform: uppercase` |
| emphasis fill | `linear-gradient(90deg, #A0D83E 0%, #A0D83E 20%, #AADC53 40%, #CAE993 50%, #AADC53 70%, #A0D83E 80%, #A0D83E 100%)` with `background-clip: text` |
| glow | on the **wrapper**: `filter: drop-shadow(rgba(0,0,0,.35) 5px 5px 15px) drop-shadow(#A0D83E 0 0 100px)` |

**The glow is a `filter`, not a `text-shadow`, and it has to be.** The text is gradient-clipped
(`color: transparent`), and `text-shadow` draws from the glyph's *colour*, so it would produce
nothing. A wrapper `drop-shadow` filter reads the rendered alpha instead. Two stacked drop-shadows:
a tight dark one for depth, then a 100px coloured halo.

The gradient is symmetric (lightest `#CAE993` at the 50% stop) — a centred sheen, not a
left-to-right ramp.

### Delhi

| layer | measured |
|---|---|
| base | `InstrumentSans` 400, 72px, line-height 1.0, `#FFFFFF` |
| emphasis | `InstrumentSerifItalic` 400, **108px** (1.5× base), `#FFFFFF` |
| emphasis glow | `text-shadow: rgba(255,255,255,.8) 0 0 10px, rgba(255,255,255,.6) 0 0 20px, rgba(255,255,255,.4) 0 0 30px` |

Delhi's whole idea is a **typeface contrast, not a colour contrast**: clean grotesque for the body,
italic display serif for the stressed word, both pure white, separated only by the glow. Three
shadow layers at decreasing alpha and increasing radius is what makes the halo fall off smoothly
instead of looking like a ring.

## 4. The other free templates, measured

| template | base | emphasis | effect |
|---|---|---|---|
| **Kalakar Motion** | `InstrumentSerifItalic` 400, 45px, ls −2.05px, `#FFFFF0` | `Anton` 400, **132px** (2.93×), uppercase, `#A6190D` | none; contrast is size + face + colour |
| **Kathmandu** | `Montserrat` 800, **90px**, ls −4.76px, lowercase, `#FFFFFF` | `Montserrat` 800, 120.6px, `#F9FD45` | `text-shadow: rgba(137,139,38,.455) 0 0 34px, rgba(137,139,38,.91) 0 0 108px` |
| **Dhaka** | `Chakra Petch` 700, 96px, uppercase | same face, yellow | `text-shadow: rgba(0,0,0,.6) 2px 3px 3px` |
| **Double Trouble** | `Montserrat` **300**, 72px | `Montserrat` **800**, 72px | none — contrast is *weight only*, same size |
| **Clean Motion** | `Inter` 600, 72px | — | none |
| **Editing Skool** | `Inter` 700, 96px, uppercase | — | none |
| **Kalakar Word** | `Inter` 500, 72px, `#D7DAD8` | — | none |

**Kathmandu varies font size per word within one line** — measured 90px / 120.6px / 63px / 90px /
63px across "Hello bhai log kaise ho". That is a deliberate scale jitter, not just emphasis: the
non-emphasis words differ from each other too. Nothing in our schema expresses it today (see §7).

## 5. Two behaviours worth copying

**Progressive reveal.** In Delhi, Clean Motion and Kalakar Word, words later in the line render at
`color: rgba(0,0,0,0)` — fully transparent — until the playhead reaches them. Kalakar Motion and
Editing Skool instead show the whole line at full opacity. So **the reveal mode is per template**,
not global. Our `CaptionRenderer` currently dims upcoming words to `opacity: 0.55` for every preset
(`CaptionRenderer.tsx:117`) — a third option neither of them uses.

Kathmandu does a softer variant: `rgba(255,255,255,0.918)` on the next word, fully transparent
after — a one-word fade-ahead.

**The universal readability shadow.** `drop-shadow(rgba(0,0,0,0.35) 5px 5px 15px)` appears on the
caption wrapper regardless of template. We already do this (`styleToCss` always pushes
`0 2px 8px rgba(0,0,0,0.55)`) — theirs is larger, softer and offset down-right rather than centred.

## 6. Editor options inventory (the right panel)

**Captions ▸ Text**
- FONTS: Font Family, Font Face, Font Size
- EMPHASIS: its own Font Family + Font Face — *emphasis is a full independent face, not a weight bump*
- FORMAT: Styles (`Tt` / `T` / `t` / `U` — title/upper/lower/underline), Text Alignment (L/C/R)
- POSITION: X %, Y % (both default 50.0)
- COLOR: Solid | Gradient, hex
- EMPHASIS (second block): **Emphasize | Spotlight** mode, Solid | Gradient, Color, Size, Font, Font Face, Styles
- SPACING: Letter Spacing, Line Spacing
- EFFECTS: Drop Shadow, Glow, **3D Depth** (Color, %, Depth %, Angle °), **3D Depth — Layer 2** (same four), Text Stroke, **Arc**, Background

**Captions ▸ Templates** — Built-in Templates | My Presets, search, **Save preset**. A selected card
expands inline to expose that template's own knobs (Kalakar Motion: Primary `#FFFFF0`; Emphasis
mode Emphasize/Spotlight; Solid/Gradient; Color `#A6190D`) plus **Remove Style**.

**Captions ▸ Transitions**, **Captions ▸ AI Audio** — not opened this session.

**Caption Tools** (gear, above the caption list)
- DISPLAY SETTINGS: **Words** (5 Words), **Max Chars** (24), **Lines** (1 Line)
- ACTIONS: Remove Punctuation, Remove Emphasis, Remove Gaps in Captions, Remove Emojis
- TIMING: Caption Delay Control, −5s … +5s

**Left rail:** Captions, Custom Fonts, Library. **Timeline:** WORD / LINE mode toggle, + Word,
settings, cut, split, link/unlink, zoom, volume, expand.

## 7. Mapping onto our schema

Already expressible with `Style` + `PRESETS` as they stand:

| theirs | ours |
|---|---|
| base font family/weight/size | `Style.fontFamily` / `weight` / `fontSize` |
| emphasis as a separate face | `Preset.emphasis` — we already layer it (`caption-style.ts:64`) |
| uppercase / lowercase | `Style.uppercase` (lowercase would need a new value) |
| solid colour, gradient | `Style.color`, `Style.gradient` — we already clip gradients to text |
| X/Y percent | `Style.x` / `Style.y` |
| glow | `Style.glow` — but ours is one radius; see below |
| letter spacing | **missing** |
| line spacing | **missing** |

Gaps, in rough order of value for our look:

1. **`letterSpacing`.** Kathmandu's −4.76px at 90px (−0.053em) is a large part of why it reads as
   punchy. We have no field; add it as an em-relative number so it survives frame scaling.
2. **Multi-stop glow.** Ours is `glow: number` → one `0 0 Npx` shadow. Both reference glows are
   **three stacked layers at decreasing alpha**, which is what stops the halo banding. Either make
   `glow` an object, or derive three layers from the single number in the renderer.
3. **Gradient stops.** Our `gradient` is a 2-tuple. Kalakar Glow needs 7 stops for the centre sheen.
   A 2-tuple can approximate it but not reproduce it.
4. **Reveal mode.** Per template, and we hardcode one behaviour for all presets. Smallest useful
   change: a `Preset` field (`reveal: 'dim' | 'hidden' | 'none'`), no `Project` schema change.
5. **Per-word size jitter** (Kathmandu). Would need something like `Style.fontSize` set per word —
   which our per-word `style` override *already* supports. No schema change; it is a question of
   whether the pipeline or a preset generates it.
6. **Not worth it for the MVP:** 3D Depth (two layers, each colour/depth/angle), Arc, Text Stroke,
   Background, Spotlight emphasis mode. Out of scope per `CLAUDE.md`.

## 8. Font library

44 families loaded (346 faces), served by the app itself:

`Anton`, `Archivo Black`, `AcreRegular`, `BaroPlain`, `Bitter`, `Caveat`, `Chakra Petch`,
`ClashDisplay`, `DrukWide`, `Fonseca`, `Futura`, `Helvetica`, `Helvetica Neue Bold`,
`HelveticaLight`, `Impact`, `InstrumentSans`, `InstrumentSerifItalic`, `Inter`, `Kaushan Script`,
`KomikaAxis`, `LobsterTwoItalic`, `LuckiestGuy`, `Michroma`, `Mona Sans`, `Montserrat`
(+ Light/SemiBold/ExtraBold), `Noto Color Emoji`, `Onest`, `Parisienne`, `Poppins`, `PressStart2P`,
`Roboto`, `RubikBlack`, `Satisfy`, `SmartSansStdBold`, `TheBoldFont`, `TimesNewRomanBold`, `VPPixel`.

We already ship `Inter`, `Instrument Serif`, `Anton`, `Poppins`, `Komika Axis` (`CAPTION_FONTS`).
To land Delhi and Kathmandu we would additionally need **`InstrumentSans`**, **`Montserrat`** and
— for Dhaka — **`Chakra Petch`**. All three are open-licence Google Fonts.

`Noto Color Emoji` is in their stack for every caption face; our emoji rendering depends on the
system font today.

## 9. Images

| file | what it is |
|---|---|
| `assets-14-specimens-all.jpg` | all 8 audited templates rendered side by side from the measured CSS |
| `assets-14-specimens-glow-delhi.jpg` | Kalakar Glow + Delhi large, plus an InstrumentSerifItalic / InstrumentSans alphabet |
| `assets-14-glow-live-preview.png` | Kalakar Glow as it actually renders in their player (low-res, for cross-checking the reconstructions) |

## 10. Caveats

- Values are from **one clip at one playhead position**. Animation-dependent properties (any
  per-frame scale/opacity curve) are a single frame's snapshot, not the curve.
- `Transitions` and `AI Audio` tabs were not opened.
- Emphasis values for Dhaka, Clean Motion, Editing Skool and Kalakar Word were not captured — the
  playhead was past the emphasised word. Their base values are solid; the emphasis rows in §4 for
  Dhaka/Editing Skool are **inferred from the template thumbnails**, not measured.
- Screenshots of the live preview are low-resolution (the player renders ~456px wide). The specimen
  images accompanying this audit were rendered separately at large size using the same loaded fonts
  and the measured CSS, so glyph shapes are accurate but they are **reconstructions, not captures**.
