"""The pipeline: two ASR passes in parallel, aligned, measured, tagged.

Text comes from Sarvam (best Hinglish Roman, no timings). Timings come from AWS Transcribe
(word level, Devanagari). align() joins them. Prosody and stretch are arithmetic; Bedrock is
used once, for anger.
"""
from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor

import soundfile

from .. import jobctx
from ..config import get_settings
from ..costs import cost_event
from . import align as align_mod
from . import build, prosody, stt, tag

SARVAM_MODEL = "saaras:v3"

WORD_SPLIT = re.compile(r"[^\w'ऀ-ॿ]+")


def sarvam_text(wav_path: str, audio_seconds: float = 0.0) -> str:
    """Sarvam Saaras v3 in translit mode: Hinglish in Roman script, ~2s."""
    import requests

    key = get_settings().sarvam_api_key
    if not key:
        raise RuntimeError("SARVAM_API_KEY not set")
    with cost_event(stage="sarvam", service="sarvam", model_id=SARVAM_MODEL) as ev:
        ev.audio(audio_seconds)
        with open(wav_path, "rb") as fh:
            resp = requests.post(
                "https://api.sarvam.ai/speech-to-text",
                headers={"api-subscription-key": key},
                data={"model": SARVAM_MODEL, "mode": "translit"},
                files={"file": (os.path.basename(wav_path), fh, "audio/wav")},
                timeout=300,
            )
        if not resp.ok:  # keep Sarvam's own message; raise_for_status drops the body
            raise RuntimeError(f"sarvam HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json().get("transcript", "")


def _sarvam_stage(wav_path: str, audio_seconds: float) -> str:
    """Never raises: Sarvam is the better text source but not a hard dependency."""
    if not get_settings().sarvam_api_key:
        jobctx.report("sarvam", "skipped", detail="SARVAM_API_KEY not set; Bedrock romanisation fallback")
        return ""
    jobctx.report("sarvam", "running")
    try:
        text = sarvam_text(wav_path, audio_seconds)
    except Exception as exc:  # Sarvam down, out of quota, or clip too long for the sync API
        print(f"sarvam failed ({exc}); falling back to Transcribe text")
        jobctx.report("sarvam", "failed", error=str(exc)[:300],
                      detail="falling back to Transcribe text romanised by Bedrock")
        return ""
    jobctx.report("sarvam", "done" if text else "failed",
                  error=None if text else "empty transcript")
    return text


def transcribe_words(s3_uri: str, audio_seconds: float = 0.0) -> list[dict]:
    """AWS Transcribe hi-IN: Devanagari tokens with start/end times."""
    jobctx.report("transcribe", "running")
    try:
        words = stt.transcribe(s3_uri, audio_seconds=audio_seconds)
    except Exception as exc:
        jobctx.report("transcribe", "failed", error=str(exc)[:300])
        raise
    jobctx.report("transcribe", "done", detail=f"{len(words)} words")
    return words


def words_from_sources(wav_path: str, s3_uri: str) -> list[dict]:
    """Run both engines at once, then align. Falls back to Transcribe alone."""
    audio_seconds = soundfile.info(wav_path).duration
    with ThreadPoolExecutor(max_workers=2) as pool:
        # jobctx.submit carries the job context (project id, stage reporting) into the threads
        text_job = jobctx.submit(pool, _sarvam_stage, wav_path, audio_seconds)
        timing_job = jobctx.submit(pool, transcribe_words, s3_uri, audio_seconds)
        text = text_job.result()
        timed = timing_job.result()

    jobctx.report("align", "running")
    if not text:
        words = stt.romanize_words(timed)  # Bedrock transliteration fallback
        jobctx.report("align", "done", detail="no Sarvam text: Transcribe words romanised by Bedrock")
        return words
    tokens = [t for t in WORD_SPLIT.split(text) if t]
    words = align_mod.align(tokens, timed)
    matched = sum(1 for w in words if w.get("aligned"))
    jobctx.report("align", "done", detail=f"{matched}/{len(words)} Sarvam words matched a Transcribe timing")
    return words


def _stage(name: str, fn, *args):
    jobctx.report(name, "running")
    try:
        out = fn(*args)
    except Exception as exc:
        jobctx.report(name, "failed", error=str(exc)[:300])
        raise
    jobctx.report(name, "done")
    return out


def run(*, wav_path: str, s3_uri: str, video_url: str, duration_ms: int,
        width: int = 1080, height: int = 1920, project_id: str | None = None,
        preset_id: str = "kathmandu") -> dict:
    words = words_from_sources(wav_path, s3_uri)
    words = _stage("prosody", prosody.analyze, wav_path, words)
    words = _stage("tag", tag.tag, words)
    return _stage("build", lambda: build.build_project(
        video_url=video_url, duration_ms=duration_ms, width=width, height=height,
        words=words, project_id=project_id, preset_id=preset_id,
    ))
