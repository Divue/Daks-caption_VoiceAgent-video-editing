#!/usr/bin/env python3
"""Run the pipeline over one bake-off clip and write a real Project JSON.

    python scripts/pipeline_demo.py Normal

Reuses the transcript already fetched by the bake-off (out/transcribe-hi.<clip>.json) when it
exists, so it costs no Transcribe minutes; pass --transcribe to force a fresh run via S3.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline import build, prosody, stt, tag  # noqa: E402
from app.schema import Project  # noqa: E402

BAKEOFF = Path(__file__).parent / "stt_bakeoff"
FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "shared" / "fixtures"


def video_size(path: Path) -> tuple[int, int, int]:
    """(width, height, durationMs) via ffprobe, falling back to a vertical default."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height:format=duration", "-of", "json", str(path)],
            capture_output=True, text=True, check=True,
        ).stdout
        data = json.loads(out)
        stream = data["streams"][0]
        return stream["width"], stream["height"], int(float(data["format"]["duration"]) * 1000)
    except Exception:
        return 1080, 1920, 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("clip")
    parser.add_argument("--transcribe", action="store_true", help="re-run Transcribe instead of reusing the bake-off output")
    args = parser.parse_args()

    wav = BAKEOFF / "audio" / f"{args.clip}.wav"
    if not wav.exists():
        sys.exit(f"no audio at {wav} — run the bake-off prepare step first")

    cached = BAKEOFF / "out" / f"transcribe-hi.{args.clip}.json"
    if cached.exists() and not args.transcribe:
        words = json.loads(cached.read_text())["words"]
        print(f"transcript: reused {cached.name} ({len(words)} words)")
    else:
        bucket, prefix = os.environ["S3_BUCKET"], os.environ.get("DEV_PREFIX", "p1")
        key = f"{prefix}/pipeline/{wav.name}"
        import boto3

        boto3.client("s3").upload_file(str(wav), bucket, key)
        words = stt.romanize_words(stt.transcribe(f"s3://{bucket}/{key}"))
        print(f"transcript: {len(words)} words from Transcribe")

    words = prosody.analyze(str(wav), words)
    print("prosody: loudness, pitch and rate attached")

    words = tag.tag(words)
    counts = {
        "emphasis": sum(w["emphasis"] for w in words),
        "excited": sum(w["emotion"] == "excited" for w in words),
        "angry": sum(w["emotion"] == "angry" for w in words),
    }
    print(f"tagged: {counts}")

    clip_file = next((p for p in (BAKEOFF / "clips").glob(f"{args.clip}.*") if p.suffix != ".wav"), None)
    width, height, duration = video_size(clip_file) if clip_file else (1080, 1920, 0)
    project = build.build_project(
        video_url=clip_file.name if clip_file else f"{args.clip}.mp4",
        duration_ms=duration or max(w["endMs"] for w in words) + 500,
        width=width, height=height, words=words, project_id=args.clip.lower(),
    )
    Project.model_validate(project)  # fails loudly if we drift from the shared schema

    FIXTURES.mkdir(parents=True, exist_ok=True)
    out = FIXTURES / f"{args.clip.lower()}-project.json"
    out.write_text(json.dumps(project, ensure_ascii=False, indent=2))
    print(f"wrote {out}")

    for w in project["words"]:
        if w["emphasis"] or w["emotion"] != "neutral":
            print(f"  {w['startMs']:6}ms {w['text']:16} emphasis={w['emphasis']} {w['emotion']} x{w['stretch']}")


if __name__ == "__main__":
    main()
