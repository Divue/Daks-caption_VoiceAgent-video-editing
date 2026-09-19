# Talk-and-Edit Phase 5 — a pause is not the end of an instruction

## Status
Fixed and verified in a real (headless) browser against the running stack and live Bedrock,
using the repo owner's exact reported utterance. Five defects in the barge-in path, plus two agent
behaviour defects the reproduction exposed. **Not verified:** the voice transport itself for this
case — the turn runner is source-agnostic and was driven through the text input; nobody spoke.

## Objective
Reported by the repo owner: saying "hey increase the size of the white font", pausing, then
"from 10 s marker to 12 s" made the agent act on **only the second half**. The first instruction
was lost. Fix it, and fix the related edge cases.

## Implementation

### The reported bug and four more in the same path
All in `useAgentCommand.run`, found by reading it against the report rather than patching the
symptom:

1. **The first half was thrown away (reported).** A new utterance aborted the in-flight turn and
   started a new one with only the new words. The recogniser endpoints on silence, so a
   mid-sentence pause turned one instruction into two — and the second replaced the first.
2. **`busy` lied.** The aborted turn's `finally` set `busy: false` unconditionally while its
   successor was still running: the input unlocked and Cancel disappeared mid-turn.
3. **"Never mind" undid the wrong thing.** Mid-turn it dispatched `UNDO`, reverting the user's
   previous *finished* edit, and then let the in-flight turn land anyway — the opposite of both
   things the user meant.
4. **False history.** The aborted turn wrote "— cancelled" on an entry that had in fact been
   continued, and the continuation appeared as a second, separate turn.
5. **Two utterances during one write raced.** Both waited on the applying turn, both then
   started turns, and one entry was left on "pending" forever.

### The fix — an explicit turn state machine
A turn is `requesting` (waiting on the agent; nothing written) or `applying` (writing patches).
- **Barge-in while `requesting`** merges: the new words are appended to the old
  (`mergeUtterances`), the old request is aborted, and the same history entry continues. This is
  safe precisely because the agent is stateless and only *returns* patches — aborting it writes
  nothing.
- **An utterance while `applying`** waits for the write to finish and only then decides who owns
  it, with no `await` between the decision and claiming the turn, so concurrent waiters merge
  into one turn instead of racing.
- **Every state or entry update is guarded** by "am I still the current turn?", so a replaced or
  cancelled turn goes silent.
- **"Never mind" / "undo" while `requesting` cancels** the turn ("Cancelled — nothing was
  changed") and does NOT dispatch `UNDO`. While nothing is running it still undoes as before.

`mergeUtterances` also absorbs the recogniser's habits: it drops the "." it inserts at a pause
(keeping "!" and "?", which were said on purpose), ignores a repeated final, and when an engine
re-sends the whole utterance extended, takes the longer version instead of doubling it.

### What the reproduction exposed in the agent
With both halves reaching the agent, it resized **all six** words in 10–12 s — three of which are
angry and render red, not white. `get_timeline` deliberately stripped `emphasis` and `emotion`
("a targeting step doesn't need" them), so the agent could not tell which words were white.
`TimelineWord` now carries `emphasis`, `emotion`, `colorOverride` and `fontSizeOverride`, and the
prompt says how to derive a word's rendered colour from those plus `<active_preset>`.

That surfaced two over-asking behaviours, both fixed in the prompt:
- **"How much bigger?"** An unstated amount is the agent's to choose. The prompt now gives
  concrete defaults (bigger ≈ 30 %, a lot ≈ 70 %, a little ≈ 15 %, move ≈ 10 % of frame, shake 4).
- **"Did you mean a different shade — it's already red?"** When the user names a value for
  specific words that already look like it, the agent now applies it explicitly and says so,
  because the current look may come from the preset and the instruction should survive a preset
  change.

## Files Created
- This audit.

## Files Modified
Structural:
- `apps/web/src/hooks/useAgentCommand.ts` — rewritten around the `Turn` state machine.
- `services/api/app/agent/tools/schemas.py` — `TimelineWord` gains four appearance fields.
- `services/api/app/agent/planner.py` — appearance-targeting, default-amount and
  already-looks-that-way rules.

Additive:
- `apps/web/src/lib/voice-intents.ts` — `mergeUtterances`.
- `services/api/app/agent/tools/context_tools.py` — `_timeline_word` shared by both tools.
- `apps/web/scripts/check-agent-apply.ts` — 8 merge assertions.
- `services/api/app/agent/tests/test_context_tools.py` — 6 appearance-field assertions.

## Files Intentionally Untouched
- `apps/web/src/hooks/useVoiceInput.ts` — the transport was not the bug; it correctly emits each
  final. Merging belongs where turns are owned.
- `apps/web/src/hooks/useWordPatch.ts` — the write queue's no-abort-mid-chain rule is why the
  `applying` stage waits instead of cancelling; it needed no change.
- No schema change: `TimelineWord` is an agent tool contract, not part of `Project`.

## Architecture
```
utterance ─► run()
               ├─ filler / "stop listening"            → handled, no turn
               ├─ "never mind" while requesting         → cancel turn, NO undo
               ├─ wait while a turn is applying         (then decide — no await after deciding)
               ├─ turn requesting?  → merge text, abort old request, continue SAME entry
               └─ otherwise         → new entry, new turn
turn: requesting ──(agent answers with patches)──► applying ──► done
        ▲ replaceable / cancellable                  ▲ runs to completion
```
NEW: the `Turn` state machine and `mergeUtterances`. REUSED: `AbortController` for the request,
the existing write queue for `applying`, the existing history-entry API.

## Interfaces / Contracts
- `mergeUtterances(previous: string, next: string): string` (pure, exported).
- `TimelineWord` returned by `get_timeline` / `find_words` gains
  `emphasis: bool`, `emotion: str`, `colorOverride: str | None`, `fontSizeOverride: float | None`.
  Additive — every existing field is unchanged.
- `useAgentCommand` public API unchanged: `{busy, pendingCommand, awaitingAnswer, run, cancel,
  dismissQuestion}`.

## Ownership
- `apps/web/**` — P3, in lane.
- `services/api/app/agent/**` — **P4**; needs sign-off (tool contract field additions, prompt).

## Validation
- A merged turn reuses its entry; a cancelled turn writes exactly one "Cancelled — nothing was
  changed" entry; an aborted request never writes an entry.
- `applying` is never aborted and never merged into.
- `mergeUtterances` returns the longer of two cumulative finals and ignores an exact repeat.

## Security
No new endpoints, credentials or dependencies. `TimelineWord` exposes only data already in the
`Project` the client sends. Merged text goes through the same `<user_command>` data envelope as
any command.

## Testing
- Agent suite **324 checks, 0 failures** (was 318; +6 appearance assertions).
- `pytest tests/`: **95 passed**.
- Web **72 assertions** (`check:agent` + `check:captions`; +8 merge), `tsc -b` clean,
  `npm run build` clean, oxlint **19** (unchanged baseline).
- `scripts/agent_demo.py` against real Bedrock: **easy 4/4, average 6/6, asks 3/3, hard 4/4**.

## Live Verification
Headless Chromium against the running stack, with the first agent request held for 5 s so the
second utterance lands mid-turn — exactly what a pause does:
- **Reported case:** the second request carried `"hey increase the size of the white font from
  10 s marker to 12 s"`; `busy` stayed true; one turn in history; no false "cancelled".
- **Agent result (live Bedrock):** resized exactly `w21 kaam`, `w22 karte`, `w23 karte` — the
  white words — and left the red `chuke`, `hain`, `bhai` alone. Before the appearance fix it
  resized all six.
- **"Never mind" mid-turn:** the held "make everything blue" never landed, the earlier yellow edit
  survived, history says "Cancelled — nothing was changed", no "Undid the last change".
- **Duplicate final:** a repeated "make the word pagal red" was sent once, not doubled.

## Unverified / Untestable
1. **Spoken input.** The state machine is shared by voice and text; it was driven through text.
   How often a real recogniser splits one sentence into two finals was not measured.
2. The two-waiters-during-a-write race was fixed by construction (no `await` between deciding and
   claiming) but not reproduced in the browser — writes in fixture mode are instant.
3. Merging typed commands follows the same rule as voice; whether a user who hits Enter twice
   quickly always *means* one instruction is a judgement, not a measurement.

## Integration Status
Barge-in merge, cancel, busy, history: connected and browser-verified. Appearance targeting:
connected and verified against live Bedrock. Voice transport for this case: connected, not
spoken to.

## Dependencies / Blockers
P4 sign-off for the `TimelineWord` fields and the prompt rules.

## Deviations
- The fix went beyond the reported bug to the four other defects in the same function, per the
  instruction to "fix more edge cases related to it".
- The appearance-targeting change was not requested; the reproduction showed the reported
  command still produced the wrong video after the merge was fixed, so it was in scope for
  "the agent should do what the user said".

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `0b0bdff`. `git diff --stat` before commit: exactly the 7
files listed above; no unrelated files.

## Next Steps
1. Speak the reported sentence with a real pause and confirm the merge (owner: whoever demos).
2. Consider a short coalescing window for voice finals (~600 ms) to avoid starting a turn at all
   for quick double-finals; today they are correctly merged but cost one aborted request.
3. P4 sign-off.
