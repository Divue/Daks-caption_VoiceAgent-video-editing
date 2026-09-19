# Talk-and-Edit Phase 9 — "All captions" erased the preset's colours

## Status
Fixed and verified in a real browser against the running stack and live Bedrock, with the exact
failing interaction reproduced first. Found alongside it, and fixed: agent edits to the preset
override were never saved, and "All captions" edits were saved as one request per word.
**Not verified:** an exported MP4 of a base-face change (the export calls the same resolver).

## Objective
Reported by the repo owner: "the presets used to have colours for the emotion-based words and
emphasised words; they are not there any more??"

## Implementation

### What was actually wrong
The preset definitions were untouched — every emphasis and angry colour is still in `presets.ts`,
and `resolveWordStyle` still produced them (checked for all seven presets). The colours were being
**buried**, by the one control people reach for first:

> **All captions → Colour** wrote the colour onto every single word.

A per-word colour beats the emphasis face and the tone layer in `resolveWordStyle`, so the
emphasised and angry words became that colour too — and because it was stored on the words, switching
preset could not bring them back. Earlier today this very reel carried an explicit `#D7D7DA` on all 94
of its words. Reproduced on a Rangmanch project:

| | emphasised `jaante` | angry `ghatiya` | plain `hue` |
|---|---|---|---|
| before | `#E2452A` | `#FF5C3A` | `#FFF6E9` |
| after picking blue under "All captions" | **blue** | **blue** | blue |

It also wrote them as **one PATCH per word** — 94 sequential round trips for one click. Closing the
tab part-way through left the project half-coloured (measured: 6 of 94 landed).

The agent did the same thing on purpose: its prompt said *"make all the captions yellow" is a single
update_caption_style over every id.*

This is the second time the same bug has appeared. The first was **size**: "make the captions bigger"
stamped `fontSize` onto every word and shrank the emphasised word from 33.5px to 18.3px. That was fixed
with `presetOverride.baseFontSize`, which covered size only.

### The fix: "All captions" edits the base face
`CLAUDE.md` already states the rule: *"Presets are the base look. Emphasis and emotion are per-word
layers on top of any preset."* `PresetOverride` gains `base: Style.partial()`, and "All captions"
writes to it — one project write — instead of onto every word. `resolvePreset` merges it into the
preset's `base`, so the emphasis and tone layers land on top as designed, in the editor and in the
export alike. Size keeps its single home in `baseFontSize`: the panel's size control reads and writes
that, so the panel and the agent can never disagree about which base size wins.

- **Existing projects that were already stamped** keep their per-word colours, since clearing them
  silently would lose deliberate per-word edits too. The panel now says so — "every word has its own
  style, which these controls don't reach, and it hides the preset's emphasis and tone colours" —
  with a **Clear** button.
- **`patchStyle`** now sends one bulk PATCH, not a PATCH per word. The bulk route has existed since
  phase 1; this caller never moved to it.
- **The agent:** `set_preset_override` gains `base`. The prompt now routes every all-captions request
  ("make the captions blue", "use Poppins", "put them at the top", "add an outline") to it, and forbids
  stamping every word. `update_caption_style` is for specific words only.

### Found on the way: agent override edits were never saved
`applyAgentPatches` handled `UPDATE_WORD`, `SET_PRESET`, `SET_SETTINGS` and `ADD_OVERLAY` — but **not
`SET_PRESET_OVERRIDE`**. So every agent edit to the conditional layers showed on screen and vanished on
reload, silently, and wasn't even counted as unsaved. That covered "fewer words per line", "angry words
shake harder", and phase 8's "go back to the original preset".

A turn's override is now sent as the **end state** it produced (`overrideDelta`), not replayed patch by
patch. That's because one turn can clear everything and then set one key, and no single key-by-key
merge can express that. Keys the turn dropped go as explicit nulls.

## Files Created
- `apps/web/src/lib/override-delta.ts`, this audit.

## Files Modified
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — `PresetOverride.base`. **Lead-owned;
  additive and optional, so no migration.**
- `apps/web/src/lib/resolve-preset.ts` — merges `base` (shared with the export).
- `apps/web/src/components/inspector/style-scope.ts` — `presetScope` targets the base face.
- `apps/web/src/components/inspector/CaptionStylePanel.tsx` — call site; the own-style notice + Clear.
- `apps/web/src/state/preset-override-context.tsx` — `base` is a stored key.
- `apps/web/src/hooks/useWordPatch.ts` — bulk `patchStyle`; `SET_PRESET_OVERRIDE` (and `SET_LAYERS`)
  persisted from agent turns.
- `services/api/app/agent/tools/{schemas,project_tools}.py`, `planner.py` — **P4**: `base`, prompt rules.

## Files Intentionally Untouched
- `presets.ts` — nothing was wrong there.
- Existing stamped projects' data — see above; the user decides via Clear.

## Interfaces / Contracts
- `PresetOverride.base?: Partial<Style>` (TS) / `base: Optional[StylePatch]` (Python). Additive.
- `presetScope(stored, basePreset, wordIds, writeOverride)` — the signature changed; its one caller is
  updated.
- The preset scope's `override` is now the stored base face, not "the keys every word happens to share".

## Ownership
`apps/web` — P3. `services/api/app/agent` — P4, flagged. `project.ts` / `schema.py` — lead, flagged.
This is additive, and both files changed together.

## Security
No new endpoints or dependencies. The change narrows writes, from 94 per click to one.

## Testing
pytest 128 · agent suite 12/12 · `check:agent`, `check:captions`, `check:layers` · `tsc -b` · build ·
remotion drift guard — all pass. oxlint 19, identical to `HEAD`: zero new warnings, checked by diffing
the warning list against a `HEAD` worktree rather than comparing counts.

## Live Verification
- **The failing interaction, after the fix** (real colour picker, Rangmanch reel): plain words → blue,
  emphasised `jaante` stays **`#E2452A`**, angry `ghatiya` stays **`#FF5C3A`**. One project PATCH,
  stored as `presetOverride.base`, and **0** words stamped.
- **The agent, live Bedrock:** "make the captions blue" → 1 patch (`base.color`), where it used to be
  94. "Put the captions at the top and use Poppins" → 1 patch (`base.fontFamily`, `base.y`).
- **Persistence, which was broken:** the same agent command typed into the real editor → one
  `PATCH /projects/{id}` with `{"presetOverride":{"base":{"color":"#0000FF"}}}` → the server holds it
  after the page is gone. "Go back to the original preset" → `{"presetOverride":null}` stored, 0
  per-word styles, and the reel is back to Rangmanch's own colours.
- **Test data cleaned:** every write made during verification was reverted, including one left over
  from phase 8's browser test (a `#00FF00` on `a6b0b99f231d`).

## Unverified / Untestable
1. An exported MP4 with a base-face change.
2. Session-only preset tweaks (glow layers, stretch, align) still go through the old path. They were
   never stored, and nothing here changed them.

## Deviations
- The user asked a question; I fixed it, since the cause was a defect rather than a missing feature.
  I paused the in-progress media-layers work to do so.
- The `patchStyle` and override-persistence fixes were not asked for. They were found in the same code
  path while reproducing the report, and both lost user work silently.

## Next Steps
1. Export a reel after "make the captions blue" and check the emphasis colour survives in the MP4.
2. P4 sign-off on the prompt and tool changes.
