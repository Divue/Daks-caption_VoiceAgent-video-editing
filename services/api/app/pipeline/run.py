"""The pipeline: two ASR passes in parallel, aligned, measured, tagged.

Text comes from Sarvam (best Hinglish Roman, no timings). Timings come from AWS Transcribe
(word level, Devanagari). align() joins them. Prosody and stretch are arithmetic; Bedrock is
used once, for anger.
"""
from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor

from . import align as align_mod
from . import build, prosody, stt, tag

WORD_SPLIT = re.compile(r"[^\w'ऀ-ॿ]+")


def sarvam_text(wav_path: str) -> str:
    """Sarvam Saaras v3 in translit mode: Hinglish in Roman script, ~2s."""
    import requests

    with open(wav_path, "rb") as fh:
        resp = requests.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"api-subscription-key": os.environ["SARVAM_API_KEY"]},
            data={"model": "saaras:v3", "mode": "translit"},
            files={"file": (os.path.basename(wav_path), fh, "audio/wav")},
            timeout=300,
        )
    resp.raise_for_status()
    return resp.json().get("transcript", "")


def transcribe_words(s3_uri: str) -> list[dict]:
    """AWS Transcribe hi-IN: Devanagari tokens with start/end times."""
    return stt.transcribe(s3_uri)


def words_from_sources(wav_path: str, s3_uri: str) -> list[dict]:
    """Run both engines at once, then align. Falls back to either one alone."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        text_job = pool.submit(sarvam_text, wav_path)
        timing_job = pool.submit(transcribe_words, s3_uri)
        try:
            text = text_job.result()
        except Exception as exc:  # Sarvam down or out of quota
            print(f"sarvam failed ({exc}); falling back to Transcribe text")
            text = ""
        timed = timing_job.result()

    if not text:
        return stt.romanize_words(timed)  # Bedrock transliteration fallback
    tokens = [t for t in WORD_SPLIT.split(text) if t]
    return align_mod.align(tokens, timed)


def run(*, wav_path: str, s3_uri: str, video_url: str, duration_ms: int,
        width: int = 1080, height: int = 1920, project_id: str | None = None) -> dict:
    words = words_from_sources(wav_path, s3_uri)
    words = prosody.analyze(wav_path, words)
    words = tag.tag(words)
    return build.build_project(
        video_url=video_url, duration_ms=duration_ms, width=width, height=height,
        words=words, project_id=project_id,
    )
