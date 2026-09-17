"""Audio signals per word: loudness, pitch and speaking rate, all relative to the speaker.

Everything is measured against this speaker in this clip. Absolute thresholds fail: the
reel speaker talks at 140ms/syllable while the calm speaker sits at 270ms, so a fixed
number flags every short word for one and nothing for the other.
"""
from __future__ import annotations

import re
import statistics

import librosa
import numpy as np

VOWEL_GROUP = re.compile(r"[aeiou]+", re.IGNORECASE)


def syllables(word: str) -> int:
    """Rough syllable count for Hinglish in Roman script."""
    return max(1, len(VOWEL_GROUP.findall(word)))


def _z(values: list[float]) -> list[float]:
    if len(values) < 2:
        return [0.0] * len(values)
    mean = statistics.fmean(values)
    sd = statistics.pstdev(values) or 1.0
    return [(v - mean) / sd for v in values]


def analyze(wav_path: str, words: list[dict]) -> list[dict]:
    """Attach {loudnessZ, pitchZ, durationRatio} to each word."""
    if not words:
        return words

    y, sr = librosa.load(wav_path, sr=16000, mono=True)
    hop = 256  # 16ms frames
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max(rms) or 1.0)
    f0 = librosa.yin(y, fmin=65, fmax=400, sr=sr, hop_length=hop)
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop) * 1000

    loudness, pitch, rate = [], [], []
    for word in words:
        span = (times >= word["startMs"]) & (times <= word["endMs"])
        frames = np.flatnonzero(span)
        loudness.append(float(rms_db[frames].mean()) if frames.size else float(rms_db.min()))
        voiced = f0[frames] if frames.size else np.array([])
        voiced = voiced[(voiced > 70) & (voiced < 390)]
        pitch.append(float(np.median(voiced)) if voiced.size else float("nan"))
        rate.append((word["endMs"] - word["startMs"]) / syllables(word["text"]))

    # Unvoiced words get the speaker's median pitch, so they read as neutral.
    voiced_pitch = [p for p in pitch if p == p]
    fallback = statistics.median(voiced_pitch) if voiced_pitch else 0.0
    pitch = [p if p == p else fallback for p in pitch]

    median_rate = statistics.median(rate)
    loud_z, pitch_z = _z(loudness), _z(pitch)

    out = []
    for word, lz, pz, r in zip(words, loud_z, pitch_z, rate):
        held_for = (r - median_rate) * syllables(word["text"])
        out.append({
            **word,
            "signals": {
                "loudnessZ": round(lz, 2),
                "pitchZ": round(pz, 2),
                "durationRatio": round(r / median_rate, 2),
                "extraMs": round(held_for),
            },
        })
    return out
