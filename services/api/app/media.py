"""ffprobe / ffmpeg helpers for the audio stage. Both binaries are in the Docker image."""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass


class MediaError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaInfo:
    duration_ms: int
    width: int          # as displayed, i.e. after rotation metadata
    height: int
    has_audio: bool


def _run(cmd: list[str], timeout: int = 120) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise MediaError(f"{cmd[0]} failed: {proc.stderr.strip()[-400:]}")
    return proc.stdout


def _rotation(stream: dict) -> int:
    """Phone video stores portrait as landscape + a rotation; either as a tag or as side data."""
    rotate = (stream.get("tags") or {}).get("rotate")
    if rotate is not None:
        return int(float(rotate))
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            return int(float(side["rotation"]))
    return 0


def probe(path: str) -> MediaInfo:
    data = json.loads(_run(["ffprobe", "-v", "error", "-print_format", "json",
                            "-show_format", "-show_streams", path]))
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise MediaError("no video stream")
    duration = float((data.get("format") or {}).get("duration") or video.get("duration") or 0)
    if duration <= 0:
        raise MediaError("could not read duration")
    width, height = int(video["width"]), int(video["height"])
    if abs(_rotation(video)) % 180 == 90:
        width, height = height, width
    return MediaInfo(duration_ms=int(round(duration * 1000)), width=width, height=height,
                     has_audio=any(s.get("codec_type") == "audio" for s in streams))


def extract_wav(src: str, dst: str) -> None:
    """16 kHz mono PCM WAV — the format every measurement in audit 11 was taken on."""
    _run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000",
          "-c:a", "pcm_s16le", dst], timeout=300)
