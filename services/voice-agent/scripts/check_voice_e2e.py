#!/usr/bin/env python3
"""Speak a real command into a real LiveKit room and assert a transcript comes back.

This is the only check that exercises the voice path as a whole. Everything here is real
except the mouth: real token minting through the API, real LiveKit signalling and RTC, real
agent dispatch, real AWS Transcribe streaming, real `lk.transcription` forwarding. The audio
is synthesised by AWS Polly instead of spoken into a microphone, which is the one thing a
headless machine cannot do.

It exists because every failure in this path is silent. A named agent registers happily and
is never dispatched; an async text-stream handler is never awaited and the transcript is
dropped with only a RuntimeWarning; a mis-set language transcribes to nothing. None of those
raise, and all of them look exactly like "voice doesn't work" five minutes before a demo.

Run (from the repo root, with `docker compose up -d` already running):

    # 1. render the phrase — boto3 lives in the API image, not this one
    docker compose exec api python -c "import boto3; \
open('/tmp/speech.pcm','wb').write(boto3.client('polly', region_name='ap-south-1')\
.synthesize_speech(Text='make that line angry', OutputFormat='pcm', VoiceId='Kajal', \
Engine='neural', SampleRate='16000')['AudioStream'].read())"
    docker compose cp api:/tmp/speech.pcm /tmp/speech.pcm
    docker compose cp /tmp/speech.pcm voice-agent:/tmp/speech.pcm

    # 2. mint a token and speak
    docker compose exec voice-agent python scripts/check_voice_e2e.py

Exit 0 means a final transcript arrived. Exit 1 means it did not.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import urllib.request

from livekit import rtc

SAMPLE_RATE = 16000
FRAME_SAMPLES = SAMPLE_RATE // 100  # 10ms frames, the rate a real mic delivers
FRAME_BYTES = FRAME_SAMPLES * 2


def mint_token(api: str, room: str, identity: str) -> str:
    """Through the real endpoint the browser uses — not a locally forged token, so this
    also covers LIVEKIT_API_KEY/SECRET actually being right."""
    request = urllib.request.Request(
        f"{api}/agent/livekit-token",
        data=json.dumps({"room": room, "identity": identity}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)["token"]


async def run(args: argparse.Namespace) -> int:
    pcm = open(args.pcm, "rb").read()
    token = mint_token(args.api, args.room, "e2e-speaker")
    print(f"minted a token for {args.room!r}; {len(pcm)} bytes of speech to play", flush=True)

    room = rtc.Room()
    finals: list[str] = []
    interims: list[str] = []

    async def consume(reader) -> None:
        text = await reader.read_all()
        final = (reader.info.attributes or {}).get("lk.transcription_final") == "true"
        (finals if final else interims).append(text)
        print(f"  transcript final={final}: {text!r}", flush=True)

    # Registered SYNCHRONOUSLY on purpose: the SDK does not await this callback, so an
    # `async def` here is never run and every transcript is silently discarded.
    room.register_text_stream_handler("lk.transcription", lambda reader, _p: asyncio.create_task(consume(reader)))

    agent_joined = asyncio.Event()

    @room.on("participant_connected")
    def _on_participant(participant) -> None:
        print(f"  agent joined: {participant.identity}", flush=True)
        agent_joined.set()

    await room.connect(args.url, token)
    source = rtc.AudioSource(SAMPLE_RATE, 1)
    track = rtc.LocalAudioTrack.create_audio_track("mic", source)
    await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    )

    try:
        await asyncio.wait_for(agent_joined.wait(), timeout=20)
    except asyncio.TimeoutError:
        print("FAIL: no agent was dispatched into the room within 20s.")
        print("      A worker registered with an agent_name does NOT auto-dispatch.")
        await room.disconnect()
        return 1

    await asyncio.sleep(1)  # let it subscribe before we start talking

    for offset in range(0, len(pcm) - FRAME_BYTES, FRAME_BYTES):
        await source.capture_frame(
            rtc.AudioFrame(pcm[offset : offset + FRAME_BYTES], SAMPLE_RATE, 1, FRAME_SAMPLES)
        )
        await asyncio.sleep(0.01)  # paced in real time; Transcribe expects a live stream

    # Trailing silence, so the recogniser decides the utterance has ended and emits a final.
    silence = b"\x00" * FRAME_BYTES
    for _ in range(200):
        await source.capture_frame(rtc.AudioFrame(silence, SAMPLE_RATE, 1, FRAME_SAMPLES))
        await asyncio.sleep(0.01)

    for _ in range(args.timeout):
        if finals:
            break
        await asyncio.sleep(1)

    await room.disconnect()

    print()
    if not finals:
        print(f"FAIL: no final transcript. interim segments seen: {len(interims)}")
        if interims:
            print("      Audio and STT are working; the utterance never closed.")
        return 1
    print(f"PASS: {len(interims)} interim segment(s), final transcript {finals[-1]!r}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://api:8000", help="API base URL, as seen from this container")
    parser.add_argument("--url", default="ws://livekit:7880", help="LiveKit URL, as seen from this container")
    parser.add_argument("--room", default="voice-e2e-check")
    parser.add_argument("--pcm", default="/tmp/speech.pcm", help="16kHz mono s16le PCM of the phrase")
    parser.add_argument("--timeout", type=int, default=20, help="seconds to wait for a final transcript")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
