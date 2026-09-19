# Talk-and-Edit Phase 8 — three ways the editor did the opposite of what was asked

## Status
All three fixed and verified: the scope rule against live Bedrock (3/3 runs, plus a reproduction of
the original failure), the colour rule by unit assertions on the real resolver and in a real
browser, the reset tool end to end through the HTTP route with the wire bytes inspected.
**Not verified:** the colour fix's appearance in an exported MP4; whether the agent's new asking
behaviour is well-calibrated across many phrasings (3 runs of one phrasing is not a measurement).

## Objective
Three defects reported by the repo owner from real use:
1. "I asked it to change only 'birthday' to blue but the whole caption turned blue."
2. "Single word colour changes are not there."
3. "If I ask to go back to the original preset, add that function too."

## Implementation

### 1. The agent widened a restriction it could not resolve
The activity log is the evidence, and it exonerates the agent's honesty while damning its
judgement. What the recogniser delivered was:

> "Hello. Uh, I want you to make all the words which are **but the two** red color No, actually
> change it to blue color Hello."

"birthday" arrived as "but the two". The agent could not resolve the restriction, so it dropped it
and applied blue to all 94 words — then said so plainly. **The transcription is the root cause; the
scope-widening is the bug.** Dropping a restriction inverts the instruction: the user asked for a
subset and got the whole transcript.

Two changes:
- **`find_words` gained `matchType: "fuzzy"`** (stdlib `SequenceMatcher`, ratio ≥ 0.78, also trying
  the query with spaces removed). It rescues near-misses — "birth day" and "birthdey" both find all
  five "birthday"s — and correctly finds nothing for "but the two", which is too far gone. Fuzzy is
  a suggestion, never an action.
- **A new prompt rule, SCOPE IS THE MOST IMPORTANT PART OF THE SENTENCE.** If the restriction
  cannot be resolved, ask; never fall back to every word. It also tells the model that every
  command may have come through a recogniser, so a target missing from the transcript most likely
  means *misheard*, not *everything* — and to quote back what it could not find.

### 2. A per-word colour was written, saved, and invisible
Reproduced precisely: in the inspector's **This word** scope, a plain word shows a Colour row and an
**emphasised** word does not — its Fill reads "Gradient", and clicking "Solid" does nothing at all.

The cause is one line in `resolveWordStyle`: `{ ...presetLayers, ...word.style }`. Under a preset
whose *emphasis* layer is a gradient — `hinglish-bold` is `{ gradient: ['#FF7A00','#FF2D55'] }`,
`chamak` is a 7-stop gradient — an emphasised word inherits that gradient, and **a gradient fill
paints over `color`** (the `glowColor` comment three lines below says exactly this). So the colour
merged in and was never seen. The panel then hid the Colour row because it read the mode from the
inherited value, and "Solid" wrote `gradient: null`, which only removes *this scope's* override and
let the inherited gradient straight back.

This hit the agent as hard as the inspector: **"make the word bekaar red" on an emphasised word
wrote a colour that changed no pixels.**

The rule: **a word's own colour beats a gradient it merely inherited.** Setting a colour on one word
is the narrowest, most deliberate signal there is; a preset's conditional layer is the broadest. A
word that wants a gradient still says so itself and keeps it. Checked against the data first: no
project in the account carries pipeline-set per-word colours (only one does, from a past edit), so
an explicit colour is always a deliberate choice.

The panel now reads the fill mode from the narrowest signal that is set, and "Solid" writes the
colour explicitly instead of clearing a key.

### 3. "Go back to the original preset" could not be expressed at all
The reducer has understood a whole-object null since the override landed
(`mergePresetOverride(current, null)`), and `check-agent-apply.ts` already asserted it. But
`SetPresetOverrideAction.override` was not nullable, so the agent could not say it. Resetting meant
enumerating every override key and every word — many calls, easy to leave half-done.

New tool **`reset_styling(scope, wordIds?)`**: `preset_tweaks` (the conditional layers),
`word_styles` (per-word overrides, optionally just some words), or `everything` (the default, and
what people mean). It deliberately does **not** change which preset is selected — that is
`apply_preset`, and "back to normal" almost never means "and also switch preset". It emits ordinary
patches, so one Ctrl+Z undoes the whole reset.

**A bug this shipped with, caught on the wire and not in a test:** `override: null` was stripped by
`response_model_exclude_none=True`, so the client received `{"type":"SET_PRESET_OVERRIDE"}` with no
key — and the reducer clears on `=== null` but would have thrown on `undefined`. Fixed with the
same wrap-serializer trick `cleared` already uses (contracts.py), which writes the null back after
exclusion runs. The reducer now also treats an absent override as a clear rather than throwing.

## Files Created
- This audit.

## Files Modified
Structural:
- `services/api/app/agent/planner.py` — the SCOPE prompt rule.
- `services/api/app/agent/contracts.py` — `override` nullable + wrap serializer.
- `services/api/app/agent/validation.py` — a null override clears rather than merging.
- `services/api/app/agent/tools/project_tools.py` — `reset_styling`.
- `apps/web/src/lib/caption-style.ts` — own colour beats an inherited gradient.
- `apps/web/src/components/inspector/StyleSections.tsx` — fill mode from the narrowest signal.

Additive:
- `services/api/app/agent/tools/schemas.py` — `fuzzy`, `ResetStylingArgs/Result`.
- `services/api/app/agent/tools/context_tools.py` — `_fuzzy`.
- `apps/web/src/state/project-reducer.ts` — absent override does not throw.
- Tests: `test_contracts.py`, `test_tool_registry.py`, `check-caption-style.ts`, `check-agent-apply.ts`.

## Files Intentionally Untouched
- `packages/shared/src/project.ts` and `app/schema.py` — no schema change. `PresetOverride` and
  `Style` are unchanged; only what the AGENT may say about them moved.
- The renderer's gradient painting. The precedence belongs in the resolver, which the editor and
  the Remotion export both call, so both change together and the drift guard still passes.

## Architecture
```
resolveWordStyle:   presetLayers  <—  word.style          (unchanged merge)
                    then: word owns a colour and no gradient of its own?
                          → drop the INHERITED gradient, keep the colour
reset_styling:      SET_PRESET_OVERRIDE {override: null}   → clears every conditional layer
                  + UPDATE_WORD per styled word, every style key null
```

## Interfaces / Contracts
- `FindWordsArgs.matchType` gains `"fuzzy"`. Additive; the default is unchanged.
- `SetPresetOverrideAction.override` is now `AgentPresetOverridePatch | None`. Widened, not narrowed.
- New tool `reset_styling`, registered AVAILABLE and added to the approved set in
  `test_tool_registry.py` (which caught the addition — the guardrail works).
- `ResolvedStyle.gradient`/`gradientStops` may now be `undefined` where they previously carried an
  inherited value. Only when the word sets its own colour.

## Ownership
- `services/api/app/agent/**` — **P4**. The prompt rule, the contract, the new tool. Needs sign-off.
- `apps/web/**` — P3, in lane.
- No lead/schema involvement: nothing in `packages/shared` or `app/schema.py` changed.

## Validation
- A restriction that cannot be resolved produces a question, never a whole-transcript write.
- An emphasised word with no colour of its own still renders the preset's gradient.
- `reset_styling` refuses when there is nothing to reset, and rejects unknown word ids.

## Security
No new endpoints, dependencies or credentials. `_fuzzy` is stdlib and runs on the project already in
the request. The new tool only emits patch types that already existed and pass the same validation.

## Testing
- Agent suite: 12 modules pass, including 3 new contract assertions for the wire null.
- pytest **128 passed**. Web: `check:agent` (+1), `check:captions` (+7 for the colour rule), `tsc -b`,
  `npm run build`, remotion drift guard — all clean.

## Live Verification
- **The reported utterance, verbatim, against live Bedrock, 3 runs:** one inferred "birthday" and
  said the mic had misheard; two asked which word was meant. **None touched all 94 words.** Before
  the fix the same input produced a 94-word write (reproduced) or a whole-tone recolour.
- **Fuzzy, against the real 94-word project:** `birth day` → 5, `birthdey` → 5, `birthday` → 5,
  `but the two` → 0, `zzzz` → 0.
- **Colour, in a real browser:** the emphasised word "jaante" had no Colour row and clicking "Solid"
  changed nothing; after the fix the row is present and the control writes.
- **Resolver, on the real presets:** emphasised + no own colour → gradient kept; + own colour →
  `color=#00FF00, gradient=undefined`; + own gradient → its own gradient kept; plain word unaffected.
- **`reset_styling` through the HTTP route:** "go back to the original preset" → one tool call, 95
  patches, and the wire bytes read `{"type":"SET_PRESET_OVERRIDE","override":null}` — inspected,
  not assumed, because the first version of it shipped with that null stripped.

## Unverified / Untestable
1. Whether the exported MP4 shows the recoloured word. The export calls the same resolver, so it
   should, but no render was made with a per-word colour on an emphasised word.
2. Calibration of the new asking behaviour. Three runs of one sentence; "reset just the word
   birthday" now asks which of the five instances, which is defensible but arguably over-cautious.
3. The 0.78 fuzzy threshold is tuned on a handful of examples, not measured against real
   recogniser output at scale.
4. Nobody has spoken any of this into a real microphone.

## Integration Status
All three connected and exercised end to end. The colour rule is shared with the Remotion export by
construction; that path is untested.

## Dependencies / Blockers
P4 sign-off on the prompt rule, the widened contract and the new tool.

## Deviations
- The fuzzy matcher was not asked for. The reported failure is a transcription failure, and a
  voice-first editor that cannot tolerate a misheard word will keep producing this class of bug.
- I did not add a confirmation step for large edits, which the original plan (§10) suggested for
  >20 words. The honest fix is to stop the agent widening scope in the first place; a confirm on
  "make everything white" would be friction on a legitimate command.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `0c22940`. `git status` reviewed before commit; no `.env`,
no schema files, no lockfile churn.

## Next Steps
1. Export a project with a per-word colour on an emphasised word and look at the MP4 (owner: P2/P3).
2. Re-run the graded catalogue to check the new SCOPE rule has not made the agent ask too often
   (owner: P4).
3. Consider showing the heard transcript in the command bar *before* the turn runs, so a misheard
   word is visible while it can still be corrected (owner: P3).
