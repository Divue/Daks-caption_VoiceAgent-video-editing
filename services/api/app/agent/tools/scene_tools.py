"""Tools that WATCH a stretch of video and write what they saw: `place_sticker` and
`fit_captions_to_region`.

Everything else in this package is a pure function of the Project. These two are not: they
grab frames and call detectors, once per `everyMs`, inside a SINGLE tool call. That is the
whole design decision here. The alternative — the model calling analyze_frame once per
second and deciding each placement itself — costs one Bedrock round trip per sample, blows
through MAX_TOOL_ITERATIONS on a five-second range, and asks the model to do arithmetic it
has no reason to be good at. A range request is one call; the loop is the tool's.

Following a moving target with a schema that has no keyframes: `LayerItem` holds ONE
transform, so a sticker that follows a face is N adjacent items, each covering its own
sample's slice of time at its own sample's position. That is an honest approximation and it
is visible in the result — `samples` reports every moment analysed and whether anything was
found there, so the planner can tell the user "I found your face in 4 of the 5 seconds"
instead of implying continuous tracking.

Nothing here fabricates a position. A sample where the detector found nothing produces no
item and no patch; if NO sample found anything, the tool raises rather than placing the
sticker somewhere plausible.
"""
from __future__ import annotations

from app.schema import MAX_LAYER_ITEMS, LayerItem, Project

from ..contracts import AgentStylePatch, SetLayersAction, WordPatch
from ..validation import PatchError, apply_patch
from . import emoji_assets
from .errors import ToolExecutionError
from .layer_tools import MIN_ITEM_MS, next_layer_id
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    FitCaptionsToRegionArgs,
    FitCaptionsToRegionResult,
    PlaceStickerArgs,
    PlaceStickerResult,
    StickerSample,
)
from .vision_tools import _resolve_media_location, boxes_at
from .word_targets import build_word_patches

#: A stretch longer than this is refused rather than quietly costing a minute of wall clock
#: and a Rekognition/Bedrock call per second. Ninety seconds is the clip limit itself
#: (config.max_clip_seconds), so this rules out nothing a user could legitimately ask for on
#: one clip while still bounding a typo like "from 0 to 600 seconds".
MAX_RANGE_MS = 90_000

#: Mirrors BLOCK_GAP_MS in packages/shared/src/blocks.ts — the silence that starts a new
#: caption line. Restated, with its source named, exactly as word_tools.py does; that file
#: cannot be imported from Python.
LINE_GAP_MS = 320

#: Rough width of one character as a fraction of the font size, for a bold sans caption face.
#: This is an ESTIMATE and is the one number in this module that is not measured: the real
#: advance widths live in the browser's font metrics, which the backend cannot see. It is
#: used only to pick a font size that fits a box, and `fillRatio` (default 0.9) leaves the
#: slack that absorbs the error. Wrong by 10% means the captions are 10% smaller or larger
#: than the box's width, not that they land somewhere else.
AVG_CHAR_ADVANCE = 0.55

MIN_FITTED_FONT_SIZE = 10.0
MAX_FITTED_FONT_SIZE = 400.0


def _sample_times(from_ms: int, to_ms: int, every_ms: int) -> list[int]:
    """The moments to analyse: `from_ms`, then every `every_ms` up to (not past) `to_ms`."""
    times = list(range(from_ms, to_ms, every_ms))
    return times or [from_ms]


def _check_range(args, project: Project) -> None:
    if args.toMs <= args.fromMs:
        raise ToolExecutionError(f"the range runs backwards: fromMs {args.fromMs} is not before toMs {args.toMs}")
    if args.fromMs >= project.durationMs:
        raise ToolExecutionError(
            f"fromMs ({args.fromMs}) is at or after the end of the video ({project.durationMs}ms)"
        )
    if args.toMs - args.fromMs > MAX_RANGE_MS:
        raise ToolExecutionError(
            f"that range is {(args.toMs - args.fromMs) / 1000:.0f}s; analysing the video is limited "
            f"to {MAX_RANGE_MS // 1000}s at a time"
        )


def _scan(project: Project, args) -> list[tuple[int, object]]:
    """Analyse each sample time once. Returns (atMs, box-or-None), in time order."""
    location = _resolve_media_location(project)
    # A range that runs past the end of the video is clipped, not refused: "until the end" is
    # a normal thing to say and the last frame is a real frame.
    end = min(args.toMs, project.durationMs)
    found: list[tuple[int, object]] = []
    for at_ms in _sample_times(args.fromMs, end, args.everyMs):
        boxes = boxes_at(location, at_ms, args.target)
        found.append((at_ms, boxes[0] if boxes else None))
    return found


def _samples(scanned: list[tuple[int, object]]) -> list[StickerSample]:
    return [
        StickerSample(
            atMs=at_ms,
            found=box is not None,
            x=None if box is None else round(box.x + box.width / 2, 2),
            y=None if box is None else round(box.y + box.height / 2, 2),
            width=None if box is None else box.width,
        )
        for at_ms, box in scanned
    ]


def place_sticker(args: PlaceStickerArgs, project: Project) -> PlaceStickerResult:
    """Put a built-in emoji sticker on the target, following it across a time range."""
    _check_range(args, project)
    asset = emoji_assets.resolve(args.emoji)
    scanned = _scan(project, args)
    hits = [(at_ms, box) for at_ms, box in scanned if box is not None]
    if not hits:
        raise ToolExecutionError(
            f"no {args.target} found in the video between {args.fromMs}ms and {args.toMs}ms "
            f"({len(scanned)} frame(s) checked) — nothing was placed"
        )

    existing = list(project.layers or [])
    if len(existing) + len(hits) > MAX_LAYER_ITEMS:
        raise ToolExecutionError(
            f"that would need {len(hits)} more layer items and a project holds at most "
            f"{MAX_LAYER_ITEMS} (it already has {len(existing)}). Try a bigger everyMs."
        )

    media_id = emoji_assets.ensure_uploaded(project.id, asset)
    end_of_range = min(args.toMs, project.durationMs)
    items = list(existing)
    for index, (at_ms, box) in enumerate(hits):
        # Each item runs until the next SAMPLE (not the next hit), so a second where the
        # target was lost stays empty instead of being papered over by its neighbour.
        next_sample = next((t for t, _ in scanned if t > at_ms), end_of_range)
        if next_sample - at_ms < MIN_ITEM_MS:
            continue
        # `width` is already a percentage of the frame's width, and so is the box's — so
        # "cover the box's width" is just the box's width, scaled. The sticker is square
        # (EMOJI_ASPECT), so its height follows from the frame's own aspect, exactly as it
        # does for any uploaded image.
        items.append(LayerItem(
            id=next_layer_id(items),
            track=2,  # above any B-roll the user placed; the captions still draw over it
            kind="image",
            mediaId=media_id,
            name=f"{asset}.png",
            startMs=at_ms,
            endMs=next_sample,
            trimStartMs=0,
            sourceDurationMs=None,
            x=round(min(max(box.x + box.width / 2, -50), 150), 2),
            y=round(min(max(box.y + box.height / 2, -50), 150), 2),
            width=round(min(max(box.width * args.scale, 0.1), 400), 2),
            aspect=emoji_assets.EMOJI_ASPECT,
            rotation=0,
            opacity=1,
            muted=True,
        ))

    patch = SetLayersAction(layers=items)
    try:
        apply_patch(project, patch)
    except PatchError as exc:
        raise ToolExecutionError(str(exc)) from exc

    return PlaceStickerResult(
        patch=patch, emoji=asset, samples=_samples(scanned), placed=len(items) - len(existing)
    )


def _lines(words: list, words_per_line: int) -> list[list]:
    """Group words into the lines the renderer will draw, by the same two rules that decide
    it on the frontend: a silence of LINE_GAP_MS starts a line, and a line holds at most
    `words_per_line` words.

    Deliberately NOT the whole of deriveBlocks: tone changes and `single` also break a line
    there, and mirroring all of it in Python would be a second copy of shared logic that can
    drift. Getting a line LONGER than the renderer will draw only makes the fitted text
    smaller than it needed to be, which is a safe direction to be wrong in.
    """
    lines: list[list] = []
    for word in words:
        if (
            lines
            and len(lines[-1]) < words_per_line
            and word.startMs - lines[-1][-1].endMs < LINE_GAP_MS
        ):
            lines[-1].append(word)
        else:
            lines.append([word])
    return lines


def fit_captions_to_region(args: FitCaptionsToRegionArgs, project: Project) -> FitCaptionsToRegionResult:
    """Move and resize the captions in a time range so they sit inside the target."""
    _check_range(args, project)
    end = min(args.toMs, project.durationMs)
    words = [w for w in project.words if w.endMs > args.fromMs and w.startMs < end]
    if not words:
        raise ToolExecutionError(
            f"there are no caption words between {args.fromMs}ms and {args.toMs}ms"
        )

    scanned = _scan(project, args)
    hits = [(at_ms, box) for at_ms, box in scanned if box is not None]
    if not hits:
        raise ToolExecutionError(
            f"no {args.target} found in the video between {args.fromMs}ms and {end}ms "
            f"({len(scanned)} frame(s) checked) — the captions were not moved"
        )

    sizes: dict[str, float] = {}
    placement: dict[str, tuple[float, float]] = {}
    for line in _lines(words, args.wordsPerLine):
        middle = (line[0].startMs + line[-1].endMs) // 2
        # The analysed moment closest to when this line is on screen. Never an interpolation
        # between two boxes: a box we measured is worth more than one we invented.
        at_ms, box = min(hits, key=lambda hit: abs(hit[0] - middle))
        text = " ".join(word.text for word in line)
        box_width_px = box.width / 100 * project.width
        font_size = box_width_px * args.fillRatio / max(len(text), 1) / AVG_CHAR_ADVANCE
        font_size = round(min(max(font_size, MIN_FITTED_FONT_SIZE), MAX_FITTED_FONT_SIZE), 1)
        centre = (
            round(min(max(box.x + box.width / 2, 0), 100), 2),
            round(min(max(box.y + box.height / 2, 0), 100), 2),
        )
        for word in line:
            sizes[word.id] = font_size
            placement[word.id] = centre

    patches = build_word_patches(
        project,
        [word.id for word in words],
        lambda word: WordPatch(style=AgentStylePatch(
            fontSize=sizes[word.id], x=placement[word.id][0], y=placement[word.id][1]
        )),
    )
    return FitCaptionsToRegionResult(patches=patches, samples=_samples(scanned), fontSizes=sizes)


default_registry.register(
    ToolSpec(
        name="place_sticker",
        description=(
            "Put one of the BUILT-IN emoji stickers onto a face, a person or a hand in the video, "
            "over a time range — 'put an angry emoji on my face from 51 to 56 seconds'. The "
            "sticker FOLLOWS the target: the tool looks at the video once every everyMs and places "
            "one sticker per look, so you make ONE call for the whole range, never one per second. "
            "This is the only way you can add media: the artwork is ours. You still cannot add the "
            "user's own images or clips. Stickers available: "
            + ", ".join(emoji_assets.available())
            + ". `scale` sizes it against the detected box (1 = the box's width; 1.2 overlaps a "
            "little). Check the returned `samples` and say honestly how many moments the target "
            "was actually found in."
        ),
        input_model=PlaceStickerArgs,
        output_model=PlaceStickerResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="One LayerItem per sample on track 2; emoji PNG uploaded to the project's media prefix.",
    ),
    place_sticker,
)

default_registry.register(
    ToolSpec(
        name="fit_captions_to_region",
        description=(
            "Move and shrink the captions in a time range so they sit inside something in the "
            "frame — 'put the captions on my hand and make them fit', 'keep the subtitles off my "
            "face'. Looks at the video once every everyMs and gives each caption line the position "
            "and size that fits the target where that line is on screen. Pass wordsPerLine from "
            "<active_preset> so the fitted size matches the lines the renderer will actually draw. "
            "The size is computed from an estimate of text width, so it fits closely rather than "
            "exactly; `fillRatio` leaves the margin. Say honestly how many moments the target was "
            "found in, from the returned `samples`."
        ),
        input_model=FitCaptionsToRegionArgs,
        output_model=FitCaptionsToRegionResult,
        reads=True,
        writes=True,
        status=ToolStatus.AVAILABLE,
        notes="Per-word x/y/fontSize; a line's anchor comes from its first word, so every word in a line gets the same x/y.",
    ),
    fit_captions_to_region,
)
