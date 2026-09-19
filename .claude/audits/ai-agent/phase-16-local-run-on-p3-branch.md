# Phase 16 — Running `p3-agent-talk-edit` locally on the P4 machine Audit

## Status
Backend and typed-agent path verified live. Voice-over-LiveKit is **blocked by IAM** (not code).
The demo video is **blocked by missing media**. The rendered editor UI was **not verified** — the
Chrome extension was not connected. No application code was changed.

## Objective
Follow Shubh's 4-step local-run recipe (also README "Run it locally") on this machine, on branch
`p3-agent-talk-edit` (tip `4d439a7`), and prove what works. The machine was not fresh: it carried
a `.env` and processes from the older `aman/ai-agent` work.

## Implementation (configuration only — no code, no tracked files)
Gitignored `.env`, six lines. A byte-identical backup was taken first (`.env.pre-p3-backup`, ignored).
| Key | Before | After | Why |
|---|---|---|---|
| `DEV_PREFIX` | `p1` | `p4` | `p1` would write over P1's S3 keys / DynamoDB rows |
| `LIVEKIT_URL` | LiveKit Cloud `wss://…` | `ws://localhost:7880` | compose runs a local `--dev` server |
| `LIVEKIT_API_KEY/SECRET` | Cloud key/secret | `devkey` / `secret` | the dev server only accepts these; the worker gets its key from `.env` |
| `VOICE_STT_LANGUAGE` | missing | `en-IN` | worker refuses to start without it, by design |
| `VITE_USE_FIXTURE` | `false` | `true` | `/editor?demo=1` needs it |
Other actions: `docker compose up -d --build` (recreated `api`, built `voice-agent`, pulled `livekit`);
`npm install` (adds `jiti`); stopped the stale Vite (pid 22216, started before the `.env` change) and
started a fresh one; then `docker compose stop livekit voice-agent` (see Blockers) on the repo owner's choice.
The AWS CLI is not installed and `~/.aws` is empty; credentials come from `.env` keys instead, so
`aws configure` was skipped and identity was checked with boto3 inside the container.

## Files Created
- This audit. (Untracked; not committed.)

## Files Modified
None tracked. `.env` (ignored). Nothing in `apps/`, `services/`, or `packages/`.

## Testing (commands actually run)
- `curl localhost:8010/health` -> `{"ok":true}` — **verified**.
- boto3 `sts.get_caller_identity()` in the api container -> `arn:aws:iam::632127306260:user/shubh-2`; `DEV_PREFIX` in the container is `p4` — **verified**.
- `agent_demo.py --list` — **verified** (no AWS).
- `agent_demo.py --grade easy` against **real Bedrock**: 4/4 PASS — **verified live**. (Higher grades not run.)
- `pytest tests/` in the api container: 95 dots, none failing (matches the 95 the target's audit reports). The `-q` summary line was not captured; the count is from the progress dots.
- `tsc -b` clean; `check:captions` passes; `check:agent` passes **when run with the env var set the Windows way**.
- HTTP-level: Vite serves `VITE_USE_FIXTURE=true`; `/editor?demo=1` 200; CORS preflight allows `http://localhost:5173`; `/agent/command`, `/agent/voice-command`, `/agent/livekit-token` mounted.

## Live Verification
Real: Bedrock (4 prompts), STS, LiveKit signalling + agent dispatch (worker registered unnamed; joined the
check room). Not real: no human at a microphone, no browser.

## Unverified / Untestable
1. Every rendered-UI claim (editor, activity panel, undo, captions on video). No browser.
2. Browser SpeechRecognition fallback: reasoned from `useVoiceInput.ts`, never exercised.
3. Grades average/asks/hard of `agent_demo.py`; prompts 10-11 also need the video (vision).
4. `pytest` summary line (see above).

## Integration Status
- API, Bedrock agent, mounted routes, CORS: **connected, verified**.
- LiveKit server + worker + dispatch: **connected, verified up to STT**.
- Voice transcript: **blocked** (below). Editor UI: **not verified**.

## Dependencies / Blockers
1. **IAM: `shubh-2` is denied `transcribe:StartStreamTranscription`** (worker log:
   `StartStreamTranscription ... 403 AccessDeniedException`) and **`polly:SynthesizeSpeech`**. Same gap
   phases 12/13/15 found. The voice e2e check therefore cannot pass as written, and Polly cannot synthesize its
   test audio. Fix: the lead grants those actions on this identity.
2. **Demo media missing.** `services/api/scripts/stt_bakeoff/clips/*` is git-ignored and contains only
   `.gitkeep`; a machine-wide search found no `Normal.mp4`. `/demo-media/Normal.mp4` -> 404, so the demo
   video is blank and `analyze_frame` demos cannot run. Fix: get the clips from Shubh.
3. The credential shim `app/aws_fallback.py` exists on master, not on this branch. It was **not needed** for
   Bedrock (real calls succeeded with this identity). It would not cover the voice worker in any case.

## Deviations
1. **The plan claimed the editor falls back to browser speech recognition when Transcribe fails. That was
   wrong.** `useVoiceInput.startLiveKit` falls back only when the token fetch or `room.connect` throws. A connected
   room whose worker cannot transcribe leaves the mic "listening" and silent. Workaround applied: LiveKit
   containers stopped so `room.connect` fails and the fallback triggers. Reversible with
   `docker compose start livekit voice-agent`. This is a latent product bug worth telling P3 about.
2. **The voice e2e check was run with different audio.** Polly was denied, so the phrase "make that line angry"
   was synthesised with Windows SAPI (Microsoft David), converted with the container's ffmpeg to raw 16 kHz
   PCM, and played into the room. The dispatch step passed; the STT step failed on IAM, so the transcript step
   remains unproven on this identity.
3. `npm run check:agent` fails under Windows `cmd.exe` because the script uses POSIX `JITI_ALIAS="...$PWD..."`
   syntax. The checks themselves pass with the variable set correctly. A portability bug in `apps/web/package.json` (P3).
4. `livekit-client` pulls `machina@7.0.1`, which declares Node >=22.22; this machine has 22.14 (EBADENGINE
   warning only; nothing exercised it, since the browser was not run).

## Security
While inspecting `.env` read-only, a masking slip in one of my commands printed the `LIVEKIT_API_KEY/SECRET`
of the team's LiveKit Cloud project into this session's transcript. They were removed from `.env` but remain in
`services/voice-agent/.env` and `.env.pre-p3-backup`. Rotate them in the LiveKit Cloud dashboard if the transcript
is shared. No secret was committed; `.env*` is ignored (checked with `git check-ignore`).
`DEV_PREFIX` was `p1` for ~6 hours on the previously running container; whether anything was written under `p1/`
is unknown.

## Git / Change Scope
Branch `p3-agent-talk-edit` @ `4d439a7`; `git status` shows no tracked or untracked changes other than this
file and the pre-existing `DESIGN.md`/`design.md` case-collision phantom. Nothing committed, nothing pushed.

## Next Steps
1. Open `http://localhost:5173/editor?demo=1` and try typed commands (owner: you). Expect captions without video until item 3.
2. Ask the lead to grant `transcribe:StartStreamTranscription` (and `polly:SynthesizeSpeech`) to `shubh-2`, then
   `docker compose start livekit voice-agent` and re-run the e2e check (owner: lead).
3. Get `Normal.mp4` (and other clips) from Shubh into `services/api/scripts/stt_bakeoff/clips/` (owner: Shubh).
4. Tell P3 about deviations 1 and 3 (owner: P3).
5. If IAM cannot be fixed, the Sarvam STT provider on `aman/ai-agent-backup-before-p3-migration` is the alternative; a separate, planned task.
