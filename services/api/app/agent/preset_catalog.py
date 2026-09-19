"""What each preset LOOKS and FEELS like, in the words a creator would use.

Why this exists: `ApplyPresetArgs.presetId` is a closed enum, so the model is shown seven
bare ids — `rangmanch`, `chamak`, `nazm`, `dhamaka`, `mrbeast`, `minimal`, `hinglish-bold`
— and nothing else. Asked for "something trendy and subtle" it had no way to know which of
those is trendy, which is subtle, or that `dhamaka` is the tight lowercase Montserrat one
with the magenta punch. It guessed, and a guess between seven looks is wrong six times out
of seven. `<active_preset>` does not help: it describes the preset already applied, which
is the one the user is asking to move AWAY from.

This is a RESTATEMENT of `packages/shared/src/presets.ts`, which is TypeScript-only by
deliberate design (see its header and INDEX.md's invariant: `Preset` stays un-mirrored so
it can grow without a schema migration). That makes drift the real risk here, so:
  - `test_preset_catalog.py` asserts these ids are exactly `PresetId`, which schema.py
    mirrors from project.ts. A preset added or renamed there fails that test.
  - `look` describes the typography and colour a human can SEE, not field values. It never
    restates a number that would silently go stale — the numbers live in presets.ts.

`keywords` is a vocabulary, not a synonym table: the model reads the whole catalogue and
picks, so a word appearing under two presets is fine and expected. They exist to give the
model something to match a vibe against; the `look` line is what decides a close call.
"""
from __future__ import annotations

from typing import NamedTuple


class PresetInfo(NamedTuple):
    preset_id: str
    name: str
    look: str
    keywords: tuple[str, ...]


CATALOG: tuple[PresetInfo, ...] = (
    PresetInfo(
        "dhamaka", "Dhamaka",
        "Tight all-lowercase Montserrat in white with a wide dark-magenta halo behind every "
        "word; the stressed word turns hot pink at only a little larger. The most current, "
        "most Instagram-looking of the set — punchy but restrained, because the size barely "
        "changes and nothing is shouted in capitals.",
        ("trendy", "modern", "current", "aesthetic", "instagram", "reels", "tiktok", "subtle",
         "understated", "restrained", "clean", "lowercase", "pink", "magenta", "punchy", "viral"),
    ),
    PresetInfo(
        "rangmanch", "Rangmanch",
        "Editorial italic serif in warm paper-white, with a huge vermilion Anton display word "
        "for emphasis — nearly three times the body size. Magazine-like, dramatic, theatrical.",
        ("editorial", "magazine", "serif", "italic", "elegant", "classy", "dramatic", "theatrical",
         "cinematic", "storytelling", "red", "vermilion", "premium"),
    ),
    PresetInfo(
        "chamak", "Chamak",
        "Heavy white Inter stacked line by line, with the emphasised word filled by a gold "
        "gradient under a wide golden halo. Words appear one at a time. Rich, glossy, loud.",
        ("glow", "gold", "golden", "shiny", "glossy", "sparkle", "rich", "luxury", "flashy",
         "gradient", "build-up", "stacked", "hype"),
    ),
    PresetInfo(
        "nazm", "Nazm",
        "Clean white grotesque body with an italic display serif for the stressed word — both "
        "white, separated only by a soft moonlight-blue halo. Quiet, poetic, restrained: the "
        "contrast is typographic rather than colourful.",
        ("poetic", "soft", "calm", "quiet", "gentle", "minimal", "elegant", "subtle", "understated",
         "moody", "blue", "classy", "refined", "emotional"),
    ),
    PresetInfo(
        "mrbeast", "MrBeast",
        "Chunky all-caps cartoon face in white, emphasis in bright yellow, only two words on "
        "screen at a time. Maximum-energy YouTube style.",
        ("mrbeast", "youtube", "loud", "energetic", "hype", "chunky", "cartoon", "bold", "yellow",
         "shouty", "gaming", "challenge", "kids"),
    ),
    PresetInfo(
        "minimal", "Minimal",
        "Plain white Inter at a modest size; emphasis is only a heavier weight, never a colour "
        "or a size change, and the rhythm rule that promotes a word every few lines is switched "
        "off. The quietest option by a distance — deliberately never shouts.",
        ("minimal", "plain", "simple", "clean", "subtle", "quiet", "understated", "professional",
         "corporate", "documentary", "interview", "serious", "no-frills", "boring"),
    ),
    PresetInfo(
        "hinglish-bold", "Hinglish Bold",
        "Bold white Poppins with an orange-to-pink gradient on the emphasised word. The neutral "
        "everyday Hinglish look — friendly and readable without a strong personality.",
        ("default", "standard", "normal", "everyday", "friendly", "readable", "hinglish", "bold",
         "orange", "gradient", "safe", "neutral"),
    ),
)

BY_ID: dict[str, PresetInfo] = {info.preset_id: info for info in CATALOG}


def catalog_block() -> str:
    """The `<presets>` data block the planner puts in the system prompt.

    Built once per request from the tuple above, so the prompt and the tool's enum cannot
    describe different sets of presets.
    """
    lines = [
        "The seven caption presets, so you can match a vibe to one. Pick with apply_preset.",
        "Switching preset changes the WHOLE look; it does not touch per-word edits.",
    ]
    for info in CATALOG:
        lines.append(f"- {info.preset_id} ({info.name}): {info.look} Words creators use for it: "
                     f"{', '.join(info.keywords)}.")
    return "<presets>\n" + "\n".join(lines) + "\n</presets>"


def describe_for_tool() -> str:
    """The one-line-per-preset summary appended to `apply_preset`'s tool description, so the
    catalogue reaches the model through the tool schema as well as the prompt."""
    return " Presets: " + "; ".join(f"{info.preset_id} = {info.keywords[0]}/{info.keywords[1]}"
                                    for info in CATALOG) + "."
