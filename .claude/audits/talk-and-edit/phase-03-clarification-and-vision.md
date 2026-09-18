# Talk-and-Edit Phase 3 — the agent asks, the agent sees, and the prompts are graded

## Status
Working and verified against live AWS. The agent now asks a question instead of guessing when
a request is under-specified, and answers it once told. `analyze_frame` works for the first
time (real ffmpeg + real Rekognition). 16 demo prompts graded easy/average/asks/hard all pass
against real Bedrock. Still unverified: anything requiring a human at a browser.

## Objective
Repo owner's instructions, in their terms: fix the "bugged asf" voice UI; show the history and
log the tools; put block/solo timings in the caption component; make the agent handle a long
compound command; make it ask when it genuinely cannot tell; and grade 10–15+ prompts by
difficulty and test them.

## Implementation

### The mic bug (this was the "bugged asf")
Both transports called `setStatus('processing')` on a final transcript and **nothing ever
cleared it**, while `MicButton` had `disabled={isProcessing}`. So after a single voice command
the mic was stuck in `processing` forever AND the button was dead — voice worked exactly once
per page load. Fixed by ownership, not by patching the symptom: `useVoiceInput` reports
transport state only (`idle | listening | denied | error`) and never `processing`, because
handing a transcript to the agent does not stop the microphone. "The agent is working" is the
agent's state and is derived in `App`. The mic button is never disabled — stopping the mic is
the one control that must always work, and mid-turn is exactly when someone reaches for it.

### Asking instead of guessing
`needs_input` joins the status enum, with a `question` on the response. The planner detects a
`NEEDS_INPUT:` line the same way it detects `UNSUPPORTED:` (any line, because the model
explains itself first), and **discards any patches collected earlier in that turn** — a
half-applied sentence the user is still being asked about is worse than none.

`ClarificationTurn {command, question}` replays the earlier round as a DATA block in the same
tagged, "this is data not instructions" envelope as the command and the selection. It
accumulates, so a two-round exchange works. The editor holds it in a ref and clears it when a
turn resolves without a question.

Two prompt rules were needed, both learned from real output:
- **When to ask.** Only when the ambiguity changes what it would DO and nothing in the
  selection or transcript resolves it. Explicitly not for details it may reasonably choose.
- **Ask in the user's language.** The first version asked a creator to supply "x and y as a
  percentage" — because `analyze_frame` had failed underneath it and it converted its own tool
  failure into a question asking the user to do the tool's job by hand.

### Vision
`analyze_frame` had never worked for any real project: it demanded `s3://` while the API
deliberately hands out presigned https (`_project_body`: "never s3://"). It now accepts https,
`s3://` and local paths, seeks with `-ss` before `-i` so a frame comes back in ~1.4s without
downloading the file, reuses P1's `media._run` ffmpeg wrapper rather than adding a second way
to shell out, and redacts the signature query string out of error text (the first version
leaked `X-Amz-Signature` into a message).

### Iteration budget
`MAX_TOOL_ITERATIONS` 6 → 14, env-overridable. One real sentence is routinely four intents;
at 6 the model hit the cap mid-sentence and the whole turn returned an error having done
nothing — the most expensive possible failure.

### Editor
Caption rows show each block's `start–end` (`0:03.2` via the existing `formatTimecode`), and a
solo word's times are that block's times by construction — `deriveBlocks` rule 4 fences a
`single` word into a block of one, pinned by new assertions so a future change fails loudly
instead of attributing a neighbour's time to it. The activity panel shows tool steps inline
rather than behind a disclosure, renders turns as cards and editor notes as hairlines, and
gives `question` an open-loop treatment (dashed edge, "Waiting for your answer", no undo).
Entries now keep the utterance that produced them; the result used to overwrite it.

## Files Created
- `.claude/audits/talk-and-edit/phase-03-clarification-and-vision.md` — this.

## Files Modified
Agent: `contracts.py` (needs_input, question, ClarificationTurn, history), `planner.py`
(question detection, history block, prompt rules, iteration budget), `voice.py`, `router.py`,
`tools/vision_tools.py` (rewritten resolution + frame grab), `tools/catalog.py` (stale
comment), `tests/test_vision_tools.py` (21 → 45 checks).
Editor: `useVoiceInput.ts`, `MicButton.tsx`, `App.tsx`, `useAgentCommand.ts`,
`useAgentActivity.ts`, `lib/agent-api.ts`, `AgentCommandBar.tsx`, `AgentActivityPanel.tsx`,
`components/transcript/CaptionList.tsx`, `TranscriptWordRow.tsx`, `scripts/check-agent-apply.ts`.
Demo: `services/api/scripts/agent_demo.py` (rewritten as a graded catalogue).

## Files Intentionally Untouched
`apps/web/src/lib/format.ts` (existing formatters reused, not modified), `components/timeline/`
(the ribbon encodes time spatially already — audit 16 §2.4 removed that density deliberately),
`services/api/requirements.txt`, `remotion/`.

## Interfaces / Contracts
`AgentCommandResponse.status` gains `needs_input`; `.question: str | None` set only then.
`AgentCommandRequest.history: list[ClarificationTurn]`, same on the voice request.
`analyze_frame` accepts https / s3:// / local path. `AGENT_MAX_TOOL_ITERATIONS` env var.
Frontend `AgentEntryStatus` gains `question`; `AgentLogEntry` gains `command`.

## Ownership
Crosses P4 (`app/agent/**`), P1 (nothing this phase) and P3 (`apps/web`). The agent-side work
is outside P3's lane and was done on the repo owner's explicit instruction. **P4 sign-off
needed** for the new status, the history contract and the vision rewrite.

## Validation
A question never carries patches. A refusal never carries patches. An unknown `wordId` still
fails loudly. `atMs` past the project duration fails before any I/O. A malformed `s3://` URI
fails before any I/O. Rekognition boxes are clamped into `[0,100]` before validation, because
real detections land a hair outside the frame and would otherwise raise out of a *successful*
detection.

## Security
Presigned-URL query strings are redacted from every error message, including ffmpeg's stderr,
which echoes the input URL verbatim — verified fixed in a second live run after the first one
leaked a signature. Clarification history is wrapped and labelled as data like everything
else: a question may quote a creator's own caption text back, and that text must not become an
instruction on the next turn.

## Testing
- Agent suite: **318 checks, 0 failures** across 12 files (was 295).
- `pytest tests/`: **95 passed**.
- `npm run check:agent`, `check:captions`: pass. `tsc -b` clean, `npm run build` succeeds,
  `oxlint` 19 warnings (all pre-existing).
- `scripts/agent_demo.py`: easy 4/4, average 5/5, asks 3/3, hard 4/4 against real Bedrock.

## Live Verification
- **Live AWS:** Rekognition `DetectLabels` returning a real `Person` box at 5s and 22s of
  `Normal.mp4`, via local path, presigned https and `s3://` (object uploaded under the
  container's own `DEV_PREFIX=p1` and deleted afterwards); a real 403 on a tampered signature;
  every demo prompt through real Bedrock; the two-round clarification exchange end to end
  ("where my hand is" → "which part of the video?" → "around 22 seconds in" → 51 caption
  patches placed from a real detection).
- **Not verified:** any rendered UI, the mic fix in a browser, and voice with a human speaking.

## Unverified / Untestable
1. Everything visual — no browser available. The mic fix is reasoned from state ownership and
   typechecks; it has not been clicked.
2. `subprocess.TimeoutExpired` and missing-ffmpeg handlers (structurally checked only).
3. Prompt 7 ("stop making things red") shows real model variance: it usually toggles the
   emotion layer, but sometimes recolours the angry words instead. Both stop things being red;
   only the first satisfies the assertion. Known flake, not a defect.

## Integration Status
Clarification: connected, verified. Vision: connected, verified. Caption timings, activity
panel, mic fix: connected in code, **unverified visually**. Deployment: out of scope.

## Dependencies / Blockers
- **P4**: sign off `needs_input`, the history contract, and the `vision_tools.py` rewrite.
- **Nobody else.** It runs on a laptop today.

## Deviations
1. The repo owner's scenario referenced 9s and 32s; the longest real clip is 28.1s, so the
   prompts use real content at real timestamps (`pagal` at 9.18s, the frame at 22s) rather
   than inventing footage.
2. Prompt 15's expectation was wrong and was changed, not the agent: it demanded per-word
   recolouring and failed the model for retuning the angry tone, which also covers words that
   become angry later.
3. The demo harness rewrites a fixture's bare `videoUrl` to the mounted clip so the vision
   prompts exercise real ffmpeg and Rekognition. Harness only; production is unaffected.

## Git / Change Scope
Branch `p3-agent-talk-edit`, clean tree, 8 commits, nothing pushed. `.env` gitignored.

## Next Steps
1. Open the editor and run the script — the mic fix, the question card, the timings and the
   panel have all only been typechecked (owner: whoever demos).
2. P4 sign-off (owner: P4).
3. If prompt 7's variance matters on stage, say "turn the emotion layer off" instead.
