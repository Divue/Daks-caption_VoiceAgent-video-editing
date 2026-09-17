"""STT engine adapters for the bake-off. Each returns a common result dict:

    {"text": str, "words": [{"text": str, "startMs": int, "endMs": int}], "raw": ...}

Add an engine by writing a function and registering it in ENGINES at the bottom.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path


def _ms(seconds: float | str) -> int:
    return int(round(float(seconds) * 1000))


# --- AWS Transcribe -------------------------------------------------------
def aws_transcribe(wav: Path, language: str = "en-IN") -> dict:
    """Batch job: upload the wav to S3, poll, then parse word items.

    language: "en-IN" usually returns Hinglish in Roman script; "hi-IN" returns Devanagari.
    """
    import boto3
    import urllib.request

    bucket = os.environ["S3_BUCKET"]
    prefix = os.environ.get("DEV_PREFIX", "p1")
    key = f"{prefix}/stt-bakeoff/{wav.name}"
    job = f"bakeoff-{language}-{wav.stem}-{uuid.uuid4().hex[:8]}"

    boto3.client("s3").upload_file(str(wav), bucket, key)
    tr = boto3.client("transcribe")
    tr.start_transcription_job(
        TranscriptionJobName=job,
        Media={"MediaFileUri": f"s3://{bucket}/{key}"},
        MediaFormat="wav",
        LanguageCode=language,
    )
    while True:
        status = tr.get_transcription_job(TranscriptionJobName=job)["TranscriptionJob"]
        state = status["TranscriptionJobStatus"]
        if state in ("COMPLETED", "FAILED"):
            break
        time.sleep(3)
    if state == "FAILED":
        raise RuntimeError(status.get("FailureReason", "transcribe job failed"))

    url = status["Transcript"]["TranscriptFileUri"]
    with urllib.request.urlopen(url) as r:
        raw = json.load(r)

    words = [
        {
            "text": it["alternatives"][0]["content"],
            "startMs": _ms(it["start_time"]),
            "endMs": _ms(it["end_time"]),
        }
        for it in raw["results"]["items"]
        if it["type"] == "pronunciation"
    ]
    return {"text": raw["results"]["transcripts"][0]["transcript"], "words": words, "raw": raw}


def aws_transcribe_hi(wav: Path) -> dict:
    return aws_transcribe(wav, language="hi-IN")


# --- ElevenLabs Scribe ----------------------------------------------------
def elevenlabs_scribe(wav: Path) -> dict:
    """Needs ELEVENLABS_API_KEY. Check the current API docs if the response shape differs."""
    import requests

    resp = requests.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
        data={"model_id": "scribe_v1"},
        files={"file": (wav.name, wav.open("rb"), "audio/wav")},
        timeout=300,
    )
    resp.raise_for_status()
    raw = resp.json()
    words = [
        {"text": w["text"], "startMs": _ms(w["start"]), "endMs": _ms(w["end"])}
        for w in raw.get("words", [])
        if w.get("type", "word") == "word"
    ]
    return {"text": raw.get("text", ""), "words": words, "raw": raw}


# --- Whisper (local, optional) -------------------------------------------
def whisper_local(wav: Path) -> dict:
    """pip install faster-whisper. First run downloads ~3GB."""
    from faster_whisper import WhisperModel

    model = WhisperModel(os.environ.get("WHISPER_MODEL", "large-v3"), compute_type="auto")
    segments, _ = model.transcribe(str(wav), word_timestamps=True, language=None)
    words, texts = [], []
    for seg in segments:
        texts.append(seg.text)
        for w in seg.words or []:
            words.append({"text": w.word.strip(), "startMs": _ms(w.start), "endMs": _ms(w.end)})
    return {"text": " ".join(texts).strip(), "words": words, "raw": None}


# --- Devanagari -> Roman via Bedrock -------------------------------------
def romanize(text: str) -> str:
    """Convert Devanagari Hinglish to the Roman script creators actually read."""
    import boto3

    client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    prompt = (
        "Transliterate the Hindi text below into Roman script the way Indian creators write "
        "Hinglish in captions. Keep English words as English. Do not translate. Do not explain. "
        "Return only the transliterated line.\n\n<text>\n" + text + "\n</text>"
    )
    out = client.converse(
        modelId=os.environ["BEDROCK_MODEL_ID"],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 2000, "temperature": 0},
    )
    return out["output"]["message"]["content"][0]["text"].strip()


ENGINES = {
    "transcribe-en": lambda wav: aws_transcribe(wav, "en-IN"),
    "transcribe-hi": aws_transcribe_hi,
    "scribe": elevenlabs_scribe,
    "whisper": whisper_local,
}


def romanize_words(words: list[dict]) -> list[dict]:
    """Transliterate word-by-word, keeping timings.

    The plain `romanize()` rewrites the whole transcript, which loses the 1:1 link to the
    word timestamps that stretch/emphasis detection needs. This sends the token list and
    demands exactly one Roman token back per input token.
    """
    import json as _json

    import boto3

    if not words:
        return words
    client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    out_words = [dict(w) for w in words]

    for start in range(0, len(out_words), 60):  # chunk so a long clip stays reliable
        chunk = out_words[start : start + 60]
        tokens = [w["text"] for w in chunk]
        prompt = (
            "Transliterate each token into Roman script the way Indian creators write Hinglish "
            "in captions. English words written in Devanagari become normal English spelling. "
            "Do not translate, merge, split, reorder or drop tokens. Use lowercase unless the token "
            "is a proper noun or an acronym; tokens are sent out of context, so do not capitalise "
            "sentence starts.\n"
            f"Return only a JSON array of exactly {len(tokens)} strings.\n\n"
            "<tokens>\n" + _json.dumps(tokens, ensure_ascii=False) + "\n</tokens>"
        )
        resp = client.converse(
            modelId=os.environ["BEDROCK_MODEL_ID"],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 4000, "temperature": 0},
        )
        text = resp["output"]["message"]["content"][0]["text"].strip()
        text = text[text.find("[") : text.rfind("]") + 1]
        try:
            roman = _json.loads(text)
        except _json.JSONDecodeError:
            roman = []
        if len(roman) != len(tokens):  # bad alignment: keep originals, flag it
            print(f"  !! alignment failed for tokens {start}-{start+len(tokens)}, kept Devanagari")
            continue
        for word, new in zip(chunk, roman):
            word["textDevanagari"], word["text"] = word["text"], str(new)
    return out_words
