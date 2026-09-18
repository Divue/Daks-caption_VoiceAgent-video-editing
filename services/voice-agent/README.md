# voice-agent — LiveKit voice transport worker

STT-only LiveKit Agents worker. Turns a user's microphone audio into
transcript text and lets LiveKit forward that text back to the room. Nothing
else — no LLM, no TTS, no tool-calling. See `worker.py`'s module docstring
for the full scope statement and why.

**This is a separate deployable from `services/api`.** It is a long-running
process that joins LiveKit rooms, not an HTTP API — it does not run inside
`services/api`'s Docker image and its dependencies must never be added to
`services/api/requirements.txt`. Where this runs in production (a small
always-on host — App Runner's existing container is not a fit) is a P1
decision, not resolved by this code.

## Why it exists

The AI/voice agent's core (`services/api/app/agent/`) is fully built and
tested, but had no way to actually capture a user's voice or turn it into
text (see the repo-root `ai-agent-report.md`, §14). This worker fills that
one gap: microphone capture (via the frontend's LiveKit client) + streaming
speech-to-text (here). The resulting transcript is handed to the
**already-existing** `POST /agent/voice-command` endpoint, unchanged.

## Local dev

Follows the same per-part isolation convention as
`services/api/scripts/stt_bakeoff/` — its own venv, its own requirements
file, never system Python:

```
cd services/voice-agent
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
cp .env.example .env   # fill in your values
.venv/bin/python worker.py dev
```

This connects out to your team's LiveKit Cloud project — there is no local
LiveKit server to run (deployment target is LiveKit Cloud's free "Build"
tier for now, per the team's LiveKit integration plan).

## Verified vs. still open

`worker.py`'s and `stt_provider.py`'s exact API calls (`AgentServer`,
`@server.rtc_session`, `AgentSession(stt=...)`, `Agent(instructions=...)`,
`session.start(...)`, `agents.cli.run_app(...)`, and `aws.STT(language=,
region=)`) were verified by direct inspection against a real installation of
`livekit-agents==1.8.2` + `livekit-plugins-aws` — not just copied from docs.
One real docs error was caught this way: LiveKit's own AWS STT plugin page
says the region parameter is `speech_region`; the actual installed
constructor takes `region`. `stt_provider.py` uses the verified name.

Still genuinely open, because they require infrastructure this environment
doesn't have:

- **hi-IN streaming STT quality is unverified.** The existing STT bake-off
  (`services/api/scripts/stt_bakeoff/`) only validated the *batch*
  Transcribe API. Streaming Transcribe is a different API with its own
  language support/latency/accuracy profile. Run a short spike before
  assuming parity — set `VOICE_STT_LANGUAGE` only once that's confirmed.
- **End-to-end room connection**: constructing `aws.STT(...)` and actually
  streaming audio requires Python 3.12+ (`aws_sdk_transcribe_streaming`, a
  hard dependency of the plugin, has no distribution for older Pythons —
  confirmed by attempting the install) plus a real LiveKit Cloud project and
  real AWS Transcribe streaming credentials — none of which exist in this
  dev environment. Run this worker under Python 3.12+ per `CLAUDE.md`.
- **Agent dispatch**: this worker registers itself as `agent_name=
  "caption-editor-voice-transport"` — the frontend's room-join flow
  (`apps/web/src/hooks/useLiveKitVoice.ts`) and/or your LiveKit Cloud
  project's dispatch rule must actually route new rooms to this agent name.
