# Sarvam on clips over 30 seconds — Audit

## Status
Done, 2026-09-19. Committed on `p3-agent-talk-edit`, not pushed.

## Objective
The repo owner reported that captions on a 58 s reel were "a bit late, sometimes right" and suggested
also running Transcribe `en-IN`, taking English words' timings from it and Hindi words' from `hi-IN`,
with Sarvam deciding which word is which. Measure that first, then fix what the measurement shows.

## Implementation
**What the job log showed** (project `8bbee3ceaaa1`, 57.9 s):
`sarvam failed — HTTP 400: Audio duration exceeds the maximum limit of 30 seconds. Please use the
batch API`. The pipeline fell back to Transcribe `hi-IN` text romanised by Bedrock, which produced
"**note** everything is that deep" and "you made **aa** mistake". **Every upload over 30 s had silently
lost Sarvam.**

**The en-IN idea, measured on the same audio** (scratch script, not in the repo):

| | words | word timed during silence | median start vs audio onset |
|---|---|---|---|
| hi-IN | 143 | 3 | 31 ms |
| en-IN | 142 | 0 | 20 ms |

`hi-IN` start minus `en-IN` start over 142 paired words: median −1 ms, only 1 word more than
100 ms later. The two engines' timings are the same to within one video frame; a second Transcribe
job would buy ~10 ms. Sarvam `codemix`, proposed as the language tagger, wrote "Chill" in Devanagari
(चिल थोड़ा), so it labels borrowed English words as Hindi. Audit 11 also recorded `en-IN` returning an
**empty** transcript on Real_reel. Not adopted.

**The fix:** `sarvam_text` now cuts audio over 29.5 s into pieces — the first up to 29.5 s, the rest up
to 28 s, as the owner specified ("30 s first, then 28 s") — each cut made at the quietest 20 ms in the
3 s before the target, so no word is split between two pieces. Pieces are sent in parallel (max 4),
their text joined in order, then aligned onto Transcribe timings exactly as before. If any piece fails
the whole stage fails and falls back as before: text with a hole would misalign every later word.

## Files Created
- `.claude/audits/pipeline/phase-01-sarvam-long-clips.md`

## Files Modified
- `services/api/app/pipeline/run.py` — `chunk_bounds`, `_sarvam_request`, `sarvam_text` split, stage detail.
- `services/api/tests/test_pipeline_units.py` — two tests.

## Files Intentionally Untouched
`align.py`, `stt.py`, `prosody.py`: the alignment already handles joined text. `apps/web/src/pages/LandingPage.tsx`
was modified in the working tree by another session; not staged.

## Architecture
Unchanged: Sarvam gives the text, Transcribe `hi-IN` the timings, Needleman–Wunsch joins them.
Only the Sarvam call changed from one request to N ≤ 30 s requests.

## Interfaces / Contracts
`sarvam_text(wav_path, audio_seconds) -> str` keeps its signature. No schema or API change.

## Ownership
`services/api/app/pipeline` is **P1's folder**. Changed at the repo owner's explicit request; P1 should review.

## Validation
The first piece is 29.5 s, not 30 s, because the API measures duration itself and exactly 30.0 risks a rejection.

## Security
No new inputs; temp files live in a `TemporaryDirectory`; the key is read from settings as before.

## Testing
- `pytest`: full suite passes (130), including the two new tests: a short clip stays one piece; a
  58 s clip becomes 3 contiguous pieces, all under 30 s, the first cut landing inside a planted pause.

## Live Verification
`words_from_sources` on the real 58 s audio: pieces 29.41 s / 27.63 s / 0.79 s, all accepted by
Sarvam; **142/142 words matched a Transcribe timing**; text now reads "Not everything is that deep",
"You made a mistake", "Like duh bro relax", "chill thoda".

## Unverified / Untestable
- The owner's "a bit late" report is **not explained** by the STT timings (above). Unknown whether it
  was the wrong-text words (which get interpolated timings) or line reveal feel. Needs timestamps from the owner.
- Clips over ~2 minutes (5+ pieces, 4 in flight) not tried. Sarvam's rate limits not checked.
- The existing project `8bbee3ceaaa1` still holds the old captions; only a re-upload re-runs the pipeline.

## Integration Status
Takes effect for every new upload once the API reloads (the `app/` mount hot-reloads locally).

## Dependencies / Blockers
None. No new packages (`numpy`, `soundfile` already in the image).

## Deviations
Cuts at the quietest point before the target instead of exactly 30 s / 28 s, to avoid splitting a word.

## Git / Change Scope
3 files: `run.py`, `test_pipeline_units.py`, this audit.

## Next Steps
- P1 review. Consider Sarvam's batch API for clips over a few minutes.
- Get timestamps for the "late" moments from the owner.
