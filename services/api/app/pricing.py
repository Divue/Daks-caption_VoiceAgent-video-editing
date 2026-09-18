"""Rate table for external model calls, ap-south-1. Every rate says where it came from.

`verified` means "taken from a published price list", NOT "reconciled against an AWS bill" —
nothing here has been reconciled against a bill yet (audit 12). Note that audit 11's measured
$0.023 for Angry was itself computed with these same Bedrock rates, so it cannot confirm them.
Unknown models are priced at 0 and reported as unverified rather than guessed.
"""
from __future__ import annotations

from dataclasses import dataclass

RATE_VERSION = "2026-09-18.1"


@dataclass(frozen=True)
class Rate:
    unit: str                  # "tokens" | "audio_seconds"
    usd_in_per_mtok: float = 0.0
    usd_out_per_mtok: float = 0.0
    usd_per_minute: float = 0.0
    min_billed_seconds: float = 0.0
    verified: bool = False
    source: str = ""


RATES: dict[tuple[str, str], Rate] = {
    ("bedrock", "global.anthropic.claude-sonnet-4-6"): Rate(
        "tokens", usd_in_per_mtok=3.00, usd_out_per_mtok=15.00, verified=True,
        source="Anthropic/Bedrock list price for Sonnet 4.6 global profile; same arithmetic as caption_eval"),
    ("transcribe", "batch-hi-IN"): Rate(
        "audio_seconds", usd_per_minute=0.024, min_billed_seconds=15, verified=False,
        source="audit 11 §8 'published rate, assumed'; 15 s per-job minimum assumed from AWS docs"),
    ("sarvam", "saaras:v3"): Rate(
        "audio_seconds", usd_per_minute=0.0, verified=False,
        source="unpriced (audit 11 §8); audioSeconds is logged so history can be repriced"),
}


def rate_for(service: str, model_id: str) -> Rate | None:
    return RATES.get((service, model_id))


def usd(service: str, model_id: str, *, input_tokens: int = 0, output_tokens: int = 0,
        audio_seconds: float = 0.0) -> tuple[float, bool]:
    """(usd, verified). Unknown (service, model) -> (0.0, False)."""
    rate = rate_for(service, model_id)
    if rate is None:
        return 0.0, False
    if rate.unit == "tokens":
        cost = input_tokens * rate.usd_in_per_mtok / 1e6 + output_tokens * rate.usd_out_per_mtok / 1e6
    else:
        billed = max(audio_seconds, rate.min_billed_seconds) if audio_seconds else 0.0
        cost = billed / 60 * rate.usd_per_minute
    return round(cost, 6), rate.verified
