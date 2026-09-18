# LiveKit Voice Transport (Phase 1) Audit

## Status
Implemented and unit/structurally verified against real installed packages.
**Not live-tested** against any real external service (no LiveKit Cloud project, no
Python 3.12 environment available to construct the AWS streaming STT plugin). **Not
integrated** into the running application — `services/api/app/main.py` still does not
mount the agent router (a pre-existing blocker, unchanged by this work), so none of
`/agent/command`, `/agent/voice-command`, or the new `/agent/livekit-token` are reachable
on a real running server yet. **Uncommitted** at the time of this audit.

## Objective
Team lead (Shubh) asked to build the voice agent on LiveKit and deploy it later.
Decision (confirmed with the user, recorded in the approved plan): adopt LiveKit
strictly as a **transport layer** — microphone capture, WebRTC audio, and speech-to-text
only. The resulting transcript is handed to the **existing, already-tested**
`POST /agent/voice-command` (`transcript=` path), which runs through the same planner a
typed command uses. No LiveKit LLM/tool-calling abstraction is used, and none of the
existing agent core is modified or duplicated.

## Implementation
Three new pieces, all additive:

1. **`services/voice-agent/`** — a new, separate deployable Python process (NOT part of
   the `services/api` container). `worker.py` registers a LiveKit Agents `AgentServer`
   entrypoint that constructs an `AgentSession(stt=<AWS Transcribe streaming plugin>)`
   with **no `llm=` or `tts=` argument** and starts it against an `Agent` with empty
   instructions (`TranscriptionOnlyAgent`). `stt_provider.py` is a small factory
   (`get_stt_plugin()`) that reads `VOICE_STT_LANGUAGE`/`AWS_REGION` from the
   environment and raises `STTConfigurationError` if the language isn't set — no
   default language, matching the existing "fail loud" convention in
   `bedrock_client.get_model_id()`/`voice.get_voice_transcriber()`.
2. **`services/api/app/agent/livekit_token.py`** — a new `POST /agent/livekit-token`
   route, additive on the existing `router` object in `router.py` (one new import + one
   `router.include_router(livekit_router)` line). Mints a short-lived (30 min) signed
   JWT via the real `livekit-api` package's `AccessToken`/`VideoGrants`, so the frontend
   can join a LiveKit room without ever seeing `LIVEKIT_API_SECRET`.
3. **Frontend wiring** — `apps/web/src/hooks/useLiveKitVoice.ts` (new): joins a LiveKit
   room, publishes the mic track, listens for LiveKit's built-in `lk.transcription`
   text-stream forwarding, and resolves to a transcript string only — it never calls the
   agent itself. `apps/web/src/lib/agent-client.ts` (new): thin typed `fetch` wrappers
   for the two existing, unmodified agent endpoints. `App.tsx` was additively edited to
   replace both previous placeholders (`handleToggleMic`'s fake local-only toggle,
   `handleSubmitCommand`'s no-op) with real calls: mic toggle now drives
   `useLiveKitVoice.start()/stop()`, and both typed and voice-derived text now go through
   the same `applyAgentResponse()` function, which dispatches returned patches through
   the **existing, unmodified** `project-reducer.ts` actions and appends the backend's
   own log entries via a new `addBackendEntries()` method on `useAgentActivity.ts`.

## Files Created
- `services/voice-agent/worker.py` — STT-only LiveKit Agents entrypoint
- `services/voice-agent/stt_provider.py` — fail-loud STT plugin factory
- `services/voice-agent/requirements.txt` — isolated from `services/api/requirements.txt`
- `services/voice-agent/.env.example` — worker-local env template (blank values)
- `services/voice-agent/README.md` — scope, local-dev instructions, verified-vs-open items
- `services/voice-agent/tests/__init__.py`
- `services/voice-agent/tests/test_stt_provider.py` — 5 assertions, config-parsing only
- `services/api/app/agent/livekit_token.py` — JWT-minting route
- `services/api/app/agent/tests/test_livekit_token.py` — 3 test functions, 12 assertions
- `apps/web/src/hooks/useLiveKitVoice.ts` — room join / mic publish / transcript capture
- `apps/web/src/lib/agent-client.ts` — typed client for `/agent/command` and `/agent/voice-command`

## Files Modified
- `.env.example` (root) — additive: blank `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`
- `services/api/requirements.txt` — additive: one line, `livekit-api`, with an inline
  comment flagging it needs P1 sign-off (deploy-critical file)
- `services/api/app/agent/router.py` — additive: one import + one `include_router` call;
  `run_command`/`run_voice_command` untouched (confirmed via `git diff`, zero lines
  changed in either function)
- `apps/web/package.json` — additive: one dependency, `livekit-client`
- `apps/web/src/App.tsx` — structural but scoped: both previous placeholders replaced
  with real logic; no unrelated UI/JSX changed
- `apps/web/src/hooks/useAgentActivity.ts` — additive: one new exported function
  (`addBackendEntries`); existing `addEntry`/state logic untouched
- `package-lock.json` — mechanical, from `npm install livekit-client`; diff confirmed
  scoped to that package's own transitive dependencies only (protobuf, `@livekit/mutex`,
  `@livekit/protocol`, rxjs, sdp, webrtc-adapter, etc.), no unrelated version bumps or
  removals

## Files Intentionally Untouched
Confirmed via `git diff`/`git status` showing zero output for each:
- `services/api/app/agent/contracts.py`, `validation.py`, `planner.py`,
  `bedrock_client.py`, `tool_config.py`, `voice.py`, and every file under
  `services/api/app/agent/tools/` (registry, catalog, schemas, errors, and all 9 tool
  implementations) — the entire tested agent core, unchanged.
- `services/api/app/main.py` — mounting the agent router remains a separate, pre-existing
  P1 task, not part of this phase.
- `packages/shared/` (the shared `Project`/`Style`/`Overlay` schema) — no schema change
  needed or made.
- `apps/web/src/state/project-reducer.ts` — its existing `UPDATE_WORD`/`SET_PRESET`/
  `ADD_OVERLAY` actions already matched the agent's patch shapes; no reducer change
  required.
- `services/api/app/pipeline/prosody.py` — a **pre-existing, unrelated** whitespace-only
  change (one leading space added to a docstring) was already present in the working
  tree before this phase began. Confirmed identical before and after this phase's work
  via `git diff`; not staged or touched by any commit from this phase.

## Architecture
```
mic (browser) → useLiveKitVoice.ts → LiveKit Cloud room → services/voice-agent worker
  (STT only, no LLM/TTS) → LiveKit's built-in transcription forwarding
  → useLiveKitVoice.ts resolves a transcript string
  → App.tsx → agent-client.ts → POST /agent/voice-command   [REUSED, UNCHANGED]
  → voice.run_agent_voice_command → planner.run_agent_command [REUSED, UNCHANGED]
  → AgentCommandResponse{status, patches, log}                [REUSED, UNCHANGED]
  → App.tsx dispatches patches via project-reducer.ts          [REUSED, UNCHANGED]
```
Everything left of "resolves a transcript string" is NEW (this phase). Everything from
`POST /agent/voice-command` onward is the existing, 99-test-covered agent core, exercised
through its existing contract with zero modification.

## Interfaces / Contracts
- **`POST /agent/livekit-token`** (new) — request `{room: string, identity: string}`,
  response `{token: string, url: string}`. No `AgentCommandResponse`-shaped error
  handling (unlike `/agent/command`); raises via FastAPI's normal error path if
  `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` aren't all set.
- **`/agent/command` and `/agent/voice-command`** — unchanged; this phase only adds a
  real caller (`apps/web/src/lib/agent-client.ts`), not a new shape.
- **`services/voice-agent`'s STT config** — `VOICE_STT_LANGUAGE` (no default, required),
  `AWS_REGION` (defaults to `ap-south-1`, matching `bedrock_client.py`/
  `vision_tools.py`'s existing convention).
- **New environment variables**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  (root `.env.example` and `services/voice-agent/.env.example`), `VOICE_STT_LANGUAGE`
  (`services/voice-agent/.env.example` only). None have real values anywhere in the repo.
- **New dependencies**: `livekit-api` (`services/api/requirements.txt`, server-side JWT
  minting only), `livekit-agents[aws]~=1.5` + `python-dotenv`
  (`services/voice-agent/requirements.txt`, isolated), `livekit-client@^2.22.3`
  (`apps/web/package.json`).

## Ownership
- `services/voice-agent/` — new deployable; P4 builds it (voice agent ownership), but
  **where it deploys in production is a P1 decision** (flagged explicitly in code
  comments and README — App Runner's existing container is not a fit for a long-running,
  room-joining process). Not yet decided.
- `services/api/app/agent/livekit_token.py` and the `router.py` edit — additive inside
  P4's existing folder, no ownership violation.
- `services/api/requirements.txt` edit — **needs P1 sign-off** before merge; this file
  ships into the production API Docker image (flagged inline in the file itself).
- `apps/web/*` edits — P3's folder. Touched here because the approved plan explicitly
  scoped frontend wiring as part of this phase (see Deviations below for the one place
  scope was interpreted slightly more broadly than "transport only").
- `packages/shared`, `services/api/app/main.py` — untouched, as required.

## Validation
- `stt_provider.get_stt_language()` raises `STTConfigurationError` for unset or empty
  string — verified by test (`services/voice-agent/tests/test_stt_provider.py`).
- `livekit_token.mint_join_token()` raises `LiveKitConfigurationError` if any of
  `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` is missing — verified by test.
- `useLiveKitVoice.ts` only treats a transcription segment as submittable when
  `attributes['lk.transcription_final'] === 'true'` and the segment's participant
  identity matches the session's own identity — interim segments and other
  participants' segments are ignored.
- `App.tsx`'s `handleSubmitCommand`/`handleVoiceTranscript` wrap their fetch calls in
  try/catch and log a failure entry via `addEntry` on error, rather than throwing
  unhandled or silently doing nothing.
- All patch application still goes through the **existing, unmodified**
  `validation.apply_patches` all-or-nothing boundary on the backend — this phase adds no
  new patch-construction logic anywhere.

## Security
- No hardcoded secrets: confirmed by regex-scanning the full diff and all new files for
  key/secret/token-shaped literals — zero matches. The only credential-shaped strings
  anywhere are `test-key` / `test-secret-at-least-32-bytes-long!!` /
  `wss://example.livekit.cloud` in `test_livekit_token.py`, explicitly fake test values.
- `LIVEKIT_API_SECRET` never reaches the browser — token minting happens server-side
  only, by design (`livekit_token.py`'s module docstring states this explicitly).
- `POST /agent/livekit-token` has **no authentication**, consistent with the project's
  declared "no auth" MVP scope — but this is a real, named risk: anyone who finds the
  URL can mint room-join tokens and consume the team's LiveKit Cloud free-tier minutes
  and AWS Transcribe budget. Not mitigated in this phase; flagged for a team decision.
- Prompt-injection handling is unaffected and unduplicated — the transcript, once
  submitted, passes through the existing `<user_command>`-wrapping and isolation logic
  in `planner.py`, unchanged by this phase.
- Token TTL is deliberately short (30 minutes) specifically because the endpoint is
  unauthenticated, to limit the exposure window of an unintentionally-shared token.

## Testing
Exact commands and results, re-run fresh as part of the review that preceded this audit:
- `python -m app.agent.tests.<name>` for all 11 files under
  `services/api/app/agent/tests/` (the original 10 + new `test_livekit_token.py`):
  **102 test functions total, all pass.** (`test_contracts` 23 checks,
  `test_tool_registry` 21, `test_context_tools` 22, `test_mutation_tools` 43,
  `test_vision_tools` 24, `test_tool_config` 10, `test_bedrock_client` 6,
  `test_planner` 37, `test_voice` 29, `test_router` 32, `test_livekit_token` 12 — 259
  `check()` assertions total across the suite.)
- `python -m tests.test_stt_provider` in `services/voice-agent/`: **5 assertions, all
  pass.**
- `npx tsc -b` from `apps/web/` (full monorepo project build): **exit code 0, zero
  errors.**
- `npx oxlint .` from `apps/web/` (whole workspace): **exit code 0**; 4 pre-existing
  warnings in files this phase never touched (`button.tsx`, `tabs.tsx`, `router.tsx`,
  `project-context.tsx`) — no new warnings introduced.

## Live Verification
**Verified against real installed packages (no live network/service call):**
- `livekit-api`'s `AccessToken`/`VideoGrants` — installed for real, a real JWT was
  minted and its decoded claims (`sub`, `video.room`, `video.roomJoin`,
  `video.canPublish`, `exp`) asserted to match. Real local cryptographic signing, no
  network call.
- `livekit-agents==1.8.2`'s `AgentServer`, `@server.rtc_session`, `AgentSession`,
  `Agent`, `agents.cli.run_app` — installed for real; the exact decorator/class/
  constructor calls used in `worker.py` were executed directly (object construction,
  decoration) and succeeded. No room connection was attempted.
- `livekit-plugins-aws`'s `aws.STT` constructor signature — inspected via
  `inspect.signature()` against the real installed package. This caught a real
  documentation error: LiveKit's own docs page for this plugin names the region
  parameter `speech_region`; the actual installed constructor takes `region`.
  `stt_provider.py` was corrected to use the verified name.
- `livekit-client@2.22.3` — the actual published npm package (not just its docs) was
  fetched and grepped to confirm `Room`, `room.connect`, `localParticipant.
  setMicrophoneEnabled`, `room.registerTextStreamHandler`, and `RoomEvent.Disconnected`
  all exist with the names/shapes used in `useLiveKitVoice.ts`.

**NOT verified — no live external service was reached:**
- No real LiveKit Cloud project exists; no room was ever actually created or joined.
- No real WebRTC audio was ever published or transported.
- `aws.STT(...)` was **never actually constructed** — its hard dependency
  `aws_sdk_transcribe_streaming` has no distribution for Python < 3.12, confirmed by a
  failed install attempt; no Python 3.12 interpreter is available on this development
  machine. The constructor's *signature* was verified; its *behavior* was not.
- No real AWS Transcribe streaming call was made.
- LiveKit's transcription-forwarding was never observed in practice — its
  "enabled by default for `AgentSession`" behavior is taken from documentation, not
  reproduced here.
- The frontend was never run in a real browser against a real backend — `tsc -b`/
  `oxlint` confirm the code compiles and lints cleanly, not that it behaves correctly at
  runtime.
- `POST /agent/livekit-token` and the reused `/agent/command`/`/agent/voice-command`
  routes were never hit on a real running server — `services/api/app/main.py` still
  doesn't mount the router (pre-existing, unrelated to this phase).

## Unverified / Untestable
- End-to-end voice command (mic → transcript → patch → UI update): blocked on no
  LiveKit Cloud project, no mounted router, and no Python 3.12 environment for the
  worker — three independent blockers, not one.
- hi-IN streaming STT quality/accuracy: cannot be assessed without a real streaming
  Transcribe call; the existing STT bake-off only covers the unrelated *batch* API.
- Whether LiveKit's transcription-forwarding is truly automatic for an STT-only
  session in the *installed* version, vs. requiring an explicit forward call: taken
  from documentation only, not reproduced against a real session.
- LiveKit Cloud's free-tier limits under real team/demo usage: unknown until a project
  exists.

## Integration Status
- **Not connected**: `/agent/livekit-token`, `/agent/command`, and `/agent/voice-command`
  are not reachable on the real running API — `main.py` does not mount the router
  (pre-existing blocker).
- **Not connected**: `services/voice-agent`'s worker has no deployment target yet and
  is not running anywhere.
- **Waiting on another teammate (P1)**: mounting the agent router on `main.py`;
  sign-off on the `livekit-api` addition to `services/api/requirements.txt`; deciding
  where the worker process runs in production.
- **Waiting on credentials/configuration**: a LiveKit Cloud project and its
  `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`; confirmation that the shared
  dev AWS credentials have streaming-Transcribe (`StartStreamTranscription`) permission,
  not just the batch permission already in use.
- **Waiting on infrastructure**: a Python 3.12 environment to actually run
  `services/voice-agent` (this dev machine only has 3.10).

## Dependencies / Blockers
- P1: mount the agent router on `main.py` (pre-existing, tracked separately).
- P1: sign off on `livekit-api` in `services/api/requirements.txt`.
- P1: decide/provision a deployment target for `services/voice-agent`.
- Team: create a LiveKit Cloud project (free "Build" tier sufficient for now) and
  distribute its credentials.
- Team: confirm/verify shared AWS dev credentials permit streaming Transcribe.
- Team: run a short spike validating hi-IN streaming STT quality before relying on it.
- Team: decide whether to add minimal auth to `/agent/livekit-token` given the
  cost-exposure risk of an open token-minting endpoint.

## Deviations
One deliberate, reasoned deviation from "transport only": the approved plan explicitly
scoped `useLiveKitVoice.ts` to resolve to a transcript string and nothing more, treating
"submit that transcript to the backend" as a separate, already-tracked P3 task. During
implementation, `App.tsx`'s `handleSubmitCommand` was also given a real implementation
(calling `POST /agent/command`) alongside the voice-transcript submission path, rather
than leaving it as a no-op placeholder. This was a scope call, not an accident: the
plan's own text anticipated this ("this LiveKit work either lands after or alongside
[the fetch-wiring] task"), and leaving `handleSubmitCommand` as a placeholder would have
made the newly-wired mic button produce a transcript that goes nowhere, i.e. no visible
behavior change at all. This should be treated as touching `apps/web` (P3's folder)
slightly more broadly than the literal "transport only" framing implied, and flagged to
P3 for review even though it reuses the existing, unmodified backend contract exactly.
No other deviations from the approved plan were made.

## Git / Change Scope
- Branch: `aman/ai-agent`.
- State at time of this audit: **uncommitted** — nothing from this phase has been
  committed or pushed.
- `git status`/`git diff` were reviewed in full (not from memory) before writing this
  audit. One unrelated change was detected: a pre-existing, single-line whitespace edit
  in `services/api/app/pipeline/prosody.py`, present before this phase began and
  confirmed unchanged by it. It must not be included if/when this phase's changes are
  staged and committed.

## Next Steps
- **P1**: review and sign off on the `livekit-api` requirements.txt addition; decide the
  worker's deployment target; mount the agent router on `main.py` (tracked separately,
  blocks this phase's routes regardless of LiveKit).
- **P3**: review the `apps/web` changes, in particular the scope note under Deviations,
  and confirm the `handleSubmitCommand` implementation is acceptable to land as part of
  this phase rather than a separate PR.
- **Team**: create the LiveKit Cloud project and distribute credentials; confirm AWS
  streaming-Transcribe permission; timebox a hi-IN streaming STT quality spike; decide
  on `/agent/livekit-token` auth.
- **P4 (whoever picks this up next)**: once a Python 3.12 environment and real LiveKit
  Cloud credentials exist, do a real end-to-end run (mic → transcript → patch) and
  update this audit's "Live Verification" section with real results — do not assume
  this phase's structural verification substitutes for that.
- Before committing: re-run `git status`/`git diff`, confirm this audit is included in
  the same change set, and follow the Commit/PR rules in root `CLAUDE.md`.
