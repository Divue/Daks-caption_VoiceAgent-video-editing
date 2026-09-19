# Talk-and-Edit Phase 7 — playback commands were eating editing commands

## Status
Fixed and verified in a real (headless) browser driving the real voice path, with a control run
against the pre-fix code proving each assertion can fail. **Not verified:** a human at a real
microphone; the clarification-answer case end to end (the parser-level guard is unit-tested, the
full ask-then-answer round trip was not replayed).

## Objective
Review the work merged from `origin/master` (PRs #14 and #15) before building on it, and fix what
the review found. PR #15 added local playback commands inside `apps/web` — P3's folder — and the
author explicitly flagged them for P3 review. This is that review, plus the fixes.

## Implementation

### What the review found
The playback parser itself is strict and correct: `"stop making things red"`, `"play the word
bekaar in red"`, `"speed up the reveal"` and ~80 other adversarial phrases all fall through to the
agent. The defects were all in *when* it runs, not *what* it matches.

1. **A bare opener was eaten before the barge-in merge — a regression of phase 5.** The transport
   check sat at `useAgentCommand.ts:196`, the merge at `:222`. The recogniser ends a "sentence" at
   a mid-sentence pause, so `"stop… making things red"` arrives as two finals. The first was read
   as a playback command: the video paused and the agent received only `"making things red"`.
   This is the repo owner's own reported bug, reintroduced by a different route.
2. **A one-word answer to the agent's question was stolen.** The check never looked at
   `awaitingRef`. "How much bigger?" → `"double"` set the playback speed to 2× and left the
   question pending forever. Same for `faster`, `slower`, `mute`, `start`, `hold`.
3. **Recogniser-mishearing aliases applied to typed text.** `pass`, `paws`, `house`, `force`… exist
   to compensate for Sarvam garbling a spoken "pause". Typing `pass` paused the video.
4. **Space toggled playback inside a Radix `Select`.** The guard listed `INPUT|TEXTAREA|SELECT|
   BUTTON` and four roles; Radix renders a listbox as divs with `role="option"`, so Space both
   picked the option and played the video.
5. **Ducking was not re-applied when the `<video>` element was replaced** — and the new
   expired-link recovery makes replacement far more likely. A remounted element started at full
   volume while the mic was open, and the later un-duck wrote back a stale figure.
6. **`setMuted` lied when no video was attached** — it returned early and the user was told "Muted".

### The fix
A bare opener is now **provisional** rather than final. It still acts immediately — zero added
latency, which a debounce would have cost on every spoken "play" — but the words and an undo for
what it did are kept for `BARE_TRANSPORT_WINDOW_MS` (4 s). If the next utterance is *not* itself a
transport command, it is the rest of the sentence: the opener is merged back in with the existing
`mergeUtterances`, the player is put back the way it was, and the whole instruction goes to the
agent. If nothing follows, it was a real command and the words are dropped.

`isBareTransport` is the new, closed, single-word list that decides this. Anything carrying its own
object (`"stop the video"`) or argument (`"go to 5 seconds"`, `"1.5x"`) cannot be half a sentence
and is never provisional, so the phrases people are taught to say are unaffected.

Alongside: the transport branch is skipped while a question is pending; `parseTransportIntent` gained
`ctx.misheard`, passed only for `source === 'voice'`; the Space guard gained the Radix roles; the
duck is re-applied in `attachVideo`; `setMuted` returns whether it did anything.

## Files Created
- `apps/web/scripts/check-voice-barge-in.mjs` — the browser test below, in the repo this time.
- This audit.

## Files Modified
Structural:
- `apps/web/src/hooks/useAgentCommand.ts` — provisional openers; question guard; `misheard`.
- `apps/web/src/lib/voice-intents.ts` — `isBareTransport`; `ctx.misheard` gates both alias rules.

Additive:
- `apps/web/src/App.tsx` — Radix roles in the Space guard; honest mute outcome.
- `apps/web/src/state/playback-context.tsx` — re-duck on attach; `setMuted` returns a boolean.
- `apps/web/scripts/check-agent-apply.ts` — +5 assertions.

## Files Intentionally Untouched
- `apps/web/src/hooks/useVoiceInput.ts` — the transport emits finals correctly; deciding what a
  final *means* belongs where turns are owned, exactly as in phase 5.
- `apps/web/src/components/preview/CaptionRenderer.tsx` — the `em`-gap fix from PR #15 is correct
  and stays. Its remaining imprecision (the row gap follows `words[0]`'s own size, so resizing the
  first word of a block changes the whole row's spacing) is noted, not fixed: it is cosmetic and the
  file is now shared with P2's export, so changing it costs a re-verification of the drift guard.
- `services/voice-agent/**` — the Sarvam provider is P4's and was not in question.

## Architecture
```
voice final ─► run()
   filler? ─────────────────────────► ignored, a pending opener SURVIVES ("stop … um … red")
   anything else ──► consume pending opener
        undo/redo ─────────────────► acts, opener discarded
        question pending? ─────────► transport is SKIPPED; this is the answer
        transport?
           bare  ──► act + remember (words + how to undo)   ─┐
           explicit ──► act, nothing remembered              │ 4 s
        not a transport ──► was an opener remembered? ◄──────┘
                              yes → merge, put the player back, send ONE command
```
NEW: `isBareTransport`, `bareTransportRef`, the 4 s window. REUSED: `mergeUtterances` and the whole
phase-5 turn state machine, untouched.

## Interfaces / Contracts
- `parseTransportIntent(text, ctx?)` — `ctx` gains `misheard?: boolean`. **Behaviour change:** the
  mishearing aliases no longer fire without it. Every existing caller is in this repo and updated.
- `isBareTransport(text: string): boolean` — new, pure, exported.
- `PlaybackContextValue.setMuted` returns `boolean` (was `void`). Additive for callers that ignore it.

## Ownership
All of `apps/web/**` — P3, in lane. Nothing else in this audit's scope.

## Validation
- A bare opener acts immediately; latency is unchanged.
- An opener that is continued leaves the player where it started and the agent with one command.
- An opener that is *not* continued stays acted-on; the words expire after 4 s.
- Two deliberate commands in a row never merge.

## Security
No new endpoints, dependencies or credentials. Narrows behaviour rather than widening it: typed
text no longer triggers speech-error heuristics. `playwright` is deliberately **not** added as a
dependency — the new script resolves it at runtime and exits 2 with instructions if absent.

## Testing
- Web: `tsc -b` clean, `npm run build` clean, `check:agent` **140 checks** (was 135) + `check:captions`
  pass, oxlint **18** (baseline 19, not worse).
- Backend re-run because `render.py` changed in the same commit: pytest **128 passed**, agent suite
  12 modules all pass, remotion drift guard passes.

## Live Verification
`apps/web/scripts/check-voice-barge-in.mjs`, headless Chromium against the running stack, driving
the **real voice path** (LiveKit's token endpoint aborted so the hook falls back to browser speech,
whose recogniser is stubbed so finals can be emitted at an exact moment). **9/9 passed.**
- The reported case: `"stop"` pauses; `"making things red"` 0.9 s later → the agent received
  **`"stop making things red"`** and the video **resumed**.
- `"stop the video"` pauses, stays paused, never reaches the agent.
- `"play"` then `"mute"` both act and do not merge.
- **Control against the pre-fix code: 7/9 — the agent received `"making things red"` and the video
  stayed paused.** The two assertions that matter fail without the fix, so the test is real.

A trap worth recording: headless Chromium exposes an **unprefixed** `SpeechRecognition`, and the
hook prefers it, so stubbing only `webkitSpeechRecognition` silently tests nothing. The first run of
this test passed its setup assertion while the app was using the real recogniser.

## Unverified / Untestable
1. A human at a real microphone. Every spoken result here is a stubbed recogniser or TTS.
2. The clarification case end to end. The parser guard is asserted; an actual "agent asks → user
   answers 'double'" round trip against live Bedrock was not replayed.
3. Whether 4 s is the right window. It is a judgement about how long people pause mid-sentence, not
   a measurement; nobody has timed real pauses.
4. The duck-on-remount fix is reasoned from the code and typechecked, not reproduced in a browser —
   forcing a mid-session `<video>` remount needs a link expiry that headless cannot age into.

## Integration Status
Connected and browser-verified: provisional openers, merge, revert, explicit commands, Space guard.
Connected but not browser-verified: the question guard, the duck re-apply, the mute return value.

## Dependencies / Blockers
None. The `apps/web` changes in PR #15 that this reviews are hereby P3-reviewed; the `CaptionRenderer`
word-gap change is accepted as-is.

## Deviations
- The review was asked for; the fixes were then requested explicitly by the repo owner.
- `render.py` and `remotion/` changes ride in the same commit but are audited separately under
  `.claude/audits/export/phase-01-containerised-render.md` — different owners, different evidence.
- I did not take the reviewer's suggestion to debounce bare openers. A 600 ms delay on every spoken
  "play"/"pause" is a worse demo than the bug is, and it would not even have caught the reported
  case, where the second half arrived seconds later.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `92ef3fb`. `git status` reviewed before commit: exactly the
files listed above plus the export audit's files; no unrelated files, no `.env`, no lockfile churn.

## Next Steps
1. Speak the reported sentence into a real microphone with a real pause (owner: whoever demos).
2. Replay "make it bigger" → "how much?" → "double" against live Bedrock to close the one
   unverified guard (owner: P3).
3. Decide whether `playwright` should become a real devDependency so this test runs in CI — two
   separate bugs now have been findable only in a browser (owner: lead).
