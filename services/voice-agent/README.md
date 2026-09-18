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

## Running it locally (the whole voice path, no LiveKit account)

`docker compose up -d` brings up three services: `api`, `livekit` and `voice-agent`.
The `livekit` service is `livekit-server --dev`, a single-node server using the
well-known placeholder credentials `devkey` / `secret` that it prints on startup.
They are public, they are in `.env.example`, and they must never be used anywhere
but a laptop.

Two URLs for the same server, on purpose:

| Who | LIVEKIT_URL | Why |
|---|---|---|
| the browser | `ws://localhost:7880` (`.env`, echoed by the token endpoint) | the browser is not on the compose network |
| this worker | `ws://livekit:7880` (set in `docker-compose.yml`) | service name, inside the network |

With no `LIVEKIT_*` set at all, `POST /agent/livekit-token` answers
`503 livekit_not_configured` and the editor falls back to the browser's own
SpeechRecognition. That is a supported path, not a broken one.

### Verifying it actually works

`scripts/check_voice_e2e.py` speaks a real phrase into a real room and asserts a
transcript comes back — see its docstring for the two commands. Everything in that
path is real except the mouth (the audio is rendered by AWS Polly rather than spoken).
Use it before a demo: every failure mode in this path is silent, and "voice doesn't
work" is indistinguishable from "the agent wasn't dispatched" without it.

### Automatic dispatch — do not add an `agent_name`

`@server.rtc_session()` is deliberately unnamed. Giving a worker an `agent_name`
turns OFF LiveKit's automatic dispatch: the worker registers, the browser joins, and
no transcriber ever appears — verified against a real server. A named agent would
need something to explicitly dispatch it per room, which would drag the token
endpoint into agent orchestration for no benefit here, since this product has exactly
one kind of room and it always wants transcription.

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
