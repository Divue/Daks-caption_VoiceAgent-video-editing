"""The pipeline: two ASR passes in parallel, aligned, measured, tagged.

Text comes from Sarvam (best Hinglish Roman, no timings). Timings come from AWS Transcribe
(word level, Devanagari). align() joins them. Prosody and stretch are arithmetic; Bedrock is
used once, for anger.
"""
from __future__ import annotations

import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor

import soundfile

from .. import jobctx
from ..config import get_settings
from ..costs import cost_event
from . import align as align_mod
from . import build, prosody, stt, tag

SARVAM_MODEL = "saaras:v3"

WORD_SPLIT = re.compile(r"[^\w'ऀ-ॿ]+")


# Sarvam's synchronous API rejects audio over 30 s ("use the batch API for longer audio files").
# Longer clips are cut into pieces: the first as close to 30 s as is safe, the rest ~28 s, each cut
# made at the quietest moment before the limit so no word is split between two pieces.
SARVAM_MAX_S = 30.0
FIRST_CHUNK_S = 29.5   # just under the limit: the API measures duration itself
NEXT_CHUNK_S = 28.0
CUT_SEARCH_S = 3.0     # look this far back from the target for a pause to cut at


def chunk_bounds(samples, sr: int) -> list[tuple[int, int]]:
    """Sample ranges, each under Sarvam's 30 s limit, cut at the quietest 20 ms before the target."""
    import numpy as np

    total = len(samples)
    if total <= FIRST_CHUNK_S * sr:
        return [(0, total)]
    frame = max(1, int(0.02 * sr))
    bounds, start, target_s = [], 0, FIRST_CHUNK_S
    while total - start > target_s * sr:
        hi = start + int(target_s * sr)
        lo = max(start + frame, hi - int(CUT_SEARCH_S * sr))
        window = np.asarray(samples[lo:hi], dtype="float64")
        n = len(window) // frame
        energy = (window[: n * frame].reshape(n, frame) ** 2).mean(axis=1)
        cut = lo + int(energy.argmin()) * frame + frame // 2
        bounds.append((start, cut))
        start, target_s = cut, NEXT_CHUNK_S
    bounds.append((start, total))
    return bounds


def _sarvam_request(path: str, audio_seconds: float) -> str:
    """One synchronous Saaras call on a file of at most 30 s."""
    import requests

    key = get_settings().sarvam_api_key
    with cost_event(stage="sarvam", service="sarvam", model_id=SARVAM_MODEL) as ev:
        ev.audio(audio_seconds)
        with open(path, "rb") as fh:
            resp = requests.post(
                "https://api.sarvam.ai/speech-to-text",
                headers={"api-subscription-key": key},
                data={"model": SARVAM_MODEL, "mode": "translit"},
                files={"file": (os.path.basename(path), fh, "audio/wav")},
                timeout=300,
            )
        if not resp.ok:  # keep Sarvam's own message; raise_for_status drops the body
            raise RuntimeError(f"sarvam HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json().get("transcript", "")


def sarvam_text(wav_path: str, audio_seconds: float = 0.0) -> str:
    """Sarvam Saaras v3 in translit mode: Hinglish in Roman script, ~2s per piece.

    A clip over 30 s is sent as several pieces at once and their text joined in order. If any
    piece fails the whole call fails: text with a hole in it would misalign every word after it.
    """
    if not get_settings().sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY not set")
    samples, sr = soundfile.read(wav_path)
    bounds = chunk_bounds(samples, sr)
    if len(bounds) == 1:
        return _sarvam_request(wav_path, audio_seconds)

    with tempfile.TemporaryDirectory(prefix="sarvam-") as tmp:
        paths = []
        for index, (a, b) in enumerate(bounds):
            path = os.path.join(tmp, f"piece{index}.wav")
            soundfile.write(path, samples[a:b], sr, subtype="PCM_16")
            paths.append((path, (b - a) / sr))
        with ThreadPoolExecutor(max_workers=min(4, len(paths))) as pool:
            jobs = [jobctx.submit(pool, _sarvam_request, path, secs) for path, secs in paths]
            texts = [job.result() for job in jobs]
    return " ".join(t.strip() for t in texts if t.strip())


def _sarvam_stage(wav_path: str, audio_seconds: float) -> str:
    """Never raises: Sarvam is the better text source but not a hard dependency."""
    if not get_settings().sarvam_api_key:
        jobctx.report("sarvam", "skipped", detail="SARVAM_API_KEY not set; Bedrock romanisation fallback")
        return ""
    jobctx.report("sarvam", "running")
    try:
        text = sarvam_text(wav_path, audio_seconds)
    except Exception as exc:  # Sarvam down, out of quota, or one piece rejected
        print(f"sarvam failed ({exc}); falling back to Transcribe text")
        jobctx.report("sarvam", "failed", error=str(exc)[:300],
                      detail="falling back to Transcribe text romanised by Bedrock")
        return ""
    pieces = len(chunk_bounds(*soundfile.read(wav_path))) if audio_seconds > FIRST_CHUNK_S else 1
    jobctx.report("sarvam", "done" if text else "failed", error=None if text else "empty transcript",
                  detail=f"{pieces} pieces under {SARVAM_MAX_S:.0f}s" if pieces > 1 else None)
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
        preset_id: str = "rangmanch") -> dict:
    words = words_from_sources(wav_path, s3_uri)
    words = _stage("prosody", prosody.analyze, wav_path, words)
    words = _stage("tag", tag.tag, words)
    return _stage("build", lambda: build.build_project(
        video_url=video_url, duration_ms=duration_ms, width=width, height=height,
        words=words, project_id=project_id, preset_id=preset_id,
    ))
