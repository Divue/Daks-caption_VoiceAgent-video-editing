"""The built-in emoji sticker set, and getting one into a project's media.

The agent cannot add the USER's media — that needs a file only they have, and the system
prompt says so. A sticker from this set is different: the bytes are ours, they ship inside
the image (`services/api/assets/emoji/*.png`, drawn by `scripts/make_emoji.py`), and the
user never had to supply anything. So "put an angry emoji on my face" is answerable without
inventing a file, while "add a picture of my dog" is still honestly UNSUPPORTED.

A sticker becomes a normal `LayerItem` like any uploaded image: same S3 prefix, same
`mediaId` pattern, same `GET /projects/{id}/media/{mediaId}` redirect the editor already
uses as an `<img src>`. Nothing downstream needs to know a sticker is special.

The media id is DERIVED from the asset name (md5, first 12 hex) rather than random, which
makes `ensure_uploaded` idempotent: placing the angry face at ten different timestamps
uploads one object and reuses it ten times, and re-running a command does not litter the
project's prefix with duplicate copies of the same PNG.
"""
from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

from .errors import ToolExecutionError

#: /srv/assets/emoji in the container — the Dockerfile COPYs `assets`, and docker-compose
#: mounts it read-only for local dev.
ASSETS_DIR = Path(__file__).resolve().parents[3] / "assets" / "emoji"

#: Every drawn asset is a 256x256 square, so a sticker layer's aspect is always 1.
EMOJI_ASPECT = 1.0

#: What the user might say -> which file. The model is shown the asset names in the tool
#: schema; these aliases exist because a command arrives in whatever words the creator used
#: (or whatever the speech recogniser made of them), and "furious" should not be a refusal.
#: The literal emoji characters are here too: users paste them, and so does the model.
ALIASES: dict[str, str] = {
    "angry": "angry", "anger": "angry", "mad": "angry", "furious": "angry", "rage": "angry",
    "annoyed": "angry", "gussa": "angry", "😠": "angry", "😡": "angry", "🤬": "angry",
    "laugh": "laugh", "laughing": "laugh", "lol": "laugh", "funny": "laugh", "joy": "laugh",
    "crying laughing": "laugh", "haha": "laugh", "😂": "laugh", "🤣": "laugh",
    "shock": "shock", "shocked": "shock", "surprised": "shock", "surprise": "shock",
    "wow": "shock", "omg": "shock", "gasp": "shock", "😲": "shock", "😮": "shock", "😯": "shock",
    "heart": "heart", "love": "heart", "hearts": "heart", "red heart": "heart",
    "❤️": "heart", "❤": "heart", "😍": "heart", "🥰": "heart",
    "fire": "fire", "lit": "fire", "flame": "fire", "hot": "fire", "aag": "fire", "🔥": "fire",
    "skull": "skull", "dead": "skull", "dying": "skull", "rip": "skull", "💀": "skull", "☠️": "skull",
    "cool": "cool", "sunglasses": "cool", "swag": "cool", "smug": "cool", "😎": "cool",
    "star": "star", "sparkle": "star", "shine": "star", "⭐": "star", "🌟": "star", "✨": "star",
    "thumbs_up": "thumbs_up", "thumbs up": "thumbs_up", "thumbsup": "thumbs_up",
    "like": "thumbs_up", "approve": "thumbs_up", "good": "thumbs_up", "👍": "thumbs_up",
}


@lru_cache(maxsize=1)
def available() -> tuple[str, ...]:
    """The asset names actually present on disk, not the ones we hoped were.

    Read from the filesystem rather than hardcoded so a missing PNG is a visible, honest
    failure ("angry is not one of: ...") instead of a 404 at upload time.
    """
    if not ASSETS_DIR.is_dir():
        return ()
    return tuple(sorted(path.stem for path in ASSETS_DIR.glob("*.png")))


def resolve(name: str) -> str:
    """Turn what the user said into an asset name, or raise naming the real options."""
    key = (name or "").strip().lower()
    asset = ALIASES.get(key, key)
    if asset in available():
        return asset
    raise ToolExecutionError(
        f"there is no {name!r} sticker. The built-in set is: {', '.join(available()) or '(none installed)'}"
    )


def media_id(asset: str) -> str:
    """A stable `mediaId` for an asset — 12 hex + .png, matching schema.MEDIA_ID_PATTERN."""
    return hashlib.md5(f"emoji:{asset}".encode()).hexdigest()[:12] + ".png"


def ensure_uploaded(project_id: str, asset: str) -> str:
    """Put the asset in the project's media prefix if it isn't there, and return its mediaId.

    Idempotent by construction: the key is derived from the asset name, so the HEAD that
    finds an existing object is the common case once a sticker has been used once.
    """
    from app import s3  # local import: reading settings at module import breaks host-side tests
    from app.config import get_settings

    mid = media_id(asset)
    key = s3.media_key(project_id, mid)
    if not s3.exists(key):
        path = ASSETS_DIR / f"{asset}.png"
        if not path.is_file():
            raise ToolExecutionError(f"the {asset!r} sticker is missing from the image at {path}")
        s3.client().put_object(
            Bucket=get_settings().s3_bucket, Key=key, Body=path.read_bytes(), ContentType="image/png"
        )
    return mid
