"""Assemble a Project (see packages/shared/src/project.ts) from tagged words."""
from __future__ import annotations

import uuid


def build_project(
    *, video_url: str, duration_ms: int, width: int, height: int,
    words: list[dict], preset_id: str = "rangmanch", project_id: str | None = None,
) -> dict:
    return {
        "id": project_id or uuid.uuid4().hex[:12],
        "videoUrl": video_url,
        "durationMs": duration_ms,
        "width": width,
        "height": height,
        "presetId": preset_id,
        "words": [
            {
                "id": f"w{i}",
                "text": w["text"],
                "startMs": w["startMs"],
                "endMs": w["endMs"],
                "emphasis": w["emphasis"],
                "emotion": w["emotion"],
                "stretch": w["stretch"],
                **({"signals": w["signals"]} if "signals" in w else {}),
            }
            for i, w in enumerate(words, 1)
        ],
        "overlays": [],
        "settings": {"emojis": True, "emotionLayer": True},
    }
