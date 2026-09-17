#!/usr/bin/env python3
"""STT bake-off: prepare audio, run engines, score against ground truth.

    python bakeoff.py prepare                    # clips/*.mp4 -> audio/*.wav (16k mono)
    python bakeoff.py run transcribe-en scribe   # run engines, write out/<engine>.<clip>.json
    python bakeoff.py romanize transcribe-hi     # Devanagari output -> Roman, via Bedrock
    python bakeoff.py score                      # table: WER, script, timings, speed
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

HERE = Path(__file__).parent
CLIPS, AUDIO, OUT, TRUTH = HERE / "clips", HERE / "audio", HERE / "out", HERE / "truth"

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def normalize(text: str) -> list[str]:
    """Lowercase, drop punctuation and emoji, collapse spaces -> word list for WER."""
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[^\wऀ-ॿ\s]", " ", text)
    return text.split()


def wer(truth: str, hyp: str) -> tuple[float, int]:
    """Word error rate by Levenshtein distance over words."""
    r, h = normalize(truth), normalize(hyp)
    if not r:
        return float("nan"), 0
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i]
        for j, hw in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw)))
        prev = cur
    return prev[-1] / len(r), len(r)


def cmd_prepare(_args) -> None:
    AUDIO.mkdir(exist_ok=True)
    clips = sorted(p for p in CLIPS.iterdir() if p.suffix.lower() in {".mp4", ".mov", ".m4a", ".mp3", ".wav"})
    if not clips:
        sys.exit(f"put your test clips in {CLIPS}/ first")
    for clip in clips:
        wav = AUDIO / f"{clip.stem}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(clip), "-ac", "1", "-ar", "16000", "-vn", str(wav)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        print(f"{clip.name} -> {wav.name}")
        truth = TRUTH / f"{clip.stem}.txt"
        if not truth.exists():
            truth.write_text("")
            print(f"  !! write the ground-truth transcript into {truth.relative_to(HERE)}")


def cmd_run(args) -> None:
    from engines import ENGINES

    OUT.mkdir(exist_ok=True)
    wavs = sorted(AUDIO.glob("*.wav")) or sys.exit("run `prepare` first")
    for name in args.engines:
        if name not in ENGINES:
            sys.exit(f"unknown engine {name}; known: {', '.join(ENGINES)}")
        for wav in wavs:
            started = time.time()
            try:
                result = ENGINES[name](wav)
            except Exception as exc:  # keep going; one engine failing is a finding, not a crash
                print(f"{name:14} {wav.stem:10} FAILED: {exc}")
                continue
            result["elapsedS"] = round(time.time() - started, 1)
            result["engine"], result["clip"] = name, wav.stem
            (OUT / f"{name}.{wav.stem}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print(f"{name:14} {wav.stem:10} {result['elapsedS']:>5}s  {len(result['words'])} words")


def cmd_romanize(args) -> None:
    from engines import romanize

    for path in sorted(OUT.glob(f"{args.engine}.*.json")):
        data = json.loads(path.read_text())
        if not DEVANAGARI.search(data["text"]):
            print(f"{path.name}: already Roman, skipped")
            continue
        started = time.time()
        data["textDevanagari"], data["text"] = data["text"], romanize(data["text"])
        data["romanizeS"] = round(time.time() - started, 1)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"{path.name}: romanized (+{data['romanizeS']}s)")


def cmd_score(_args) -> None:
    rows = []
    for path in sorted(OUT.glob("*.json")):
        data = json.loads(path.read_text())
        truth_file = TRUTH / f"{data['clip']}.txt"
        truth = truth_file.read_text().strip() if truth_file.exists() else ""
        rate, n = (wer(truth, data["text"]) if truth else (float("nan"), 0))
        words = data["words"]
        gaps = sum(1 for a, b in zip(words, words[1:]) if b["startMs"] < a["endMs"])
        rows.append({
            "engine": data["engine"], "clip": data["clip"],
            "wer": rate, "truthWords": n, "words": len(words),
            "script": "devanagari" if DEVANAGARI.search(data["text"]) else "roman",
            "overlaps": gaps,
            "elapsedS": data.get("elapsedS", 0) + data.get("romanizeS", 0),
        })

    if not rows:
        sys.exit("nothing in out/ yet — run some engines first")

    print(f"\n{'engine':14} {'clip':10} {'WER':>7} {'script':11} {'words':>6} {'overlaps':>8} {'secs':>6}")
    for r in rows:
        w = "  n/a  " if r["wer"] != r["wer"] else f"{r['wer']*100:6.1f}%"
        print(f"{r['engine']:14} {r['clip']:10} {w} {r['script']:11} {r['words']:6} {r['overlaps']:8} {r['elapsedS']:6.1f}")

    print("\nper engine (mean WER over clips with ground truth):")
    for engine in sorted({r["engine"] for r in rows}):
        got = [r["wer"] for r in rows if r["engine"] == engine and r["wer"] == r["wer"]]
        if got:
            print(f"  {engine:14} {sum(got)/len(got)*100:5.1f}%")

    print("\nStill to check by hand (the scores above cannot tell you):")
    print("  - do word start times land on the audio? spot-check ~5 words per clip")
    print("  - are stretched words given long durations? that drives the stretch feature")
    print("  - is the Roman spelling what a creator would write (bhai, nahi, kya)?")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("prepare").set_defaults(func=cmd_prepare)
    run = sub.add_parser("run"); run.add_argument("engines", nargs="+"); run.set_defaults(func=cmd_run)
    rom = sub.add_parser("romanize"); rom.add_argument("engine"); rom.set_defaults(func=cmd_romanize)
    sub.add_parser("score").set_defaults(func=cmd_score)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
