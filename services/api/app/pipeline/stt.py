"""Speech-to-text: AWS Transcribe hi-IN, then Bedrock word-level transliteration.

Chosen in the Day 1 bake-off: en-IN returned 0 words on a real reel and garbled Hindi;
hi-IN transcribes reliably but in Devanagari, so every word is transliterated back to the
Roman script creators actually caption in — one Roman token per Devanagari token, so the
word timings survive.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
import uuid

import boto3

BEDROCK_REGION = os.environ.get("AWS_REGION", "ap-south-1")


def _ms(seconds: str | float) -> int:
    return int(round(float(seconds) * 1000))


def transcribe(s3_uri: str, media_format: str = "wav", language: str = "hi-IN") -> list[dict]:
    """Run a Transcribe job over an object already in S3. Returns [{text, startMs, endMs}]."""
    client = boto3.client("transcribe", region_name=BEDROCK_REGION)
    job = f"captions-{uuid.uuid4().hex[:12]}"
    client.start_transcription_job(
        TranscriptionJobName=job,
        Media={"MediaFileUri": s3_uri},
        MediaFormat=media_format,
        LanguageCode=language,
    )
    while True:
        status = client.get_transcription_job(TranscriptionJobName=job)["TranscriptionJob"]
        if status["TranscriptionJobStatus"] in ("COMPLETED", "FAILED"):
            break
        time.sleep(2)
    if status["TranscriptionJobStatus"] == "FAILED":
        raise RuntimeError(status.get("FailureReason", "transcribe failed"))

    with urllib.request.urlopen(status["Transcript"]["TranscriptFileUri"]) as response:
        raw = json.load(response)
    return [
        {"text": item["alternatives"][0]["content"], "startMs": _ms(item["start_time"]), "endMs": _ms(item["end_time"])}
        for item in raw["results"]["items"]
        if item["type"] == "pronunciation"
    ]


def romanize_words(words: list[dict], chunk_size: int = 60) -> list[dict]:
    """Devanagari tokens -> Roman, one for one, so timings stay attached to their word."""
    if not words:
        return words
    client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    out = [dict(w) for w in words]

    for start in range(0, len(out), chunk_size):
        chunk = out[start : start + chunk_size]
        tokens = [w["text"] for w in chunk]
        prompt = (
            "Transliterate each token into Roman script the way Indian creators write Hinglish in "
            "captions. English words written in Devanagari become normal English spelling. Do not "
            "translate, merge, split, reorder or drop tokens. Use lowercase unless the token is a "
            "proper noun or an acronym; tokens are sent out of context, so do not capitalise "
            f"sentence starts.\nReturn only a JSON array of exactly {len(tokens)} strings.\n\n"
            "<tokens>\n" + json.dumps(tokens, ensure_ascii=False) + "\n</tokens>"
        )
        response = client.converse(
            modelId=os.environ["BEDROCK_MODEL_ID"],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 4000, "temperature": 0},
        )
        text = response["output"]["message"]["content"][0]["text"].strip()
        text = text[text.find("[") : text.rfind("]") + 1]
        try:
            roman = json.loads(text)
        except json.JSONDecodeError:
            roman = []
        if len(roman) != len(tokens):
            continue  # alignment failed: keep Devanagari rather than corrupt the timings
        for word, new in zip(chunk, roman):
            word["text"] = str(new)
    return out
