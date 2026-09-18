"""Give Sarvam's text the timings from AWS Transcribe.

Sarvam writes the best Hinglish Roman text but returns one timestamp for the whole clip.
Transcribe returns per-word timings but in Devanagari. So we match the two token streams
and hand each Sarvam word the timing of the Transcribe word it corresponds to.

The matching is Needleman-Wunsch over phonetic keys — deterministic and inspectable. An LLM
asked to align 95 tokens will quietly drop one and shift every timestamp after it.
"""
from __future__ import annotations

import re

from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
MATCH, MISMATCH, GAP = 2.0, -1.0, -1.0


def phonetic_key(word: str) -> str:
    """Both scripts reduced to a comparable skeleton: no vowels, no doubles, no case."""
    if DEVANAGARI.search(word):
        word = transliterate(word, sanscript.DEVANAGARI, sanscript.ITRANS)
    word = re.sub(r"[^a-z]", "", word.lower())
    word = re.sub(r"(.)\1+", r"\1", word)          # helloooo -> helo
    word = word.replace("aa", "a").replace("ee", "i").replace("oo", "u")
    return re.sub(r"[aeiou]", "", word) or word     # consonant skeleton
def similarity(a: str, b: str) -> float:
    """1.0 identical skeletons, 0.0 nothing in common."""
    ka, kb = phonetic_key(a), phonetic_key(b)
    if not ka or not kb:
        return 0.0
    if ka == kb:
        return 1.0
    # normalised edit distance
    prev = list(range(len(kb) + 1))
    for i, ca in enumerate(ka, 1):
        cur = [i]
        for j, cb in enumerate(kb, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return max(0.0, 1 - prev[-1] / max(len(ka), len(kb)))


def align(text_words: list[str], timed_words: list[dict]) -> list[dict]:
    """Return text_words carrying startMs/endMs borrowed from timed_words."""
    if not timed_words:
        return [{"text": w, "startMs": 0, "endMs": 0} for w in text_words]
    if not text_words:
        return timed_words

    n, m = len(text_words), len(timed_words)
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[""] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        score[i][0], back[i][0] = i * GAP, "up"
    for j in range(1, m + 1):
        score[0][j], back[0][j] = j * GAP, "left"

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sim = similarity(text_words[i - 1], timed_words[j - 1]["text"])
            diag = score[i - 1][j - 1] + (MATCH * sim if sim > 0.4 else MISMATCH)
            up, left = score[i - 1][j] + GAP, score[i][j - 1] + GAP
            best = max(diag, up, left)
            score[i][j] = best
            back[i][j] = "diag" if best == diag else ("up" if best == up else "left")

    pairs: dict[int, list[int]] = {}
    i, j = n, m
    while i > 0 or j > 0:
        move = back[i][j] if (i > 0 and j > 0) else ("up" if i > 0 else "left")
        if move == "diag":
            pairs.setdefault(i - 1, []).append(j - 1)
            i, j = i - 1, j - 1
        elif move == "up":
            i -= 1
        else:
            j -= 1

    out, last_end = [], 0
    for index, word in enumerate(text_words):
        matched = sorted(pairs.get(index, []))
        if matched:
            start = timed_words[matched[0]]["startMs"]
            end = timed_words[matched[-1]]["endMs"]
        else:  # unmatched word: sit it between its neighbours, zero-width
            start = end = last_end
        out.append({"text": word, "startMs": start, "endMs": max(end, start), "aligned": bool(matched)})
        last_end = out[-1]["endMs"]
    return _fill_gaps(out)


def _fill_gaps(words: list[dict]) -> list[dict]:
    """Share a matched word's span with the unmatched words squeezed next to it."""
    i = 0
    while i < len(words):
        if words[i]["aligned"]:
            i += 1
            continue
        run_start = i
        while i < len(words) and not words[i]["aligned"]:
            i += 1
        before = words[run_start - 1]["endMs"] if run_start else 0
        after = words[i]["startMs"] if i < len(words) else before + 200 * (i - run_start)
        span = max(after - before, 60 * (i - run_start))
        step = span / (i - run_start)
        for k in range(run_start, i):
            words[k]["startMs"] = int(before + step * (k - run_start))
            words[k]["endMs"] = int(before + step * (k - run_start + 1))
    return words
