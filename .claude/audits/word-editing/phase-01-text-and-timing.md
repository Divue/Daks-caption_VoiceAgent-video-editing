# Word Text & Timing Editing — Phase 1 Audit

## Status

Implemented, verified end-to-end against the REAL API and a real project in a real browser,
and structurally checked. **Revision 2** — the first version shipped a regression that made
timing editing impossible on real data; see §"Revision 2".  Entirely inside `apps/web` (P3);
no file outside it was touched. Phase 2 (add / delete / split / merge word) is **designed
and deliberately not built** — it needs a P1 endpoint and P4 tools, and is specified in
§"Phase 2" below.

## Objective

The pipeline gets words slightly wrong — a misheard Hinglish word, a time a beat off — and
there was no way to fix either by hand. Make text and timing of EXISTING words editable in
the editor, without breaking the AI agent that writes the same fields.

Two constraints governed the design:

1. Word ids are minted positionally (`services/api/app/pipeline/build.py:20`, `f"w{i}"`),
   so inserting or deleting a word raises a question about renumbering. Answered in
   §"The id decision".
2. `deriveBlocks` regroups caption lines from word timings, so a hand timing edit can
   silently change what is on screen. Answered in §"Regrouping".

## Revision 2 — the clamp was wrong, and the field was frozen

**What shipped first was a clamp into the gap the neighbours leave. It was wrong.** It
preserved the ordering invariant perfectly and made the feature useless.

Reported from the running editor on project `6c437eb52961` (160 words, 74s): the panel read
*"Held between 19.65s and 19.66s"* and the Start/End fields would not move. `clampTiming`
returned the word unchanged whenever `maxMs - minMs < MIN_WORD_MS`, and on a dense real
transcript the neighbours touch, so that window is routinely 10 ms wide.

The design error is worth naming, because it is not a typo: **the words most in need of a
timing fix are exactly the ones the pipeline crushed against their neighbours.** A
neighbour-tight clamp locks up precisely where the feature earns its keep. The unit checks
did not catch it because they ran on `demo-project.json`, whose 16 hand-authored words have
50 ms gaps between every pair — the fixture was too clean to express the failure. That is the
transferable lesson: *"build against the fixture first"* (root `CLAUDE.md`) got the contract
right and the physics wrong.

**`clampTiming`/`timingBounds` are replaced by `retimeWord`, which RIPPLES.** The edited word
goes where it is put; any word it now overlaps is pushed along keeping its own duration; the
push stops at the first word that already has room. The ordering invariant holds by
construction rather than by refusal, and the word is free to move as far as the user needs.
A ripple that would push a word past 0 or past `durationMs` returns `null` and the panel says
"No room", rather than silently truncating.

Because a ripple is N words with DIFFERENT values, it is written through `applyAgentPatches`
— the existing one-commit/one-bulk-PATCH path — not through `patchWords` (which spreads one
identical patch) and not through N `patch()` calls (which would be N undo steps and N round
trips). No new write path was invented. The name says "agent" because the agent was its first
caller, not because it is agent-only.

## The id decision

**Word ids are opaque and permanent. The `words` ARRAY stays in playback order. Nothing is
ever renumbered.**

This was checked against the source rather than assumed. Grepping `apps/web/src`,
`packages/shared/src`, `services/api/app` and `remotion/src` for anything that derives an
index from an id (`parseInt`, `slice(1)`, a `w(\d+)` pattern) returns **no hits at all**.
The only id-parsing in the repo is `apps/web/src/lib/layers.ts:159`, which mints the NEXT
`L<n>` layer id by scanning the ones in use — a precedent for minting, not for positionality.

What every one of these actually depends on is **array order == playback order**:

| Site | Dependency |
|---|---|
| `packages/shared/src/blocks.ts:deriveBlocks` | "Words are assumed to be in playback order" |
| `apps/web/src/hooks/useCaptionBlocks.ts:47 findBlockIndexAt` | **binary search** over blocks by `startMs` |
| `services/api/app/agent/tools/context_tools.py:179 select_word_range` | `{w.id: i for i, w in enumerate(project.words)}` — array index |
| `services/api/app/agent/tools/context_tools.py:59 get_timeline` | returns `project.words` in array order and calls it "timeline order" |
| `context_tools.py:_pick_endpoint` | "without a hint the earliest match wins" = first in the array |

So renumbering would cost the agent's in-flight word ids, every `b-w7` block id, the current
selection and every `Project` snapshot in the undo stack — and buy nothing, because no
consumer reads the digits. A future inserted word gets a fresh minted id and is spliced at
its time position.

**The corollary is the bug this phase actually fixes.** Nothing enforces the array-order
invariant today: `store/projects.py:_apply_word_patch` writes a word in place and never
re-sorts, and the agent's `shift_timing` (`word_tools.py:111`) clamps at 0 and checks
`end > start` but never looks at the neighbours. A hand timing edit is therefore exactly the
operation that can break `findBlockIndexAt`'s binary search, which then silently returns
`-1` and the playhead finds no caption at all.

## Implementation

### 1. `apps/web/src/lib/word-edit.ts` (new, pure — no React, no DOM)

Same contract as `lib/layers.ts`: the arithmetic is testable on its own and the component is
left with nothing but the widget.

- `MIN_WORD_MS = 40` — one frame at 25 fps. A zero-length word is legal in the schema (both
  bounds are `int().min(0)`, with no cross-field rule) and renders as a caption visible for
  no frames, which reads as a renderer bug.
- `retimeWord(words, wordId, durationMs, proposed)` — the whole timing edit. The edited word
  goes where it is put (the edge the user moved gets its way; the other yields, so a drag feels
  obeyed); every word it now overlaps is pushed along keeping its own duration; the push stops
  at the first word that already has room. Returns every word whose times changed, the edited
  one first, as integers — every time in the schema is `z.number().int()`. Returns `null`
  instead of truncating when the ripple cannot fit before 0 or `durationMs`.
  **`timingBounds`/`clampTiming` existed in revision 1 and are gone; see §"Revision 2".**
- `cleanWordText(raw)` — trims and collapses whitespace; returns `{ok:false, reason}` for
  empty, and `{ok:true, text, note}` when a typed space was collapsed.

**Rippling rather than validating is the whole design.** Every listed timing edge case —
`endMs < startMs`, zero-length, past `durationMs`, dragged past a neighbour, overlapping —
falls out of the same routine instead of five separate rules, and the order invariant can
never be broken in the first place, so there is nothing to re-sort and nothing to detect.

### 2. `apps/web/src/components/inspector/CaptionStylePanel.tsx` (modified)

The brief said "No UI anywhere edits word text." That was **incorrect**: a text input
already existed in `PerWordSection`, wired `onChange` → `patch()`. It committed one reducer
step *and* one PATCH on the shared write queue **per keystroke** — Ctrl+Z once per letter,
one HTTP round trip per letter. It was replaced, not added to.

- **`WordTextField`** — a local draft, committed on blur or Enter, reverted on Escape.
  One correction is one undo step and one request.
- **`WordTimingFields` / `TimeInput`** — Start and End as native `<input type="number">` in
  **seconds** (`step=0.05`, so an arrow key is a visible nudge), stored as integer ms. A
  slider was rejected: this is a precise nudge over a whole video, which is what arrow-key
  stepping is for and what a 300-pixel slider is hopeless at. The panel prints the window it
  is holding the word inside, so a field that will not go further says why before it is
  fought with.
- **`SignalsSection`** — hint rewritten; see §"Stale signals".

**No new reducer action was introduced.** Both fields ride the existing `UPDATE_WORD`, which
`APPLY_AGENT_PATCHES` already folds through `applyAgentPatch`. A hand edit and an agent turn
therefore cannot diverge — verified, not assumed: `check-word-edit.ts` applies the identical
two patches down both paths and asserts the resulting `Word` objects are byte-identical.

### 3. `apps/web/scripts/check-word-edit.ts` (new) + `npm run check:word-edit`

34 assertions, in the style of its three neighbours.

## Two bugs the browser run caught that the unit checks could not

Both were in code that passed typecheck, lint and all 34 unit assertions.

1. **The explanatory note was wiped in the tick it was set.** Committing with Enter blurs the
   field; the re-seed effect then ran and called `setMessage(null)`. So "splitting a word
   into two isn't available yet" — the one message that most needs to be read — never
   appeared. Fixed by splitting the effect: the draft re-seeds on `word.text`, the message
   clears only on `word.id` (a different word selected).
2. **A time field showed its pre-edit value after Enter.** `commit()` re-seeded the draft
   from the `ms` prop, which is this render's value, i.e. the value from *before* the edit —
   and the re-seed effect deliberately skips a field that still has focus, so the stale value
   stayed on screen. Measured: typing `-9999` into a start of `0.01s` left "0.01" displayed
   while the word had already moved to `0.00s`. Fixed by having `onCommit` return the ms the
   clamp actually applied and seeding from that.

## Edge cases — what each one does

### Timing
| Case | Behaviour |
|---|---|
| `endMs < startMs` | The edge the user moved wins; the other yields. Never inverts. |
| Zero-length | Refused; minimum `MIN_WORD_MS` (40 ms). |
| Past `durationMs` | The whole ripple is refused (`null`); the panel says "No room". |
| Dragged past a neighbour | The neighbour is **pushed**, keeping its own duration. |
| Overlapping | Structurally impossible: the ripple closes any overlap it creates. |
| Neighbours touching (the 10 ms case) | Editable — this is the regression fixed in revision 2. |
| A run of crushed words | Each push cascades until a word with slack absorbs it. |

### Text
| Case | Behaviour |
|---|---|
| Empty / whitespace-only | **Refused**, with "A word can't be empty. Deleting words isn't available yet." |
| A typed space | Collapsed to one word, with a note saying splitting is not available. |
| A very long word | Stored as typed. Layout is the renderer's problem, not a data rule; the field truncates so the panel does not break while typing. |
| IME / Devanagari | `compositionstart`/`end` tracked, plus `event.nativeEvent.isComposing`. A Devanagari IME fires `keydown` for Enter *while composing*, where Enter means "accept this candidate" — committing there would store a half-composed syllable. |

**Empty text: the REST route and the agent disagree, and the agent is right.**
`WordFields.text` (`routers/projects.py:122`) has no `min_length`; the agent's `SetTextArgs`
(`agent/tools/schemas.py:143`) requires `min_length=1`. An empty word still holds its slot in
the caption line and its span on the timeline, so it renders as a gap that looks like a bug.
Clearing a word really means "delete this word", which has no endpoint and no agent tool.
The UI refuses and says why. **P1 should add `min_length=1` to `WordFields.text`** — flagged,
not done, it is not P3's file.

### Interaction
| Case | Behaviour |
|---|---|
| Editing while the video plays | Already safe, verified not built: the Space play/pause guard (`App.tsx:~215`), `useUndoRedoShortcuts.ts:4` and the layer-key handler all skip `INPUT`/`TEXTAREA`/`contentEditable` targets. |
| An agent turn changes the word mid-edit | The field is **not** re-seeded while it has focus, so the characters are not yanked out from under the cursor. The user's commit then lands last-write-wins on the one shared queue — the same rule every other field already has. |
| Undo granularity | One commit per committed field edit. Per-keystroke was the bug being fixed. |
| Selection surviving an edit | Selection is `useSelection`'s `selectedWordId`; the id never changes, so it survives. |
| Keyboard nav between words | **Not built.** Tab moves between Start and End within the panel. Jumping to the next word from the field is not wired — see §"Deliberately not built". |

### Data — stale signals
**Decision: `signals` are left exactly as they are, and the panel says so.**

They are measurements of the ORIGINAL AUDIO. Re-spelling a misheard word does not change the
audio, so `loudnessZ` and `pitchZ` stay true of it. `durationRatio` and `extraMs` describe a
SPAN, and a timing edit moves the span — those two do go out of step.

They are not recomputed because the browser has no audio analysis, and the only honest
recomputation is another pipeline run — which `POST /projects/{id}/process` deliberately
refuses over a project with hand edits (`routers/projects.py:86`) unless forced. They are not
cleared either: `extraMs` is what `renderedText` (`lib/caption-style.ts:239`) draws a
stretched word's repeats from, so clearing it would silently un-stretch "hellooooo" as a side
effect of nudging its timing. Leaving them and saying so is the only option that neither
fabricates a measurement nor destroys one. `Word.emphasis` is untouched by the same argument.

Asserted: `check-word-edit.ts` confirms `signals` is byte-identical after both a text and a
timing edit.

### Data — `has_manual_edits`
**Confirmed, nothing to build.** `store/projects.py:_edit` (line 240) passes
`manual_edit=True` on every read-modify-write, and every word and project PATCH route goes
through it. So any hand edit sets `hasManualEdits`, which is what makes
`POST /projects/{id}/process` refuse (`routers/projects.py:86`) without `force`.

### Security
Word text is untrusted. There is **no `dangerouslySetInnerHTML` anywhere in `apps/web/src`
or `remotion/src`** (grepped: zero hits). Text is rendered as React text nodes in
`CaptionList`'s `WordChip`, `TranscriptWordRow`, `CaptionRibbon` and `CaptionRenderer`.
`cleanWordText` deliberately does **not** strip markup — `<img src=x onerror=alert(1)>` is
stored verbatim and rendered as literal characters, which is asserted in the check script.
Sanitising here would corrupt legitimate text and imply a protection the rendering already
provides structurally.

## Regrouping — and being honest about it

`deriveBlocks` breaks a line on a gap of `BLOCK_GAP_MS` (320 ms), on `maxWords`, on an
emotion change and on `single`. A hand timing edit changes the gaps, so **it can merge or
split a caption line on screen.**

This is allowed, not guarded — the same decision `CaptionList`'s own header already records
for emotion and `single` edits ("re-group the list as you make them, which is the feature,
not a glitch": blocks are derived, never stored, so there are genuinely now more or fewer
lines in the video). Guarding it would mean either refusing a legal timing or storing a
grouping the schema has no home for (`lines[]` was proposed in audit 11 §6 and not landed).

The UI is made honest about it instead: the timing hint reads "A gap of 320 ms or more starts
a new caption line, so a big move can re-group the lines around it", with the constant
imported from `@captions/shared` rather than restated.

## Agent cohesion

- **No new reducer action**, so `APPLY_AGENT_PATCHES` needs no change and cannot fall behind.
  Asserted both ways in the check script.
- **One queue.** Both fields call `useWordPatch().patch`, the single `useWordPatchState`
  instance mounted by `WordPatchProvider`. No second queue, no second version ref.
- **`find_words`, `select_word_range`, `get_timeline` still behave.** Phase 1 changes no id
  and no ordering — the clamp exists precisely to preserve the array order all three read.
  `select_word_range`'s `enumerate(project.words)` and `get_timeline`'s array-order return
  remain correct. They would NOT survive phase 2 without care; see below.
- **Capability parity holds for phase 1.** The agent already has `set_text` and
  `shift_timing`, so it can do everything the new UI can. It is arguably *better* at one
  thing and *worse* at another: `shift_timing` moves several words at once, which the panel
  cannot; but it does **not** clamp against neighbours, so the agent can still break the
  ordering invariant the UI now protects. **Flagged for P4/P1** — the fix belongs in
  `word_tools.py` (P4) or, better, as a shared rule; `word-edit.ts` is the reference
  implementation and its numbers are in `check-word-edit.ts`.

## Phase 2 — designed, NOT built

Add / delete / split / merge word. Needs:
- **P1**: a new endpoint. `WordFields` cannot express an insert or a delete; the bulk route
  is a per-word patch list keyed by an existing `wordId`. Likely `POST`/`DELETE
  /projects/{id}/words` with the same version counter.
- **P4**: matching tools. **If phase 2 ships without them the agent becomes strictly less
  capable than the mouse** — you could split a word by hand and not by voice, in a
  voice-first product.
- **No schema change is required.** `Word.id` is `z.string()`, `words` is a plain array; an
  inserted word needs a fresh id and a splice, both of which the current schema allows. A
  `nextWordId(words)` helper mirroring `nextLayerId` is the whole of the minting.
- `select_word_range`/`get_timeline` keep working **only if the server inserts in playback
  order**, which must be part of the endpoint's contract, not left to the caller.

If any of that turns out to need a schema change, it stops and goes to the lead.

## Deliberately not built
- **Inline editing in the transcript** (double-click a word in `CaptionList`). The inspector
  already auto-switches to "This word" on selection and already holds the per-word controls;
  a second editing surface for the same field is a second commit point to get wrong. Add it
  if selecting-then-editing measurably slows people down.
- **Keyboard nav from the field to the next word** (Tab/Enter walking the transcript). Needs
  a selection-order API `useSelection` does not have. Add it with phase 2.
- **A drag handle on the timeline's caption ribbon.** `CaptionRibbon` only selects and seeks.
  `retimeWord` is the only piece a drag would need and it already exists.

## Files Created
- `apps/web/src/lib/word-edit.ts` — pure text/timing edit arithmetic.
- `apps/web/scripts/check-word-edit.ts` — 34 assertions over it.
- `.claude/audits/word-editing/phase-01-text-and-timing.md` — this file.

## Files Modified
- `apps/web/src/components/inspector/CaptionStylePanel.tsx` — **structural**: the per-keystroke
  text input replaced by `WordTextField`; `WordTimingFields`/`TimeInput` added; `SignalsSection`
  hint rewritten; `PerWordSection` takes `words` and `durationMs`.
- `apps/web/package.json` — **additive**: one `check:word-edit` script.

## Files Intentionally Untouched
- `packages/shared/` — lead-owned; no schema change was needed.
- `services/api/` (P1) — the text/timing case is frontend-only, as briefed.
- `services/api/app/agent/` (P4) — no new reducer action, so nothing to mirror.
- `remotion/` (P2) — renders from `Project`; the fields it reads are unchanged.
- `brag-output/` — pre-existing untracked directory, present before this work, left alone.

## Testing

**The pipeline bug this surfaced (P1's folder — diagnosed, NOT fixed).**
`pipeline/prosody.py:35` has a repair pass for degenerate ASR spans, written after
"Transcribe gave *What* a 10ms span", with `MIN_WORD_MS = 80`. It did not fire on
`6c437eb52961`. The reason is in its own bounds: `limit = out[i + 1]["startMs"]` fences the
repair at the next word, and it only acts `if new_end - new_start >= MIN_WORD_MS`. When
Transcribe emits a RUN of degenerate words, each one's fence is the next piece of junk —
`nine` had 10 ms of room, `seconds` 31 ms, `I` 22 ms — so none can reach 80 ms and all three
bail. **The guard repairs an isolated short word and is self-blocking on a run of them.**
Corroborating evidence from the stored signals: `nine` carries `loudnessZ: -9.64` and
`durationRatio: 0.02`, i.e. Transcribe anchored the word in silence. Downstream, 1.87 s of
real speech (20.03 s → 21.90 s) is left unclaimed. The fix belongs to P1 and is to repair a
RUN as a unit — redistributing the span from the last good word's end to the next good
word's start, which is the arithmetic `align.py:_fill_gaps` already performs for unmatched
words one file over. **Not attempted here: `services/api` is not P3's folder.**

**Unit / structural — `npm run check:word-edit`, 40/40 pass.** Counted from the run, by
section: the revision-1 regression reproduced on the real crushed run from `6c437eb52961`
(12), `retimeWord` over every listed edge case (7), the order invariant including a stress
pass that pushes every edge of every word to four extremes and re-asserts sortedness,
non-overlap, minimum span, in-video bounds and schema validity (6), `cleanWordText` (9), and
the write path including agent/hand equivalence (6).

`findBlockIndexAt` is **not** imported by the check script — its module reaches
`@/state/project-context`, a `.tsx` file jiti will not parse. Its *precondition* is asserted
instead, which is the thing a timing edit can actually break: blocks in ascending,
non-overlapping start order. The script also demonstrates the failure, asserting that WITHOUT
the ripple an out-of-order word violates it.

**Browser (fixture) — 23/23 pass, re-run against revision 2 in real headless Chrome
(153.0.8010.36).** Driven over CDP from a throwaway script (`ws` was already installed; no
dependency added). Asserted: the panel opens on selection; four keystrokes change nothing;
Enter commits once; one Ctrl+Z restores the whole word; empty is refused with the reason on
screen and nothing written; a typed space collapses and the note is shown; Enter
mid-composition writes nothing while Enter after `compositionend` commits Devanagari; End
moves half a second **even with the next word touching** (the revision-1 regression); Start
moves earlier and pushes what is before it; an impossible edit is refused and the panel says
"No room"; the rows stay in ascending time order; no console errors and the reducer never
rejected a candidate project. The revision-1 run of this suite (27 assertions, clamp
semantics) is superseded — it is what caught the two bugs listed in §"Two bugs", but its
timing assertions no longer describe the code.

**Browser (REAL project, REAL API) — 7/7 pass.** Against `localhost:5173` and the running API
on `localhost:8010`, on project `6c437eb52961`: selected the crushed 10 ms word `nine`,
confirmed the panel showed `19.65`/`19.66`, stretched End to `20.40` (**the edit that was
frozen in revision 1**), confirmed the neighbouring words moved, then **re-fetched the
document over HTTP** and confirmed the change reached the server and that the stored words
were still in playback order. The project was restored to its exact original timings
afterwards and the restore verified by re-fetch.

**Also run, all passing:** `npm run build` (`tsc -b` + vite, clean), `npx oxlint` (exit 0;
21 warnings, all pre-existing, none in the changed files), and the three sibling scripts
`check:captions`, `check:agent`, `check:layers` — unchanged and still passing.

**Not run: the agent's Python test scripts.** Nothing they cover was touched — `git status`
shows no file outside `apps/web/`. Stated rather than silently skipped.

## Live Verification
- **Against a real browser, real app, real project data:** everything in the browser block
  above. This is a real Chrome rendering the real editor, not a simulation.
- **Against a real live service (revision 2):** the timing edit was driven in a real browser
  against the **running API on `localhost:8010` and real DynamoDB**, on real project
  `6c437eb52961`. Asserted by re-fetching the document over HTTP afterwards: the edit reached
  the server (`20400` present in the stored word) and the server document was still in
  playback order. This closes the gap revision 1 declared open. The project was **restored to
  its exact original timings** afterwards (verified by re-fetch).
- **Against a real installed package/API, no network:** the shared schema (`Project.parse`
  over the fixture), `deriveBlocks`, and the real reducer.
- **Still NOT verified:** the 409 conflict/resync path, and S3.

## Unverified / Untestable
- The 409 conflict/resync path (not provoked).
- `has_manual_edits` flipping on a real DynamoDB row. Traced in source
  (`store/projects.py:240` → `routers/projects.py:86`); the write path it hangs off IS now
  confirmed live, but the flag itself was not read back.
- A real hardware IME. Composition events were **synthesised** (`CompositionEvent` dispatched
  from the page), which exercises the handlers but is not a person typing on a Devanagari
  keyboard. Worth one manual pass before the demo.

## Integration Status
- Editor UI: **connected** — works today.
- Persistence: **connected by reuse, not observed** — same `patch()` path as every other
  per-word field.
- Agent: **connected** — no new action; `APPLY_AGENT_PATCHES` covers both fields, asserted.
- Phase 2: **waiting on P1** (endpoint) and **P4** (tools).

## Dependencies / Blockers
None for phase 1. For phase 2: P1 endpoint, then P4 tools.

## Deviations
The brief stated no UI edits word text. One did (`CaptionStylePanel.tsx`), badly. It was
replaced rather than duplicated — otherwise there would have been two text inputs for one
field with different commit rules.

## Git / Change Scope
Branch `master`. **Committed by the repo owner as `6f998b5` ("yuhh final agent stuff")**
while revision 2 was being verified; corrections to this document landed after it and are
the only thing outstanding. Not pushed at time of writing.

The implementation is 4 files: `apps/web/src/lib/word-edit.ts` (129 lines, new),
`apps/web/scripts/check-word-edit.ts` (200, new),
`apps/web/src/components/inspector/CaptionStylePanel.tsx` (+311/-11) and
`apps/web/package.json` (+2/-1). Every path is under `apps/web/` except this audit and the
`.claude/INDEX.md` row.

**Flagged, not ours:** `6f998b5` also swept in `brag-output/` — 200+ KB of generated
`.jpg`/`.html`/`.md` artefacts from an unrelated tool. It was untracked and pre-existing at
the start of this work and was deliberately left alone here; it is now in the repo's history.
Worth a `git rm -r --cached brag-output/` plus a `.gitignore` entry if that was not intended.

No `.env` was created, read into the diff, or committed.

## Next Steps
1. **P1 (highest value)**: fix the `prosody.py` repair to act on a RUN of degenerate words,
   not just an isolated one. This is the actual cause of the bad captions users see; the
   editor fix only lets them repair it by hand.
2. **P3**: one manual pass with a real Devanagari IME before the demo.
3. **P1**: add `min_length=1` to `WordFields.text` so the REST route and `SetTextArgs` agree.
4. **P4 / P1**: `shift_timing` does not ripple or clamp against neighbours and can still break the
   ordering invariant. Port `retimeWord` from `apps/web/src/lib/word-edit.ts`.
5. **Lead**: decide whether phase 2 (add/delete/split/merge) is in scope for the MVP at all.
