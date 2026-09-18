"""The per-word CONTENT tools — the expressive-caption product itself.

`.claude/audits/17-agent-capability-surface.md` §3.2 lists the per-word
fields the editor can change: text, timing, emphasis, emotion, stretch,
single, emoji. None of them had a tool, so the agent could restyle captions
but could not touch a single thing that makes them expressive. These are
those tools, plus `emphasise_peaks`, the one aggregate the audit's own
worked examples ask for ("emphasise the loudest word in each line").

Every tool here takes `wordIds: list[str]` and returns one UPDATE_WORD patch
per word through `word_targets.build_word_patches`, which does the id
validation and the whole-sequence revalidation in one place.

Two invariants worth restating, because both have been violated before:

- **`stretch` is a number, never letters.** Writing "hellooooo" into `text`
  corrupts real spellings; the renderer draws the repeats from the number
  (audit 17 §3.2, and `.claude/INDEX.md`). `set_text` and `set_stretch` are
  separate tools for exactly this reason.
- **Clearing a field is not the same as setting it to null.** Both agent
  routes serialize with `response_model_exclude_none=True`, so a real
  `None` would be stripped off the wire and the clear would silently do
  nothing. `set_single(single=None)` and `set_emoji(emoji="")` therefore
  build their patch with `contracts.CLEAR` / `""`, which serialize TO a
  real JSON `null` — see contracts.CLEAR's comment.
"""
from __future__ import annotations

from app.schema import Project, Word

from ..contracts import CLEAR, WordPatch
from .errors import ToolExecutionError
from .registry import ToolSpec, ToolStatus, default_registry
from .schemas import (
    EmphasisePeaksArgs,
    EmphasisePeaksResult,
    SetEmojiArgs,
    SetEmojiResult,
    SetEmotionArgs,
    SetEmotionResult,
    SetEmphasisArgs,
    SetEmphasisResult,
    SetSingleArgs,
    SetSingleResult,
    SetStretchArgs,
    SetStretchResult,
    SetTextArgs,
    SetTextResult,
    ShiftTimingArgs,
    ShiftTimingResult,
)
from .word_targets import build_word_patches, resolve_words

# A silence at least this long starts a new caption line. Mirrors
# `BLOCK_GAP_MS` in packages/shared/src/blocks.ts, the one place the editor
# and the Remotion composition agree on where lines break; that file cannot
# be imported from Python, so the constant is restated with its source
# named rather than re-derived from something else.
LINE_GAP_MS = 320


def set_text(args: SetTextArgs, project: Project) -> SetTextResult:
    """Replace the text of one or many words.

    With several ids this sets them ALL to the same text — that is the
    point: "replace bhai with bro" is find_words("bhai") followed by one
    set_text over every match. To stretch a word, use set_stretch; never
    write repeated letters into the text.
    """
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(text=args.text))
    return SetTextResult(patches=patches)


def set_emphasis(args: SetEmphasisArgs, project: Project) -> SetEmphasisResult:
    """Mark or unmark words as emphasised (the preset's big/second-face look)."""
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(emphasis=args.emphasis))
    return SetEmphasisResult(patches=patches)


def set_emotion(args: SetEmotionArgs, project: Project) -> SetEmotionResult:
    """Set the tone layer on words: neutral, angry or excited."""
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(emotion=args.emotion))
    return SetEmotionResult(patches=patches)


def set_stretch(args: SetStretchArgs, project: Project) -> SetStretchResult:
    """Set how far a word is drawn out. 1 is no stretch; the renderer turns
    the number into repeated letters. Never write the repeats into the text."""
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(stretch=args.stretch))
    return SetStretchResult(patches=patches)


def set_single(args: SetSingleArgs, project: Project) -> SetSingleResult:
    """Put words on their own line, or stop doing so.

    `single=null` CLEARS the flag (the word rejoins its line) rather than
    leaving it untouched — see this module's docstring for why that has to
    travel as a sentinel.
    """
    value = CLEAR if args.single is None else args.single
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(single=value))
    return SetSingleResult(patches=patches)


def set_emoji(args: SetEmojiArgs, project: Project) -> SetEmojiResult:
    """Set (or, with an empty string, remove) the emoji shown with words."""
    patches = build_word_patches(project, args.wordIds, lambda word: WordPatch(emoji=args.emoji))
    return SetEmojiResult(patches=patches)


def shift_timing(args: ShiftTimingArgs, project: Project) -> ShiftTimingResult:
    """Move words earlier (negative deltaMs) or later (positive) on the
    timeline, shifting startMs and endMs together.

    Clamped at 0, since both are `ge=0` in the schema. Raises
    ToolExecutionError — before building anything — if the shift would
    collapse or invert any word's span, which clamping can cause when a
    large negative delta pins startMs to 0 while endMs follows it down.
    A delta of 0 is rejected too: it is a no-op dressed as an edit.
    """
    if args.deltaMs == 0:
        raise ToolExecutionError("deltaMs is 0 — that would change nothing")

    def shifted(word: Word) -> tuple[int, int]:
        return max(0, word.startMs + args.deltaMs), max(0, word.endMs + args.deltaMs)

    for word in resolve_words(project, args.wordIds):
        start, end = shifted(word)
        if end <= start:
            raise ToolExecutionError(
                f"shifting word {word.id!r} by {args.deltaMs}ms would leave endMs ({end}) "
                f"at or before startMs ({start})"
            )

    def make_patch(word: Word) -> WordPatch:
        start, end = shifted(word)
        return WordPatch(startMs=start, endMs=end)

    patches = build_word_patches(project, args.wordIds, make_patch)
    return ShiftTimingResult(patches=patches)


# --- emphasise_peaks ---------------------------------------------------------
def stress_score(word: Word) -> float:
    """The SAME formula as `stressScore` in packages/shared/src/emphasis.ts.

    Copied, not reinvented: the editor and the Remotion composition already
    agree on which word in a line sounds most stressed, and an agent that
    picked a different one would emphasise a word the auto-promotion rule
    would not have. The `text.length / 100` term is tiny on purpose, so any
    real prosody signal outranks it, and it is the whole score when a word
    has no `signals` at all (a hand-authored fixture, an agent-inserted
    word) — longest word beats first word.
    """
    signals = word.signals
    if signals is None:
        return len(word.text) / 100
    return (
        signals.loudnessZ
        + signals.pitchZ
        + max(0.0, signals.durationRatio - 1) * 0.5
        + len(word.text) / 100
    )


def group_into_lines(words: list[Word]) -> list[list[Word]]:
    """Split words into caption-line-ish groups on silence alone.

    A new group starts when the gap before a word is >= LINE_GAP_MS. That is
    rule 1 of `deriveBlocks` (packages/shared/src/blocks.ts) and nothing
    else: the real grouping also breaks on a tone change, on `single`, and
    on the preset's words-per-line, and then merges blocks shorter than
    250ms back into a neighbour. Reproducing all of that in Python would be
    a second copy of shared logic that could silently drift — and it would
    change under this tool's own edits, since setting emotion re-splits
    lines (audit 17 §2). Silence is the one rule that is stable, is derived
    purely from word timings as asked, and is the one a person means by
    "each line". Words are assumed to be in playback order, which is what
    the pipeline emits.
    """
    groups: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        if current and word.startMs - current[-1].endMs >= LINE_GAP_MS:
            groups.append(current)
            current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def emphasise_peaks(args: EmphasisePeaksArgs, project: Project) -> EmphasisePeaksResult:
    """Emphasise the most stressed-sounding word in each caption line.

    Groups words into lines by silence, scores each with the shared
    `stressScore` formula, and emphasises the winner.

    Two deliberate omissions, both inherited from
    packages/shared/src/emphasis.ts rather than invented here:
    - **A one-word line is skipped.** Emphasising the only word in a line
      emphasises the whole line, which is not emphasis, it is a bigger line.
    - **A word already emphasised produces no patch.** It is reported in
      `alreadyEmphasisedWordIds` instead, so the model can say so honestly.
      Emitting an identical no-op patch would cost the user an extra Ctrl+Z
      for nothing (the frontend's undo stack is real — audit 07).

    `scope="selection"` restricts the words considered to those overlapping
    [fromMs, toMs]; `scope="all"` uses the whole transcript.
    """
    if args.fromMs is not None and args.toMs is not None and args.fromMs > args.toMs:
        raise ToolExecutionError(f"fromMs ({args.fromMs}) is after toMs ({args.toMs})")
    if args.scope == "selection" and args.fromMs is None and args.toMs is None:
        raise ToolExecutionError('scope="selection" needs fromMs and/or toMs to say which selection')

    words = list(project.words)
    if args.scope == "selection":
        if args.fromMs is not None:
            words = [w for w in words if w.endMs > args.fromMs]
        if args.toMs is not None:
            words = [w for w in words if w.startMs < args.toMs]

    lines = group_into_lines(words)

    peaks: list[str] = []
    already: list[str] = []
    to_emphasise: list[str] = []
    for line in lines:
        if len(line) < 2:
            continue
        winner = max(line, key=stress_score)
        peaks.append(winner.id)
        if winner.emphasis:
            already.append(winner.id)
        else:
            to_emphasise.append(winner.id)

    patches = (
        build_word_patches(project, to_emphasise, lambda word: WordPatch(emphasis=True)) if to_emphasise else []
    )
    return EmphasisePeaksResult(
        patches=patches,
        lineCount=len(lines),
        peakWordIds=peaks,
        alreadyEmphasisedWordIds=already,
    )


_SPECS = [
    (
        ToolSpec(
            name="set_text",
            description=(
                "Replace the text of one or many words. With several ids they all get the same "
                "text — that is how 'replace bhai with bro' works. Never write repeated letters "
                "to stretch a word; use set_stretch."
            ),
            input_model=SetTextArgs,
            output_model=SetTextResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_text,
    ),
    (
        ToolSpec(
            name="set_emphasis",
            description=(
                "Mark one or many words as emphasised, or unmark them. Emphasis is the preset's "
                "big/second-typeface look. Pass every word id in one call."
            ),
            input_model=SetEmphasisArgs,
            output_model=SetEmphasisResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_emphasis,
    ),
    (
        ToolSpec(
            name="set_emotion",
            description=(
                "Set the tone layer on one or many words: neutral, angry or excited. This is a "
                "per-word flag; what each tone LOOKS like belongs to the preset and cannot be "
                "changed."
            ),
            input_model=SetEmotionArgs,
            output_model=SetEmotionResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_emotion,
    ),
    (
        ToolSpec(
            name="set_stretch",
            description=(
                "Set how far one or many words are drawn out, as a number >= 1 (1 = no stretch). "
                "The renderer draws the repeated letters from this number — 'draw out the hello' "
                "is set_stretch, never set_text with extra letters."
            ),
            input_model=SetStretchArgs,
            output_model=SetStretchResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_stretch,
    ),
    (
        ToolSpec(
            name="set_single",
            description=(
                "Put one or many words on their own caption line (single=true), or clear the flag "
                "so they rejoin their line (single=null). Omitting `single` clears it."
            ),
            input_model=SetSingleArgs,
            output_model=SetSingleResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_single,
    ),
    (
        ToolSpec(
            name="set_emoji",
            description=(
                "Set the emoji shown with one or many words. Pass an empty string to remove the "
                "emoji. Note the project-level `emojis` setting (see set_settings) can hide all "
                "emoji at once."
            ),
            input_model=SetEmojiArgs,
            output_model=SetEmojiResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        set_emoji,
    ),
    (
        ToolSpec(
            name="shift_timing",
            description=(
                "Move one or many words earlier (negative deltaMs) or later (positive) on the "
                "timeline. startMs and endMs shift together, so a word's duration is unchanged. "
                "This cannot trim, cut or re-time the video itself — only when captions appear."
            ),
            input_model=ShiftTimingArgs,
            output_model=ShiftTimingResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        shift_timing,
    ),
    (
        ToolSpec(
            name="emphasise_peaks",
            description=(
                "Emphasise the most stressed-sounding word in each caption line, using the "
                "measured prosody signals. This is 'emphasise the loudest word in each line' in "
                "one call. scope='all' covers the whole transcript; scope='selection' needs "
                "fromMs and/or toMs. Lines of one word are skipped, and a word that is already "
                "emphasised is reported rather than re-patched."
            ),
            input_model=EmphasisePeaksArgs,
            output_model=EmphasisePeaksResult,
            reads=True,
            writes=True,
            status=ToolStatus.AVAILABLE,
        ),
        emphasise_peaks,
    ),
]

for _spec, _handler in _SPECS:
    default_registry.register(_spec, _handler)
