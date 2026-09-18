# Talk-and-Edit MVP — agent turns become saved changes

## Status
Implemented and verified end to end against real Bedrock over real HTTP: 11/11 demo
commands behave as specified, the agent's patches apply as one undo step and persist
through one atomic bulk write. **Not verified in a browser** — the Chrome extension was
not connected in this environment, so every frontend claim below rests on typecheck,
build, and 33 headless assertions, not on a rendered page. LiveKit voice transport is
wired and its token minting is verified with real crypto, but **no LiveKit room has ever
been joined** (no account/credentials); voice falls back to the browser's own speech
recognition, which is also unverified without a browser.

## Objective
Make an agent response actually become saved changes on screen, with undo, honest
failure, and enough of a tool surface that the agent can do the things the product is
about. Plan: `.claude/plans/agent-talk-and-edit-p3.md` (written this session; the four
open decisions in it were answered by the repo owner before implementation).

## Implementation

### The bug at the centre
The only existing wiring (on `aman/ai-agent`) did `for (const patch of response.patches)
dispatch(patch)`. The reducer is local-only — `useWordPatch` owns both the optimistic
dispatch *and* the `PATCH` — so agent edits rendered, never persisted, were overwritten
by the next manual edit, and cost one undo step per patch. That wiring was dropped and
rebuilt.

### Editor (P3)
- `project-reducer.ts`: `APPLY_AGENT_PATCHES` folds a whole turn into ONE `commit()`, so
  one utterance is one undo step and validation runs once on the finished result —
  applied whole or dropped whole. Adds `SET_SETTINGS` and `SET_PRESET_OVERRIDE`; exports
  the pure `applyAgentPatch` fold so the batch and single-action paths cannot drift.
- `useWordPatch.ts`: `applyAgentPatches` persists a turn on the SAME serialised queue and
  version counter as manual edits — one bulk word PATCH plus at most one project PATCH.
  `enqueue` now returns its own tail, so a turn can await its own write and report how
  many patches actually landed. `patchProjectFields` moves preset/settings writes onto
  that queue too.
- `useAgentCommand.ts`: one turn end to end — build context, abort/barge-in, apply, and
  report partial failure honestly. "Undo that" is matched locally and dispatches the
  existing `UNDO`; it is deliberately not a tool.
- `useVoiceInput.ts` (replaces P4's `useLiveKitVoice.ts`): mic permission with a distinct
  `denied` state, live interim transcripts that are shown but never submitted, and an
  automatic fallback to browser `SpeechRecognition` when LiveKit answers 503. `start()`
  returns which transport actually started rather than the caller reading stale state.
- Activity panel: per-entry status, so an `unsupported` refusal cannot render as a green
  tick; changes shown as sentences ("3 words → colour #ff2d55"), not JSON; collapsible
  tool trace; per-turn undo that knows a resynced turn costs two steps.
- `PresetPicker` stopped calling `patchProject` itself — a second writer against one
  version counter, now genuinely reachable because the agent can change the preset
  mid-turn. Emojis / Emotion-colours switches added; both were in the schema and on the
  API from the start with no control anywhere.

### Agent (P4 folder — see Ownership)
- Eight per-word tools that never existed: `set_text`, `set_emphasis`, `set_emotion`,
  `set_stretch`, `set_single`, `set_emoji`, `shift_timing`, `set_position`, plus
  `emphasise_peaks` (same stress formula as `emphasis.ts`) and `set_preset_override`.
  Every mutating tool takes `wordIds: list[str]`, so a line is one call, not five.
- `move_caption` / `scale_caption` removed as thin wrappers; `add_overlay` registered
  DISABLED because nothing renders an overlay.
- `update_caption_style` gains `clearKeys`: setting a key and removing one are different
  operations, and `response_model_exclude_none=True` meant a null inside `patch` could
  never remove anything.
- `SelectionContext` widened to `selectedWordId(s)`, `playheadMs`, `activeBlockId`,
  `activeBlockWordIds`, and used by the planner so "this line" resolves.
- Refusal detection fixed (see Deviations).

### API / schema (P1 + lead)
- `main.py` mounts `app/agent/router.py`; the 501 `routers/agent.py` stub is deleted.
- `PATCH /projects/{id}/words`: all-or-nothing bulk write, one version bump.
- `Project.presetOverride` added to `project.ts` and `schema.py` together. Additive and
  optional, so **no migration**; `SCHEMA_VERSION` stays 2.

## Files Created
- `apps/web/src/lib/agent-api.ts` — typed agent client built on `api.ts`'s `request()`.
- `apps/web/src/lib/agent-summary.ts` — patches → human sentences.
- `apps/web/src/hooks/useAgentCommand.ts` — one agent turn, end to end.
- `apps/web/src/hooks/useVoiceInput.ts` — mic + STT transport with fallback.
- `apps/web/scripts/check-agent-apply.ts` — 33 headless assertions (`npm run check:agent`).
- `services/api/app/agent/tools/word_tools.py` — the per-word tools.
- `services/api/app/agent/tools/word_targets.py` — `wordIds` → validated patches, once.
- `services/api/app/agent/tests/_fixtures.py` — fixture path that works in the container.
- `services/api/app/agent/tests/test_word_tools.py` — 35 checks for the new tools.
- `services/api/tests/test_bulk_word_patch.py`, `test_preset_override.py` — 26 pytest.
- `services/api/scripts/agent_demo.py` — the 11 demo commands, each with an assertion.
- This audit.

## Files Modified
Structural: `project-reducer.ts`, `useWordPatch.ts`, `preset-override-context.tsx`,
`PresetPicker.tsx`, `AgentActivityPanel.tsx`, `AgentCommandBar.tsx`, `MicButton.tsx`,
`useAgentActivity.ts`, `App.tsx`, `contracts.py`, `validation.py`, `planner.py`,
`style_tools.py`, `project_tools.py`, `catalog.py`, `schemas.py`, `main.py`,
`routers/projects.py`, `store/projects.py`, `schema.py`, `packages/shared/src/project.ts`.
Additive: `lib/api.ts`, `word-patch-context.tsx`, `useCaptionBlocks.ts`,
`livekit_token.py`, `services/api/README.md`, `.env.example`, `apps/web/package.json`,
and the agent test files.
Deleted: `services/api/app/routers/agent.py`, `apps/web/src/lib/agent-client.ts`,
`apps/web/src/hooks/useLiveKitVoice.ts`.

## Files Intentionally Untouched
`remotion/` (P2 — export is still 501 and overlays would need a composition change),
`services/api/app/pipeline/` (P1), `services/voice-agent/` (merged from P4's branch
unchanged), `lib/caption-style.ts` and `CaptionRenderer.tsx` (pure/props-only by design,
and this feature needed no renderer change).

## Architecture
NEW: one batch reducer action, one bulk endpoint, one preset-override field, ten tools.
REUSED and deliberately not duplicated: the single serialised write queue and its version
ref (audit 13 §5), `commit()`'s validate-or-drop rule, `_merge_style`'s null-removes
contract (audit 15 §4), `api.ts`'s error normalisation, `apply_patches`' commit-or-nothing
boundary, `emphasis.ts`'s stress formula.

```
utterance ─► useAgentCommand ─► POST /agent/command ─► planner (≤6 tool calls)
                   │                                        │
                   │◄──────── {status, patches[], log[]} ◄──┘
                   ▼
        APPLY_AGENT_PATCHES (1 commit = 1 undo step)
                   ▼
        useWordPatch queue ─► PATCH /projects/{id}/words   (1 atomic write, 1 version bump)
                            └► PATCH /projects/{id}        (preset / settings / override)
```

## Interfaces / Contracts
`POST /agent/command` `{command, project, selection}` → `{status, patches[], log[]}`;
`POST /agent/voice-command` takes `transcript`; `POST /agent/livekit-token` → token/url or
`503 livekit_not_configured`. `PATCH /projects/{id}/words` `{words:[{wordId,...}], version?}`
→ `{words, version}`. Patch actions: `UPDATE_WORD`, `SET_PRESET`, `SET_SETTINGS`,
`SET_PRESET_OVERRIDE`, `ADD_OVERLAY` (never emitted — tool disabled). Env:
`BEDROCK_MODEL_ID` (required at startup, pre-existing), `LIVEKIT_URL/API_KEY/API_SECRET`
(optional; absent ⇒ browser fallback). New deps: `livekit-api` (production image, needs
P1 sign-off), `livekit-client` (web).

## Ownership
`apps/web` is P3's and was the intended scope. This change also edits **P4's**
`services/api/app/agent/`, **P1's** `main.py`, `routers/projects.py`, `store/projects.py`,
`schema.py` and README, and the **lead's** `packages/shared/src/project.ts`. That is
outside the CLAUDE.md ownership table and was done on the repo owner's explicit
instruction to deliver the MVP end to end. **It needs P1, P4 and lead sign-off before
merge**, particularly the schema field and the production `livekit-api` dependency.

## Validation
- Unknown `wordId`: tool error naming it; bulk endpoint 404s and writes nothing.
- Invalid batch: dropped entirely by `commit()`/`apply_patches`, never half-applied.
- Stale version: 409, editor refetches and says how many patches landed.
- Cleared keys travel as explicit JSON `null`; untouched optionals are still stripped.
- Silent failure remains possible in one place: a reducer batch rejected by
  `Project.safeParse` logs to console only. The agent path reports it, the manual path
  does not — pre-existing behaviour, unchanged.

## Security
No secrets in code. `LIVEKIT_API_SECRET` stays server-side; the browser only ever gets a
minted token. The transcript and the selection reach the model wrapped in tags and
labelled as data, never as instructions, and the system prompt says so explicitly.
Agent log text and word text are rendered as React text nodes only — no
`dangerouslySetInnerHTML`, no markdown renderer — so a video that says "ignore your
instructions" or a word named `<img onerror=...>` is inert. **`/agent/livekit-token` has
no auth** (pre-existing, P4's own comment acknowledges it): anyone who can reach the API
can mint a room-join token, mitigated only by a 30-minute TTL.

## Testing
Commands run, with real counts:
- `docker exec firstcommit-api-1 python -m app.agent.tests.<file>` × 12 files —
  **295 checks, 0 failures** (was 237 across 11 files before, and every file was in fact
  unrunnable in the container; see Deviations).
- `docker exec firstcommit-api-1 python -m pytest tests/ -p no:warnings` — **95 passed**.
- `npm run check:agent` — **33 assertions**; `npm run check:captions` — passes unchanged.
- `npx tsc -b` clean; `npm run build` succeeds; `npx oxlint src/ scripts/` — 19 warnings,
  all pre-existing, none in files touched here.
- `docker exec firstcommit-api-1 python scripts/agent_demo.py` — **11/11**.

## Live Verification
- **Against a real live external service (real Bedrock, real credentials, real network):**
  all 11 demo commands, plus `POST /agent/command` over real HTTP through the mounted
  route. Tool selection, deixis ("that line" → the right four word ids), the per-word/
  conditional distinction, and the refusal all confirmed on live model output.
- **Against a real installed package, no network:** LiveKit token minting (real
  `livekit-api`, real signing, token decoded and inspected) after rebuilding the image;
  `503 livekit_not_configured` confirmed by curl; `cleared`-key null survival confirmed on
  the raw HTTP response body rather than a re-parsed model.
- **Not verified at all:** anything requiring a browser (the editor UI, undo behaviour on
  screen, mic permission, interim transcripts, the browser-speech fallback) — the Chrome
  extension was not connected. No LiveKit room was joined; no LiveKit account exists.
  Persistence was verified at the endpoint level, not by a round trip from the editor.

## Unverified / Untestable
1. Every rendered-UI claim — no browser available in this environment.
2. LiveKit end to end (room join, `services/voice-agent` worker, AWS Transcribe streaming
   plugin) — no LiveKit credentials; the worker also needs Python 3.12+ and its plugin
   dependency has no distribution below it.
3. Browser `SpeechRecognition` fallback — needs a browser.
4. `analyze_frame` — still fails for every real project (wants `s3://`, the API hands out
   presigned https). Pre-existing, untouched, and now explicitly out of the demo set.

## Integration Status
- Agent routes: **connected** (mounted, reachable, live-tested).
- Editor → agent → apply → persist: **connected** at the API level; **not browser-verified**.
- Preset overrides: **connected** (schema, API, tool, reducer, provider, block derivation).
- Voice via LiveKit: **waiting on credentials and infrastructure**.
- Voice via browser: **connected in code, unverified**.
- Overlays: **not connected on purpose** — tool disabled until something renders them.
- Export / Remotion: unchanged, still 501 (P2).

## Dependencies / Blockers
- **P1**: sign off `main.py`, the bulk endpoint, `store/projects.py`, and `livekit-api`
  shipping in the production image.
- **P4**: sign off the tool-surface changes in their folder (removals included).
- **Lead**: sign off `Project.presetOverride` in `project.ts` + `schema.py`.
- **Anyone**: a LiveKit account, or accept the browser fallback for the demo.

## Deviations
1. **The plan said rebase P4's branch onto schema v2. It was not needed.** The branch
   never touched a schema-v2 file; the alarming diff was a two-dot/three-dot artifact.
   A normal merge was clean apart from `App.tsx`.
2. **Scope crossed ownership boundaries** (P1, P4, lead folders) — on explicit
   instruction, but it is a deviation from CLAUDE.md and is called out above.
3. **The agent tests were not "237 passing" as the prior audits claim.** Every file
   resolved fixtures via `parents[5]`, which only exists in a host checkout, while the
   dependencies exist only in the image — so in the one environment able to run them they
   all died with `IndexError: 5` before the first assertion. `_fixtures.py` fixes this.
4. **A refusal bug was found by the live demo run, not by tests.** `UNSUPPORTED:` was
   only detected at the very start of the final message; the model routinely explains
   itself first, so real refusals returned `status="ok"` and would have shown a green
   tick. Now matched on any line, and a refusal discards patches collected earlier in the
   same turn. Two regression tests added.
5. **`z.record` vs `z.partialRecord`**: zod 4.6.5's `record` is exhaustive over an enum
   key, which contradicted the Python mirror; `partialRecord` is used instead.
6. The subagent building the tool surface was terminated mid-task by a rate limit; its
   planner/system-prompt work and all the tests were finished directly.

## Git / Change Scope
Branch `p3-agent-talk-edit`, cut from `master`. Five commits plus the merge of
`origin/aman/ai-agent`. `git status` was checked after each: no unrelated files. Two
regressions on the branch side of `.env.example` ("promised" for "romanised", a dropped
CORS comment) were reverted rather than merged. Nothing pushed; no PR opened.

## Next Steps
1. Open the editor in a browser and walk the 11 demo commands (owner: P3) — this is the
   single largest untested surface.
2. Sign-offs per Dependencies (owners: P1, P4, lead).
3. Decide LiveKit vs browser fallback for demo day, and get credentials if LiveKit
   (owner: lead).
4. Consider `BEDROCK_MODEL_ID` — currently `global.anthropic.claude-sonnet-4-6`; a more
   capable model is worth testing for tool selection under the 6-iteration cap (owner: lead).
5. If overlays are wanted, they need a renderer in `CaptionRenderer` and Remotion plus an
   endpoint before `add_overlay` is re-enabled (owners: P2, P3, P1).
