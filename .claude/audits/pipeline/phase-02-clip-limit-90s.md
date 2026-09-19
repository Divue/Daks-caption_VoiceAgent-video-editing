# Clip length limit 60 s → 90 s Audit

## Status
Done. The whole API suite passes. A real 90 s upload has not been run.

## Objective
The P3 owner asked for the limit to be raised: a 68.5 s clip was rejected ("clip is 68.5s; the limit is 60s").

## Implementation
The default of `max_clip_seconds` goes from 60 to 90. It can still be overridden with `MAX_CLIP_SECONDS`.

## Files Created
- `.claude/audits/pipeline/phase-02-clip-limit-90s.md`

## Files Modified
- `services/api/app/config.py`: the default, in the dataclass and in the env fallback.
- `services/api/tests/test_jobs.py`: the rejection test now expects "limit is 90s".
- `.env.example`: the commented example value.

## Files Intentionally Untouched
- `.env` (local, not tracked; it doesn't set the variable).
- Audit 12's mention of `MAX_CLIP_SECONDS=60`: it's history and stays as written.
- The landing-page changes from another session that are in the working tree.

## Architecture
No change. The check stays in `jobs/runner.py`: after ffprobe, before any paid call.

## Interfaces / Contracts
The error text keeps the same shape; only the number changes.

## Ownership
`services/api` belongs to P1. The P3 owner asked for this change, and it's flagged here so P1 can review.

## Validation
The runner still rejects clips over the limit before any paid call (the test covers this).

## Security
Cost goes up about 1.5× per clip in the worst case (Transcribe, Sarvam, Bedrock all scale with duration). There's no new input surface.

## Testing
`docker compose exec -T api python -m pytest -q`: all pass.

## Live Verification
Checked: `get_settings().max_clip_seconds == 90` inside the restarted container.
Not checked: an actual 60–90 s clip end to end.

## Unverified / Untestable
- Sarvam gets 4 pieces for 90 s (29.5 + 28 + 28 + ~4.5). `MAX_PARALLEL` is 4, so they still all go at once. Only the 58 s / 3-piece case has been run live.
- Remotion export time and Lambda limits at 90 s haven't been checked (P2).
- The shared deployed environment only picks this up if it doesn't set `MAX_CLIP_SECONDS` itself.

## Integration Status
Local only, until pushed.

## Dependencies / Blockers
None.

## Deviations
None.

## Git / Change Scope
Three tracked files, plus this audit.

## Next Steps
Upload the 68.5 s clip and check the captions.
