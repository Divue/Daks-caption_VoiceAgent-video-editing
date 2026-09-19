"""The tools added for talk-and-edit: select_word_range, ramp_caption_size, the preset
catalogue, the emoji sticker set, and the two range-scanning vision tools.

Run:  python -m app.agent.tests.test_talk_and_edit_tools

Everything that touches ffmpeg, Rekognition, Bedrock or S3 is injected as a double at the
same boundary the rest of this package uses. What is NOT doubled is the arithmetic: where a
sticker lands, how a size ramps, how a line is fitted to a box. Those are the parts that
would be wrong silently.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from app.agent.preset_catalog import BY_ID, CATALOG, catalog_block  # noqa: E402
from app.agent.tests._fixtures import fixtures_dir  # noqa: E402
from app.agent.tools import default_registry, emoji_assets  # noqa: E402
from app.agent.tools.context_tools import select_word_range  # noqa: E402
from app.agent.tools.errors import ToolExecutionError  # noqa: E402
from app.agent.tools.scene_tools import _lines, fit_captions_to_region, place_sticker  # noqa: E402
from app.agent.tools.schemas import (  # noqa: E402
    BoundingBox,
    FitCaptionsToRegionArgs,
    PlaceStickerArgs,
    RampCaptionSizeArgs,
    SelectWordRangeArgs,
)
from app.agent.tools.style_tools import ramp_caption_size  # noqa: E402
from app.schema import PresetId, Project, Word  # noqa: E402

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{'  — ' + detail if detail and not ok else ''}")
    if not ok:
        FAILURES.append(name)


def raises(fn) -> ToolExecutionError | None:
    try:
        fn()
    except ToolExecutionError as exc:
        return exc
    return None


def project_with(words: list[tuple[str, str, int, int]], **overrides) -> Project:
    doc = json.loads((fixtures_dir() / "demo-project.json").read_text())
    doc["durationMs"] = 70_000
    doc["width"], doc["height"] = 576, 1024
    doc["videoUrl"] = "https://example.invalid/clip.mp4?sig=x"
    doc["words"] = [
        {"id": wid, "text": text, "startMs": start, "endMs": end,
         "emphasis": False, "emotion": "neutral", "stretch": 1}
        for wid, text, start, end in words
    ]
    doc.update(overrides)
    return Project.model_validate(doc)


#: The shape of the real transcript this feature was built against: "Like" occurs twice,
#: 1.4 s apart, which is what makes the time hint load-bearing rather than decorative.
REPEATED_LIKE = [
    ("w1", "people", 25_049, 26_000), ("w2", "Like", 27_000, 27_370),
    ("w3", "another", 27_370, 27_729), ("w4", "famous", 27_729, 28_170),
    ("w5", "guy", 28_170, 28_350), ("w6", "introduces", 28_350, 28_420),
    ("w7", "like", 28_420, 28_464), ("w8", "they", 28_464, 29_860),
]


# --- select_word_range ------------------------------------------------------------------
def test_select_word_range() -> None:
    project = project_with(REPEATED_LIKE)

    result = select_word_range(
        SelectWordRangeArgs(fromText="like", toText="introduces", fromNearMs=27_000), project)
    check("'from like to introduces' returns the whole run, inclusive",
          result.wordIds == ["w2", "w3", "w4", "w5", "w6"], str(result.wordIds))
    check("…in playback order", [w.text for w in result.words] == ["Like", "another", "famous", "guy", "introduces"])

    # The whole reason fromNearMs exists.
    without_hint = select_word_range(SelectWordRangeArgs(fromText="like", toText="introduces"), project)
    check("without a time hint the EARLIEST match wins", without_hint.fromWordId == "w2")
    late = select_word_range(SelectWordRangeArgs(fromText="like", toText="they", fromNearMs=28_400), project)
    check("a time hint picks the LATER of two identical words", late.fromWordId == "w7", late.fromWordId)

    check("matching ignores case", select_word_range(
        SelectWordRangeArgs(fromText="LIKE", toText="GUY"), project).toWordId == "w5")

    exc = raises(lambda: select_word_range(SelectWordRangeArgs(fromText="guy", toText="people"), project))
    check("a backwards range is refused, not silently reversed", exc is not None)
    check("…and says which word came after which", exc is not None and "after" in str(exc).lower(), str(exc))

    exc = raises(lambda: select_word_range(SelectWordRangeArgs(fromText="zzzz", toText="guy"), project))
    check("an endpoint that is not in the transcript raises, naming it",
          exc is not None and "zzzz" in str(exc), str(exc))

    one = select_word_range(SelectWordRangeArgs(fromText="guy", toText="guy"), project)
    check("a range from a word to itself is that one word", one.wordIds == ["w5"])

    fuzzy = select_word_range(SelectWordRangeArgs(fromText="introduce", toText="they"), project)
    check("a near-miss endpoint still resolves (speech recognisers mangle words)",
          fuzzy.fromWordId == "w6", fuzzy.fromWordId)


# --- ramp_caption_size ------------------------------------------------------------------
def test_ramp_caption_size() -> None:
    project = project_with(REPEATED_LIKE)
    result = ramp_caption_size(
        RampCaptionSizeArgs(wordIds=["w2", "w3", "w4", "w5", "w6"], startFontSize=68, endFontSize=160), project)
    check("the ramp hits both ends exactly", result.fontSizes[0] == 68.0 and result.fontSizes[-1] == 160.0)
    check("…and every step in between grows", all(
        b > a for a, b in zip(result.fontSizes, result.fontSizes[1:])), str(result.fontSizes))
    check("…evenly", result.fontSizes == [68.0, 91.0, 114.0, 137.0, 160.0], str(result.fontSizes))
    check("one UPDATE_WORD patch per word", [p.wordId for p in result.patches] == ["w2", "w3", "w4", "w5", "w6"])
    check("the patch writes fontSize and nothing else",
          result.patches[0].patch.style.model_dump(exclude_none=True) == {"fontSize": 68.0})

    down = ramp_caption_size(RampCaptionSizeArgs(wordIds=["w2", "w3", "w4"], startFontSize=100, endFontSize=40), project)
    check("a ramp can shrink as well as grow", down.fontSizes == [100.0, 70.0, 40.0], str(down.fontSizes))

    single = ramp_caption_size(RampCaptionSizeArgs(wordIds=["w2"], startFontSize=68, endFontSize=160), project)
    check("a single word takes the START size (there is nothing to interpolate)", single.fontSizes == [68.0])

    # build_word_patches collapses duplicates; the sizes must collapse with them or every
    # later word slides onto the wrong step.
    dupes = ramp_caption_size(
        RampCaptionSizeArgs(wordIds=["w2", "w2", "w3"], startFontSize=10, endFontSize=30), project)
    check("a repeated id collapses, and the ramp re-spreads over what is left",
          dupes.fontSizes == [10.0, 30.0] and [p.wordId for p in dupes.patches] == ["w2", "w3"], str(dupes.fontSizes))

    check("an unknown id is refused", raises(lambda: ramp_caption_size(
        RampCaptionSizeArgs(wordIds=["w2", "nope"], startFontSize=10, endFontSize=30), project)) is not None)


# --- the preset catalogue ----------------------------------------------------------------
def test_preset_catalog() -> None:
    schema_ids = set(PresetId.__args__)  # type: ignore[attr-defined]
    check("the catalogue describes EXACTLY the presets that exist",
          {info.preset_id for info in CATALOG} == schema_ids,
          f"catalogue={sorted(i.preset_id for i in CATALOG)} schema={sorted(schema_ids)}")
    check("every preset has a look and some vocabulary",
          all(info.look and len(info.keywords) >= 5 for info in CATALOG))
    block = catalog_block()
    check("the block names every preset id", all(info.preset_id in block for info in CATALOG))
    check("the block is labelled as data, in its own tag", block.startswith("<presets>") and block.endswith("</presets>"))
    # The command that motivated the whole catalogue.
    check("'trendy' and 'subtle' both point at dhamaka",
          "trendy" in BY_ID["dhamaka"].keywords and "subtle" in BY_ID["dhamaka"].keywords)
    check("apply_preset's description carries the catalogue too",
          "dhamaka" in default_registry.get_spec("apply_preset").description)


# --- the emoji sticker set ---------------------------------------------------------------
def test_emoji_assets() -> None:
    installed = emoji_assets.available()
    check("the drawn sticker set is actually present in the image", len(installed) >= 8, str(installed))
    check("angry is one of them (the one the feature was asked for)", "angry" in installed)
    check("a plain name resolves", emoji_assets.resolve("angry") == "angry")
    check("a synonym resolves", emoji_assets.resolve("furious") == "angry")
    check("the emoji CHARACTER resolves", emoji_assets.resolve("😡") == "angry")
    check("case and spacing do not matter", emoji_assets.resolve("  Thumbs Up ") == "thumbs_up")
    exc = raises(lambda: emoji_assets.resolve("aubergine"))
    check("an unknown sticker raises, listing the real set",
          exc is not None and "angry" in str(exc), str(exc))
    mid = emoji_assets.media_id("angry")
    check("the media id matches the schema's pattern and is stable",
          mid.endswith(".png") and len(mid) == 16 and mid == emoji_assets.media_id("angry"), mid)
    check("different stickers get different ids", emoji_assets.media_id("fire") != mid)


# --- the range scanners ------------------------------------------------------------------
class _FakeVision:
    """Stands in for ffmpeg + the detectors: a box per timestamp, or None for "not found"."""

    def __init__(self, boxes: dict[int, BoundingBox | None]) -> None:
        self.boxes = boxes
        self.seen: list[int] = []

    def __call__(self, location: str, at_ms: int, target: str, **kwargs) -> list[BoundingBox]:
        self.seen.append(at_ms)
        box = self.boxes.get(at_ms)
        return [box] if box is not None else []


def _patch_scan(monkey: _FakeVision):
    import app.agent.tools.scene_tools as scene

    scene.boxes_at = monkey  # type: ignore[assignment]


def test_place_sticker() -> None:
    import app.agent.tools.scene_tools as scene

    original = scene.boxes_at
    project = project_with(REPEATED_LIKE)
    face = lambda x, w: BoundingBox(label="face", x=x, y=20, width=w, height=30)  # noqa: E731
    fake = _FakeVision({51_000: face(20, 40), 52_000: face(30, 40), 53_000: None, 54_000: face(40, 50)})
    _patch_scan(fake)
    scene.emoji_assets.ensure_uploaded = lambda project_id, asset: "0123456789ab.png"  # type: ignore[assignment]
    try:
        result = place_sticker(
            PlaceStickerArgs(emoji="angry", fromMs=51_000, toMs=55_000, target="face", scale=1.0), project)

        check("it looked once per second, not once per turn", fake.seen == [51_000, 52_000, 53_000, 54_000], str(fake.seen))
        check("every sample is reported, found or not", [s.found for s in result.samples] == [True, True, False, True])
        check("a second with no face places NOTHING there", result.placed == 3, str(result.placed))
        items = result.patch.layers
        check("each item starts at its own sample", [i.startMs for i in items] == [51_000, 52_000, 54_000])
        check("an item ends at the NEXT sample, so a lost second stays empty",
              [i.endMs for i in items] == [52_000, 53_000, 55_000], str([i.endMs for i in items]))
        check("the sticker is centred on the box, not at its corner",
              (items[0].x, items[0].y) == (40.0, 35.0), f"{items[0].x},{items[0].y}")
        check("its width covers the box's width at scale 1", items[0].width == 40.0)
        check("…and follows the face as it moves", items[1].x == 50.0 and items[2].x == 65.0)
        check("stickers go on the top layer", all(i.track == 2 for i in items))
        check("a sticker is a square image, muted, fully opaque",
              all(i.aspect == 1.0 and i.kind == "image" and i.muted and i.opacity == 1 for i in items))
        check("every item gets its own id", len({i.id for i in items}) == 3)
        check("the result names the sticker actually used", result.emoji == "angry")

        scaled = place_sticker(
            PlaceStickerArgs(emoji="angry", fromMs=51_000, toMs=52_000, target="face", scale=1.5), project)
        check("scale multiplies the box's width", scaled.patch.layers[0].width == 60.0)

        # Nothing found anywhere must never become a placement.
        _patch_scan(_FakeVision({}))
        exc = raises(lambda: place_sticker(
            PlaceStickerArgs(emoji="angry", fromMs=51_000, toMs=55_000, target="face"), project))
        check("when the target is never found, nothing is placed and it says so",
              exc is not None and "no face found" in str(exc), str(exc))

        exc = raises(lambda: place_sticker(
            PlaceStickerArgs(emoji="banana", fromMs=51_000, toMs=52_000, target="face"), project))
        check("an unknown sticker is refused before any video is read", exc is not None and "banana" in str(exc))

        exc = raises(lambda: place_sticker(
            PlaceStickerArgs(emoji="angry", fromMs=55_000, toMs=51_000, target="face"), project))
        check("a backwards range is refused", exc is not None and "backwards" in str(exc), str(exc))
    finally:
        scene.boxes_at = original


def test_fit_captions_to_region() -> None:
    import app.agent.tools.scene_tools as scene

    original = scene.boxes_at
    words = [
        ("w1", "like", 65_040, 65_319), ("w2", "there's", 65_319, 65_480), ("w3", "some", 65_559, 65_879),
        ("w4", "marketing", 65_879, 66_480), ("w5", "scheme", 66_480, 66_800), ("w6", "for", 66_800, 67_000),
    ]
    project = project_with(words)
    hand = lambda x, w: BoundingBox(label="hand", x=x, y=30, width=w, height=60)  # noqa: E731
    fake = _FakeVision({65_000: hand(10, 40), 66_000: hand(20, 40)})
    _patch_scan(fake)
    try:
        result = fit_captions_to_region(
            FitCaptionsToRegionArgs(fromMs=65_000, toMs=67_000, target="hand", wordsPerLine=3), project)

        check("every word in the range is patched", [p.wordId for p in result.patches] == [w[0] for w in words])
        styles = {p.wordId: p.patch.style.model_dump(exclude_none=True) for p in result.patches}
        check("each word gets a position AND a size",
              all({"x", "y", "fontSize"} <= set(v) for v in styles.values()), str(styles))
        check("words on the SAME line share one anchor — the line's anchor comes from its first word",
              styles["w1"]["x"] == styles["w2"]["x"] == styles["w3"]["x"], str(styles))
        check("…and one size", styles["w1"]["fontSize"] == styles["w3"]["fontSize"])
        check("a later line follows the target to where it moved",
              styles["w4"]["x"] != styles["w1"]["x"], str(styles))
        check("the anchor is the box's CENTRE", styles["w1"]["x"] == 30.0 and styles["w1"]["y"] == 60.0)
        check("the fitted size is smaller than the caption base (it has to fit a hand)",
              all(v["fontSize"] < 68 for v in styles.values()), str(styles))
        check("a longer line is fitted SMALLER than a short one at the same box size",
              styles["w4"]["fontSize"] < styles["w1"]["fontSize"],
              f'{styles["w4"]["fontSize"]} vs {styles["w1"]["fontSize"]}')

        _patch_scan(_FakeVision({}))
        exc = raises(lambda: fit_captions_to_region(
            FitCaptionsToRegionArgs(fromMs=65_000, toMs=67_000, target="hand"), project))
        check("captions are not moved when the target was never found",
              exc is not None and "not moved" in str(exc), str(exc))

        _patch_scan(fake)
        exc = raises(lambda: fit_captions_to_region(
            FitCaptionsToRegionArgs(fromMs=1_000, toMs=2_000, target="hand"), project))
        check("a range with no captions in it says so rather than patching nothing",
              exc is not None and "no caption words" in str(exc), str(exc))
    finally:
        scene.boxes_at = original


def test_line_grouping() -> None:
    """The line split that decides how wide a fitted line is."""
    make = lambda wid, start, end: Word(  # noqa: E731
        id=wid, text="x", startMs=start, endMs=end, emphasis=False, emotion="neutral", stretch=1)
    words = [make("a", 0, 100), make("b", 150, 250), make("c", 300, 400), make("d", 1_000, 1_100)]
    check("a long silence starts a new line", [len(line) for line in _lines(words, 8)] == [3, 1])
    check("so does hitting the preset's words-per-line", [len(line) for line in _lines(words, 2)] == [2, 1, 1])
    check("one word is one line", [len(line) for line in _lines(words[:1], 3)] == [1])
    check("no words is no lines", _lines([], 3) == [])


def main() -> int:
    test_select_word_range()
    test_ramp_caption_size()
    test_preset_catalog()
    test_emoji_assets()
    test_place_sticker()
    test_fit_captions_to_region()
    test_line_grouping()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
