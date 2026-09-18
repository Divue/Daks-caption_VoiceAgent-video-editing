# <Feature / Phase> Audit

Copy this file into a logical subdirectory under `.claude/audits/` (e.g.
`.claude/audits/ai-agent/`, `.claude/audits/livekit/`, `.claude/audits/frontend/`,
`.claude/audits/backend/`) and rename it to describe the phase, e.g.
`phase-01-voice-transport.md`. One audit per phase/significant implementation
milestone — never overwrite an older audit in a way that destroys implementation
history unless explicitly requested. See the "Audit & verification rule" section of
root `CLAUDE.md` for when this is required and how it fits into the workflow.

Rules for filling this out (do not delete this block when copying):
- Describe the ACTUAL CODE as it exists, not the intended design.
- Verify every important claim against source code, not memory or a prior summary.
- Never fabricate test results. Never say "tested" when something was only inspected.
  Never say "end-to-end working" when an external dependency was mocked/stubbed.
- Never hide known limitations, deviations, or unverifiable pieces.
- Write for a developer who has never seen this conversation.

---

## Status
One or two sentences: current state in plain terms (e.g. "Implemented and unit-verified;
not yet integrated into the running app; not live-tested against real infrastructure").

## Objective
What this phase was supposed to implement, and why (link back to the approved plan if
one exists).

## Implementation
Exactly what was built — a factual walkthrough, not a sales pitch.

## Files Created
Every new file, one line each, with a one-phrase purpose.

## Files Modified
Every modified file, one line each, with what changed (additive vs. structural).

## Files Intentionally Untouched
Important files/areas deliberately left alone — and why (ownership boundary, out of
scope, etc.). This is what proves the change didn't leak beyond its intended scope.

## Architecture
How this fits into the existing architecture. Diagram if useful. Call out what's NEW
vs. REUSED from existing, already-tested code.

## Interfaces / Contracts
APIs, request/response shapes, schemas, function contracts, environment variables,
dependencies, and integration boundaries this phase introduces or depends on.

## Ownership
Which teammate/role owns each affected area (per root CLAUDE.md's ownership table), and
whether coordination/sign-off is required before this can merge or deploy.

## Validation
Validation and error-handling behavior — what's checked, what fails loudly vs. silently,
what the failure modes actually are.

## Security
Secrets handling, auth/authz implications, prompt-injection considerations (if
applicable), external-service exposure, anything cost/abuse-relevant.

## Testing
Exactly what was tested and the result — real numbers (test/assertion counts), not
approximations. Name the actual commands run.

## Live Verification
Distinguish, explicitly:
- What was verified against a real installed package/API (inspection, real object
  construction, real crypto/signing, etc. — but no network call to a live service).
- What was verified against a real live external service (real network call, real
  credentials).
- What was NOT verified at all, and why (missing credentials, missing infra, wrong
  local environment version, etc.).

## Unverified / Untestable
Explicit list of anything that could not be tested in this environment, and the
concrete reason (not just "couldn't test it").

## Integration Status
For each relevant piece, state one of: connected / not connected / waiting on another
teammate / waiting on credentials or configuration / waiting on infrastructure.

## Dependencies / Blockers
What another teammate must do before this feature actually works, with owner names/
roles.

## Deviations
Does the implementation differ from the approved plan? If yes, exactly how and why —
treat silence here as a claim that there were none.

## Git / Change Scope
Branch, commit state (clean/dirty), and an explicit statement of whether unrelated
changes were detected in `git status`/`git diff` (and what was done about them, e.g.
"pre-existing, left untouched").

## Next Steps
Precise next actions, each with a responsible owner (role, not name where possible).
