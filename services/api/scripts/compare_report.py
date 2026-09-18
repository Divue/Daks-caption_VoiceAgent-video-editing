#!/usr/bin/env python3
"""Build comparison.md: every engine's Roman output next to your transcript, plus a
word-by-word walkthrough of one clip showing how the pipeline builds a caption."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline import align as align_mod  # noqa: E402
from app.pipeline import prosody, tag  # noqa: E402

BAKEOFF = Path(__file__).parent / "stt_bakeoff"
OUT, TRUTH = BAKEOFF / "out", BAKEOFF / "truth"
CLIPS = ["Excited_long_texts", "Angry", "Normal", "Real_reel"]
WALKTHROUGH = "Excited_long_texts"


def load(engine: str, clip: str) -> dict | None:
    path = OUT / f"{engine}.{clip}.json"
    return json.loads(path.read_text()) if path.exists() else None


def wer(truth: str, hyp: str, blind: bool = False) -> float:
    def norm(t):
        words = re.sub(r"[^\w\s]", " ", t.lower()).split()
        return [re.sub(r"(.)\1+", r"\1", w) for w in words] if blind else words
    r, h = norm(truth), norm(hyp)
    if not r:
        return float("nan")
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i]
        for j, hw in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw)))
        prev = cur
    return prev[-1] / len(r) * 100


lines = ["# Transcription comparison", "",
         "Every engine's Roman output against the hand-written transcript, on our own clips.",
         "WER = word error rate (lower is better). WER* ignores elongation ('helloooo' == 'hello'),",
         "since we add elongation on purpose.", ""]

rows = []
for clip in CLIPS:
    truth = (TRUTH / f"{clip}.txt").read_text().strip()
    for engine in ("sarvam", "transcribe-hi", "transcribe-en"):
        data = load(engine, clip)
        if data:
            rows.append((clip, engine, wer(truth, data["text"]), wer(truth, data["text"], True),
                         data.get("elapsedS", 0) + data.get("romanizeS", 0), len(data["words"])))

lines += ["## Scores", "", "| Clip | Engine | WER | WER* | Seconds | Word timings |", "| --- | --- | --- | --- | --- | --- |"]
for clip, engine, w, b, secs, nwords in rows:
    lines.append(f"| {clip} | {engine} | {w:.1f}% | {b:.1f}% | {secs:.1f}s | {'yes (' + str(nwords) + ')' if nwords else 'NO'} |")
lines.append("")

lines += ["## Side by side", ""]
for clip in CLIPS:
    lines += [f"### {clip}", "",
              "**Your transcript**  ", "> " + (TRUTH / f"{clip}.txt").read_text().strip(), ""]
    for engine, label in (("sarvam", "Sarvam (translit)"), ("transcribe-hi", "AWS Transcribe hi-IN + Bedrock"), ("transcribe-en", "AWS Transcribe en-IN")):
        data = load(engine, clip)
        if data:
            lines += [f"**{label}**  ", "> " + (data["text"].strip() or "_(empty)_"), ""]
    marks = TRUTH / f"{clip}.emotions.txt"
    if marks.exists() and marks.read_text().strip():
        pairs = [l.split("\t") for l in marks.read_text().strip().splitlines()]
        lines += ["**Emotions you marked:** " + ", ".join(f"`{w}` = {m}" for w, m in pairs), ""]

# --- walkthrough -----------------------------------------------------------
sar = load("sarvam", WALKTHROUGH)
tr = load("transcribe-hi", WALKTHROUGH)
timed = [{"text": w.get("textDevanagari") or w["text"], "startMs": w["startMs"], "endMs": w["endMs"]} for w in tr["words"]]
tokens = [t for t in re.split(r"[^\w']+", sar["text"]) if t]
aligned = align_mod.align(tokens, timed)
measured = prosody.analyze(str(BAKEOFF / "audio" / f"{WALKTHROUGH}.wav"), aligned)
tagged = tag.tag(measured)

lines += ["## Worked example: " + WALKTHROUGH + ".mp4", "",
          "How one clip becomes captions, word by word.", "",
          "| # | Transcribe (timing) | ms | Sarvam (text) | matched | held extra | caption | tag |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |"]
for i, (a, t) in enumerate(zip(aligned, tagged), 1):
    dev = next((w["text"] for w in timed if w["startMs"] == a["startMs"]), "-")
    repaired = " (repaired)" if t.get("repairedTiming") else ""
    s = t.get("signals", {})
    tags = []
    if t["emphasis"]:
        tags.append("emphasis")
    if t["emotion"] != "neutral":
        tags.append(f"{t['emotion']} x{t['stretch']}")
    lines.append(
        f"| {i} | {dev} | {t['startMs']}–{t['endMs']}{repaired} | {a['text']} | {'yes' if a['aligned'] else 'interpolated'} "
        f"| {s.get('extraMs', 0):.0f}ms | **{t['text']}** | {', '.join(tags) or '—'} |"
    )

out = BAKEOFF / "comparison.md"
out.write_text("\n".join(lines) + "\n")
print(f"wrote {out} ({len(lines)} lines)")
