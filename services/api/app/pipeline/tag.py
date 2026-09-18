"""Turn audio signals into caption styling: stretch, emphasis, tone.

Thresholds were set on the Day 1 test clips and are meant to be tuned. Every tag can be
overridden by the user in the editor or by the voice agent, so err on the side of fewer tags.

Two of the three are percentile-based *within the clip*, because absolute thresholds fail across
speakers (prosody.py). Emphasis is a budget: the loudest ~15% of words, with function words
penalised, which is the eval harness's measured rule. Tone comes from semantics.py, per line.
Stretch stays a pure two-part numeric test; the LLM's held flag is logged, never applied.
"""
from __future__ import annotations

import json
import re

from .. import jobctx
from . import semantics

STRETCH_RATIO = 2.0      # duration per syllable vs this speaker's median
STRETCH_MIN_MS = 250     # and it must actually be held this much longer, in absolute time
MS_PER_EXTRA_CHAR = 120  # one repeated letter per this much held time
MAX_EXTRA_CHARS = 5
MAX_WORD_CHARS = 14      # captions still have to fit the frame
EMPHASIS_BUDGET = 0.85   # emphasise words above this percentile of the emphasis score
STOPWORD_FACTOR = 0.55   # a function word must be much louder to earn the same emphasis
GAP_FULL_MS = 400.0      # a pause this long before a word counts fully towards emphasis

# Hinglish + English function words. A word here can still be emphasised, but it has to
# out-score content words by a margin (measured fix for "should/just/the", audit 11 §5.2).
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "is", "are",
    "am", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "i", "you",
    "he", "she", "we", "they", "me", "my", "your", "our", "their", "just", "should", "would",
    "could", "can", "will", "do", "does", "did", "have", "has", "had", "not", "no", "yes", "very",
    "really", "now", "then", "here", "there", "what", "how", "why", "when", "who",
    "hai", "hain", "ho", "hoon", "hu", "tha", "thi", "ka", "ki", "ke", "ko", "se", "me",
    "mein", "par", "aur", "ya", "bhi", "hi", "to", "toh", "na", "nahi", "nai", "ni", "kya", "kyu",
    "kyun", "jo", "wo", "woh", "yeh", "ye", "ab", "phir", "bas", "ek", "uh", "um", "aa", "arre",
}

VOWEL_GROUP = re.compile(r"([aeiou]+)(?!.*[aeiou])", re.IGNORECASE)


def is_stretched(signals: dict) -> bool:
    """Both tests must pass: long for this speaker, AND long in absolute time.

    The ratio alone fires on fast speakers — in the Day 1 reel (140ms/syllable) ordinary
    words like "track" hit 2.6x on a 220ms pause. The absolute floor drops those.
    """
    return signals.get("durationRatio", 1) >= STRETCH_RATIO and signals.get("extraMs", 0) >= STRETCH_MIN_MS


def is_stopword(text: str) -> bool:
    return re.sub(r"[^a-z]", "", text.lower()) in STOPWORDS


def _percentile_rank(values: list[float]) -> list[float]:
    """Fraction of the clip's words each word scores above. Baselines are per speaker, per clip."""
    if not values:
        return []
    return [sum(1 for other in values if other < value) / len(values) for value in values]


def emphasis_scores(words: list[dict]) -> list[float]:
    """The eval harness's measured mix: loudness, pitch, and the pause before the word.

    Weights and the 0.55 function-word factor are ported from caption_eval's s7_score, which
    landed at 13-15% emphasised words on all four clips. tag.py's old z-score thresholds gave
    28% on Angry and 26% on Real_reel (audit 12 §3) - a third of the frame moving at once.
    """
    loud = _percentile_rank([(w.get("signals") or {}).get("loudnessZ", 0.0) for w in words])
    pitch = _percentile_rank([(w.get("signals") or {}).get("pitchZ", 0.0) for w in words])
    gaps = []
    for index, word in enumerate(words):
        previous_end = words[index - 1]["endMs"] if index else 0
        gaps.append(min(max(word["startMs"] - previous_end, 0) / GAP_FULL_MS, 1.0))
    raw = [0.5 * l + 0.35 * p + 0.15 * g for l, p, g in zip(loud, pitch, gaps)]
    return [score * (STOPWORD_FACTOR if is_stopword(w["text"]) else 1.0)
            for score, w in zip(raw, words)]


def stretch_text(text: str, extra_ms: float) -> str:
    """"guys" held 590ms longer -> "guuuuuys": repeated letters in proportion to the drawl.

    NOT called by the pipeline: elongation is carried by Word.stretch, never by repeating letters
    in Word.text (.claude/INDEX.md; audit 11 §5.3 measured "STT"->"ST"). Kept as the reference
    arithmetic for the renderer (P2): the repeat count comes from signals.extraMs, not from
    `stretch` (which is durationRatio) — plan §8.1.
    """
    repeats = max(1, min(round(extra_ms / MS_PER_EXTRA_CHAR), MAX_EXTRA_CHARS))
    repeats = min(repeats, max(1, MAX_WORD_CHARS - len(text)))
    return VOWEL_GROUP.sub(lambda m: m.group(1) + m.group(1)[-1] * repeats, text, count=1)


TONE_EMOTION = {"anger": "angry", "hype": "excited", "neutral": None}


def tag(words: list[dict], *, use_llm: bool = True) -> list[dict]:
    """Add emphasis / emotion / stretch to each word, in place of the ASR's flat output."""
    if not words:
        return []
    sem = semantics.analyze(words) if use_llm else semantics.Semantics(["neutral"] * len(words))
    ranked = _percentile_rank(emphasis_scores(words))

    tagged = []
    for index, word in enumerate(words):
        s = word.get("signals") or {"loudnessZ": 0, "pitchZ": 0, "durationRatio": 1, "extraMs": 0}
        stretched = is_stretched(s)
        # Line tone wins over the stretch hint: a held word inside an angry line is still angry.
        emotion = TONE_EMOTION.get(sem.tones[index]) or ("excited" if stretched else "neutral")
        tagged.append({
            **word,
            "emphasis": ranked[index] >= EMPHASIS_BUDGET,
            "emotion": emotion,
            "stretch": round(s["durationRatio"], 2) if stretched else 1.0,
        })

    _log_tagging(tagged, sem)
    return tagged


def _log_tagging(tagged: list[dict], sem: semantics.Semantics) -> None:
    """One structured line per clip, including the LLM held flags we deliberately do not apply.

    Measured on the previous session's saved outputs: the held flag alone produced 0 true
    positives and was unstable across prompt versions, so stretch is numeric-only. Logging both
    is what makes a later comparison possible without another paid run.
    """
    numeric = {i for i, w in enumerate(tagged) if w["stretch"] > 1.0}
    payload = {
        "words": len(tagged),
        "emphasisPct": round(100 * sum(1 for w in tagged if w["emphasis"]) / len(tagged), 1),
        "tones": sem.counts(),
        "semanticsOk": sem.ok,
        "note": sem.note,
        "stretchNumeric": sorted(tagged[i]["text"] for i in numeric),
        "stretchLlmAdvisory": sorted(tagged[i]["text"] for i in sem.held if i < len(tagged)),
        "stretchAgreement": sorted(tagged[i]["text"] for i in numeric & sem.held),
    }
    print("tagging " + json.dumps(payload, ensure_ascii=False), flush=True)
    jobctx.report("tag", "running", detail=(f"{payload['emphasisPct']}% emphasis, "
                                            f"tones {payload['tones']}"))
