# Talk-and-Edit Phase 2 — voice actually transports words, and the demo is in the UI

## Status
Working and verified end to end on localhost. Synthesised speech goes into a real LiveKit
room, comes back as a real AWS Transcribe streaming transcript, and that transcript drives
a real Bedrock turn that produces the correct patches. The whole stack runs from
`docker compose up -d` plus `npm run dev` with **no LiveKit account**. Still not verified:
anything requiring a human at a microphone in a browser (see Unverified).

## Objective
Phase 1 left voice wired but never exercised: no LiveKit credentials existed, so the editor
always fell back to browser speech recognition and no part of the transport had ever moved a
word. The instruction was to make it live on localhost, actually test LiveKit, and put the
eleven tested demo commands in the UI.

## Implementation

### LiveKit, without an account
`livekit-server --dev` is a single-node server that prints and accepts the placeholder
credentials `devkey` / `secret`. Added as the `livekit` compose service, so the voice path
needs no signup and no secrets. Two URLs for one server, which is the part that is easy to
get wrong:

| Consumer | `LIVEKIT_URL` | Set in | Why |
|---|---|---|---|
| browser | `ws://localhost:7880` | `.env`, echoed by `POST /agent/livekit-token` | the browser is not on the compose network |
| worker | `ws://livekit:7880` | `docker-compose.yml` | service name, inside the network |

### The voice worker
`services/voice-agent/Dockerfile` (new) on `python:3.12-slim`. 3.12 is a hard floor:
`livekit-plugins-aws` depends on `aws_sdk_transcribe_streaming`, which publishes no
distribution below it. Source is bind-mounted, because the image bakes the code in and a
plain `restart` otherwise serves a stale worker — which is exactly what happened once during
this work and cost a confusing debugging cycle.

### Two silent failures found and fixed
1. **A named agent never gets dispatched.** `@server.rtc_session(agent_name=...)` turns OFF
   LiveKit's automatic dispatch. The worker registered, the browser joined, the room stayed
   empty, and nothing anywhere raised. Verified both ways against a real server: named →
   `remote_participants: []`; unnamed → `agent-AJ_... joined`. `agent_name` removed, with
   the reason written at the call site so nobody re-adds it.
2. **An async text-stream handler is never awaited.** `register_text_stream_handler` invokes
   its callback synchronously; an `async def` handler produces
   `RuntimeWarning: coroutine was never awaited` and every transcript is discarded. The
   frontend's `useVoiceInput` already used a sync callback and was unaffected, but the check
   script hit it, and the warning is the only symptom.

### The demo in the UI
`apps/web/src/lib/demo-prompts.ts` mirrors `services/api/scripts/agent_demo.py`. The command
bar shows three chips (a tone edit, a look change, a shape change) plus an "All 11" list.
Clicking loads the command into the input — it does **not** auto-submit, so the presenter
hits enter. Prompt 11 is labelled "won't work — on purpose" rather than presented as a
feature, per the invariant against implying capabilities we do not have.

## Files Created
- `services/voice-agent/Dockerfile` — the worker image.
- `services/voice-agent/scripts/check_voice_e2e.py` — speaks a phrase, asserts a transcript.
- `apps/web/src/lib/demo-prompts.ts` — the eleven tested commands as typed data.
- This audit.

## Files Modified
- `docker-compose.yml` — `livekit` and `voice-agent` services (additive).
- `services/voice-agent/worker.py` — `agent_name` removed (behavioural).
- `services/voice-agent/README.md` — local run story, the two-URL table, the dispatch trap.
- `.env.example` / `.env` (gitignored) — `LIVEKIT_*`, `VOICE_STT_LANGUAGE=en-IN`.
- `apps/web/src/components/agent/AgentCommandBar.tsx` — chips from the tested set.
- `apps/web/scripts/check-agent-apply.ts` — 13 assertions pinning the prompt set.

## Files Intentionally Untouched
`services/api/app/agent/` (the planner and tools were already correct for voice — voice and
typed text share one code path, which is why nothing there needed changing),
`services/api/requirements.txt` (the worker's dependencies must never reach the production
API image), `remotion/`, `apps/web/src/hooks/useVoiceInput.ts` (its sync handler was already
right).

## Architecture
```
browser mic ─► LiveKit (dev server, :7880) ─► voice-agent worker
                      ▲                            │ AWS Transcribe streaming
   POST /agent/livekit-token (mints join token)     ▼
                                          lk.transcription stream
                                                    │
browser  ◄──────────────────────────────────────────┘
   └─► POST /agent/voice-command ─► the SAME planner a typed command uses
```
NEW: the two compose services, the worker image, the e2e check. REUSED: the entire agent,
unchanged — voice produces a string and the string goes through `run_agent_command`.

## Interfaces / Contracts
`POST /agent/livekit-token` `{room, identity}` → `{token, url}`, or `503
livekit_not_configured` when the `LIVEKIT_*` vars are unset, which the editor treats as
"use browser speech recognition". Env: `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `VOICE_STT_LANGUAGE` (no default — the worker refuses to guess a
language). Ports 7880 (signalling/HTTP), 7881 (RTC/TCP), 7882/udp.

## Ownership
`services/voice-agent/` and `docker-compose.yml` are P4's and P1's respectively;
`apps/web` is P3's. Changing the worker and compose is outside P3's lane and was done on
the repo owner's explicit instruction. **Needs P4 and P1 sign-off before merge**, in
particular the removal of `agent_name` and the two new compose services.

## Validation
- Missing `LIVEKIT_*` → `503 livekit_not_configured` with a flat error body; the editor
  falls back rather than failing.
- Missing `VOICE_STT_LANGUAGE` → the worker raises `STTConfigurationError` and the job fails
  visibly, instead of joining a room and transcribing nothing.
- No agent dispatched within 20s → the e2e check fails with the named-agent explanation
  rather than hanging.
- Interim transcripts are shown and never submitted; only a final drives a command.

## Security
`devkey` / `secret` are LiveKit's public placeholder credentials and are local-dev only —
they are in `.env.example` deliberately, and any real deployment must replace them.
`LIVEKIT_API_SECRET` never reaches the browser; the browser only ever receives a minted
token (30-minute TTL, room-scoped). **`POST /agent/livekit-token` still has no auth**
(pre-existing, unchanged): anyone who can reach the API can mint a join token for any room
name. Acceptable on a laptop, not acceptable deployed. `.env` is gitignored and no
credentials were committed (verified with `git check-ignore`).

## Testing
Commands run, with real output:
- `docker compose exec voice-agent python scripts/check_voice_e2e.py` →
  `PASS: 5 interim segment(s), final transcript 'Make that line angry.'`
- `curl POST /agent/voice-command` with that exact transcript → `status: ok`, four
  `UPDATE_WORD` patches setting `w6..w9` to `angry`.
- Agent suite: **295 checks, 0 failures** across 12 files.
- `pytest tests/` in the API container: **95 passed**.
- `python tests/test_stt_provider.py` in the worker container: all checks passed.
- `npx tsc -b` clean; `npm run check:agent` (now including 13 demo-prompt assertions) and
  `npm run check:captions` pass; `npx oxlint src/ scripts/` → 19 warnings, all pre-existing.
- Reachability: `/editor` 200, `/health` 200, LiveKit 200.

## Live Verification
- **Against real live services:** LiveKit signalling and RTC (real room, real join, real
  agent dispatch), AWS Transcribe streaming (real interim + final transcripts), AWS Polly
  (real synthesis), AWS Bedrock (real turn producing the right patches), all over real HTTP.
- **Against real installed packages:** LiveKit token minting and signing.
- **Not verified:** a human speaking into a browser microphone. The audio in the check is
  Polly output pushed as 10ms frames at real-time pace, which is a faithful but synthetic
  stand-in for a mic.

## Unverified / Untestable
1. Browser-side voice: mic permission prompt, the denied state, interim text rendering,
   barge-in. No browser available (the Chrome extension is not connected here).
2. Any rendered UI, including the new prompt chips — structural claims only.
3. hi-IN. `VOICE_STT_LANGUAGE=en-IN` is what was tested; Hinglish speech was not, and the
   phrase transcribed was English.
4. Anything deployed. This is a localhost setup; LiveKit `--dev` is not a production server.

## Integration Status
- LiveKit server, worker, dispatch, STT, transcript forwarding: **connected and verified**.
- Voice → agent → patches: **connected and verified** at the API level.
- Browser → mic → LiveKit: **connected in code, unverified** (no browser).
- Demo prompts in the UI: **connected**, structurally verified.
- Deployment: **not started** — explicitly out of scope, localhost only.

## Dependencies / Blockers
- **P4**: sign off `worker.py`'s loss of `agent_name` and the new Dockerfile.
- **P1**: sign off the two compose services and the ports.
- **Nobody**: voice works as-is on a laptop. No credentials needed.

## Deviations
1. The Phase 1 audit said LiveKit was blocked on an account. It was not — `--dev` mode
   removes that blocker entirely, which is why this phase exists.
2. `agent_name` was removed from a P4-owned file. The alternative (explicit dispatch from
   the token endpoint) would have pulled agent orchestration into a credential endpoint for
   no benefit, since there is one room type and it always wants transcription.
3. `VITE_USE_FIXTURE` flipped to `true` in the gitignored `.env` so `/editor?demo=1` works
   without uploading a video. Not committed; `.env.example` is unchanged.

## Git / Change Scope
Branch `p3-agent-talk-edit`, clean tree, 7 commits, nothing pushed. `.env` is gitignored and
was confirmed not staged. `git status` reviewed before each commit; no unrelated files.

## Next Steps
1. Open `http://localhost:5173/editor?demo=1`, click the mic, and speak one of the chips —
   the only step no automated check can stand in for (owner: whoever demos).
2. Sign-offs per Dependencies (owners: P1, P4).
3. If Hinglish matters on stage, test `VOICE_STT_LANGUAGE=hi-IN` against a real Hinglish
   phrase before relying on it (owner: P4).
4. Before any deployment: replace the `--dev` server and its placeholder credentials, and
   put auth on `/agent/livekit-token` (owner: P1).
