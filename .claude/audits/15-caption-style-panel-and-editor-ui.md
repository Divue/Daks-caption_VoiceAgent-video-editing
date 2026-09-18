# 15 — Caption style panel, four measured presets, schema v2, editor UI

**Area:** `packages/shared/src/{project,presets}.ts`, `services/api/app/{schema.py,store/projects.py}`,
`apps/web/src/{lib/caption-style.ts,lib/style-change.ts,components/inspector/*,state/preset-override-context.tsx,
index.css}` plus the editor chrome.
**Status:** built. Web typechecks, builds, adds no new oxlint warning class. 69/69 API tests pass
(15 of them new). `npm run check:captions` — 45 assertions against audit 14's measured values —
passes. Verified in the browser in fixture mode.
**Branch:** `p3-editor`. **Date:** 2026-09-18. Implements `.claude/plans/caption-style-panel.md`.

## 1. Schema v2 (lead-approved this session)

`project.ts` and `schema.py` changed together, with the first `MIGRATIONS` entry.

| change | why it had to be in `Style` and not `Preset` |
|---|---|
| `letterSpacing` (em-relative), `lineHeight` | per-word overridable, and em survives frame scaling |
| `strokeWidth`, `strokeColor` | same |
| `glowColor` | glow borrowed `color`, which is *transparent* on gradient text |
| `gradientStops` | chamak's fill is a 7-stop symmetric sheen; a 2-tuple cannot express it |
| `italic` | **not decoration.** rangmanch's body and nazm's emphasis are both Instrument Serif *Italic*. Two of the four presets render wrong without it, and it has to sit in `Style` because `preset.base` and `preset.emphasis` are both `Partial<Style>` |
| `uppercase` → `textCase: 'none' \| 'upper' \| 'lower'` | dhamaka needs forced lowercase; two booleans that can both be true is a precedence rule nobody would remember |
| `PresetId: kathmandu` → `rangmanch` | the old id held the reference's *Kalakar Motion* look, while the reference's own "Kathmandu" is the yellow Montserrat one now shipping as `dhamaka` — the two names pointed at each other's looks |

`SCHEMA_VERSION` is now 2. `_v1_to_v2` applies both renames, including style overrides nested in
`words[]` and `overlays[]`, and drops `uppercase: false` entirely (an absent key already meant that).
Migration is lazy on read, written back on the next write — a v1 row is unreadable without it,
because `"kathmandu"` is not in the v2 enum.

## 2. The lever: `Preset` is not stored

Only `presetId` is. So `Preset` grew with no `schema.py` mirror, no migration and no sign-off:
`emphasisScale`, `reveal`, `glowLayers`, `emotion`, `stretch`, `align`.

**Emphasis size is now a multiple, not a px.** It was `preset.emphasis.fontSize`, an absolute value
that broke the look the moment a user changed the base size. Making it `emphasisScale` also let the
old `fontSize < 10 means multiplier` heuristic be deleted rather than gain a second, conflicting
convention on the same field — `EMOTION_STYLES` now carries `{ style, scale? }`, so a size is always
px and a multiplier is always its own field.

## 3. The renderer, and the one trap that fails silently

`caption-style.ts` keeps its layer order (base → emotion → emphasis → per-word) and stays pure, so
it still ports to Remotion unchanged. Four changes matter:

1. **Gradient text's glow must be a wrapper `filter: drop-shadow()`, never `text-shadow`.** A
   gradient fill sets `color: transparent`, and `text-shadow` draws from the glyph's *colour*.
   chamak's 100px halo would have rendered as **nothing at all**, with no error. The readability
   shadow moves to the wrapper for the same reason. `glowWrapperCss` is the seam; `styleToCss`
   emits glow only for a solid fill.
2. **Glow is N stacked layers** at decreasing alpha and increasing radius. One flat `0 0 Npx`
   shadow reads as a ring. nazm reproduces Delhi's measured `.8/10px, .6/20px, .4/30px` exactly.
3. **`reveal` replaces the hardcoded `opacity: 0.55`**, which was a fourth behaviour the reference
   uses nowhere. Words *already spoken* are no longer dimmed — only words ahead of the playhead
   follow the preset's mode.
4. **Stroke** uses `-webkit-text-stroke` with `paint-order: stroke fill`; without it the stroke
   paints over the fill and closes the glyph counters at caption weights.

`CaptionRenderer` now takes `preset` as a prop instead of reading `PRESETS[project.presetId]`, which
keeps it props-only (P2's swap point) while letting session-level preset tweaks reach the preview.

## 4. The cleared-override bug (integration review blocker 1)

`StyleOverrideFields.withField` built the next style with `{ ...style, [key]: undefined }`.
`JSON.stringify` drops undefined keys, so **clearing any style override never left the browser**.
The API has always removed a key on an explicit `null`.

Fixed structurally, not locally: style writes now go through `patchStyle(wordIds, StyleChange)`,
where `StyleChange` carries `null` for a removal. `applyStyleChange` (local) deliberately mirrors
`_merge_style` (server) including collapsing an emptied override to absent, so the optimistic result
and the stored result agree. The same fix applies to `emoji`, which had the identical hole.

`patchStyle` needs its own reducer action (`PATCH_WORDS_STYLE`) because a style override merges
**key by key** while every other word field replaces: `UPDATE_WORDS` spreads one identical patch
over every target, which would have replaced each word's whole override with the same object.

## 5. Panel scope — the decision the plan left open

A "preset scope" control has nowhere to persist, because `Preset` is not stored. Resolved by
splitting on whether the property is **conditional**:

| | writes | persists |
|---|---|---|
| Text, Position, Spacing, Effects at preset scope | `patchStyle(allWordIds, …)` | **yes** |
| Text, Position, Spacing, Effects at word scope | `patchStyle([wordId], …)` | **yes** |
| Emphasis, Sentiment, Stretch, Reveal, Align | session `PresetOverride` | **no — badged "session only"** |

Emphasis/emotion/reveal/stretch apply *only when a condition holds* (the word is emphasised, the
tone run is angry, the playhead has not arrived). `Style` is per word and cannot say "when
emphasised", so writing them onto words is not available. They tune the live preview and the UI
says so on every such section, rather than pretending to save.

Preset-scope reads use `sharedOverride`: a key counts as overridden only when **every** word carries
the same value. Words that disagree report un-overridden, so the next drag does not silently flatten
them. Preset-scope writes are one `patchStyle` call over N words on the existing serialised queue
(audit 13 §5) — never a loop of independent writes, never a second queue.

`PresetOverride` is stamped with the preset it was made against and dropped **during render** when
`presetId` changes. An effect would paint one frame of, say, Chamak's 2.19× scale on Nazm.

## 6. Fixture mode (`VITE_USE_FIXTURE` + `?demo=1`)

Documented in the root `CLAUDE.md` but never built. `EditorBootstrap` skips the bootstrap GET and
seeds from `demo-project.json`.

**It is reached only by `/editor?demo=1`, on a build with the env flag set.** The first cut let the
env flag alone decide, which meant `/editor` stopped being the upload screen for anyone running
with it on: "Get started" dropped you into the fixture project with no video, no dropzone and no
route to one. The flag arms the mode; the URL enters it. `projectId` stays null, and every writer
already guards on it, so edits stay local — this is not a fake backend and nothing simulates a
server response. Without it the editor cannot be opened at all without a deployed API, which made
UI work and the demo impossible offline.

**Superseded:** the first cut had no playhead in fixture mode, because `durationMs` came only from
the `<video>` element's metadata. `PlaybackProvider` now takes a `fallbackDurationMs` (the
project's own) and runs a detached clock when no element is attached, so the fixture scrubs and
plays. A video that failed to load also detaches now, rather than staying attached and pinning the
transport at 0. The preset swatches still render through the same
resolver and are the visual check that matters.

## 7. Editor UI

Design language from `DESIGN.md` (Mistral AI teardown), added at the repo root.

- **The editor runs dark, the landing page stays light.** Scoped by a `dark` class on the editor
  subtree in `AppRoot` rather than a toggle on `<html>` — there is no theme switcher and the
  editor's darkness is a judgement about video work, not a user preference. Bright chrome around a
  9:16 reel drags the eye off the only thing that matters.
- **Neutrals are warm.** Every surface and border carries chroma on the yellow-orange axis. A
  neutral-grey dark theme with an orange button reads as a generic dashboard; the warm tint is what
  makes `#fa520f` look like brand rather than an alert.
- **The sunset stripe is used three times, not everywhere**: under the header, in the logo mark, and
  as the played portion of the transport. DESIGN.md is explicit that it *closes* a surface.
- Geometry is editorial per DESIGN.md — 12px cards, 8px buttons, full-round reserved for badges —
  so `--radius` moved to 0.75rem and the shadcn steps were re-derived from it.
- Right-panel tabs became underline tabs (`segmented-tab`), not filled pills. Panels gained an
  eyebrow title bar; `TranscriptPanel` lost its own duplicate heading. Timeline media tracks moved
  off stock blue/green onto the sunset ramp.
- `PresetPicker`'s swatch now renders through the **real** `resolveWordStyle` + `styleToCss` at a
  small frame width, so a card shows what the preview will draw — italic, tracking, emphasis scale
  and halo included. The hand-rolled style object it used before silently dropped all of them.

## 8. Verification

- `npm run build` (tsc -b + vite) clean. **Note:** `npx tsc --noEmit` in `apps/web` is a no-op —
  the tsconfig is solution-style with `files: []`. Use `npm run build` or `tsc -b`.
- `npx oxlint src` — no new warning class; the one new warning on
  `preset-override-context.tsx` is `only-export-components`, which every context file already has.
- `docker compose run --rm api pytest` — 69 passed, including `tests/test_style_schema_v2.py`
  (migration, the v1-row-in-Dynamo path, new-field round trip, per-key clearing, and a test that
  pins the retired preset id as *rejected* so the migration cannot quietly become optional).
- `npm run check:captions` (`apps/web/scripts/check-caption-style.ts`, run with jiti) — 45 checks
  against audit 14's measured numbers: emphasis sizes, tracking, reveal modes, the font link,
  layering precedence, and that chamak's halo is actually emitted.

## 9. Not done

- **Per-word size jitter** (audit 14 §7.5) — expressible today via per-word `fontSize`, but nothing
  generates it.
- **Gradient editing is 2-stop only.** A preset's multi-stop gradient is shown read-only rather than
  flattened; replacing it means switching to Solid first.
- **Stretch/sentiment/emphasis tweaks do not persist.** §5 explains why. Making them persist needs a
  stored `Project` field, which is a schema change this task did not carry.
- **The text input still PATCHes per keystroke** (audit 13 §6, blocker 4) — untouched here.
- Out of scope per `CLAUDE.md` and audit 14 §7.6: 3D Depth, Arc, Background fill, Spotlight
  emphasis mode, Transitions, AI Audio, custom font upload.
