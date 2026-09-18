"""LiveKit Agents worker: transport-layer voice input, STT only.

Scope (per the team's LiveKit integration decision): this worker's ONLY job
is to turn a room participant's microphone audio into transcript text and let
LiveKit forward that text back to the room. It has no LLM, no TTS, and no
tool-calling of its own — the frontend takes the forwarded transcript and
calls the EXISTING, already-tested `POST /agent/voice-command`
(services/api/app/agent/router.py -> voice.run_agent_voice_command ->
planner.run_agent_command), which is completely unmodified by this worker.

This is a SEPARATE deployable process from services/api's FastAPI container —
see services/voice-agent/README.md for why, and for the local run command.
Never merge this directory's dependencies into services/api/requirements.txt.

API-shape note: `AgentServer`/`@server.rtc_session`/`AgentSession(stt=...)`/
`Agent(instructions=...)`/`session.start(room=..., agent=...)`/
`agents.cli.run_app(server)` were all verified by direct inspection against
real `livekit-agents==1.8.2` (constructed/decorated for real in a throwaway
venv, not just read from docs) — these names and call shapes are confirmed
correct against that version. `stt_provider.get_stt_plugin()`'s
`aws.STT(language=..., region=...)` call was likewise verified against the
real installed `livekit-plugins-aws` constructor signature (note: LiveKit's
own docs page for this plugin says `speech_region`, which is WRONG for this
version — the real parameter is `region`; corrected here after inspecting
the actual installed package, not the docs page).

Not verifiable without real infrastructure (see README.md's "Open items"):
an actual room connection/audio stream, and constructing `aws.STT(...)` end
-to-end, since `aws_sdk_transcribe_streaming` (a hard dependency of that
plugin) has no distribution for Python < 3.12 — confirmed by attempting the
install, not assumed. Run this worker under Python 3.12+ as the project's
own `CLAUDE.md` already requires.
"""
from __future__ import annotations

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession

from stt_provider import STTConfigurationError, get_stt_plugin

load_dotenv()


class TranscriptionOnlyAgent(Agent):
    """An Agent with no conversational behavior of its own.

    No `llm=`/`tts=` are passed to AgentSession below, so this class exists
    only to satisfy AgentSession.start()'s required `agent=` argument — it
    never generates a reply, never calls a tool, and never talks back to the
    room. All of the actual work (speech -> text) happens in the STT plugin;
    LiveKit's default transcription forwarding (the `lk.transcription` text
    stream topic, enabled by default per LiveKit's docs) delivers that text
    to the frontend without any code in this class.
    """

    def __init__(self) -> None:
        super().__init__(instructions="")


server = AgentServer()


# NO agent_name on purpose. Setting one turns OFF LiveKit's automatic dispatch: a named
# agent only ever joins rooms something explicitly dispatches it to, so with a name here the
# worker registered happily, the browser joined happily, and no transcriber ever appeared —
# a silent failure that looks exactly like a working system. Verified against a real
# livekit-server: named -> the room stays empty; unnamed -> the agent joins on its own.
# This product has exactly one kind of room and it always wants transcription, so automatic
# dispatch is the honest default and the token endpoint stays a token endpoint.
@server.rtc_session()
async def entrypoint(ctx: agents.JobContext) -> None:
    try:
        stt_plugin = get_stt_plugin()
    except STTConfigurationError as exc:
        # Fail loud and let the job fail visibly rather than silently
        # joining a room and producing no transcriptions.
        raise SystemExit(str(exc)) from exc

    session = AgentSession(stt=stt_plugin)
    await session.start(room=ctx.room, agent=TranscriptionOnlyAgent())


if __name__ == "__main__":
    agents.cli.run_app(server)
