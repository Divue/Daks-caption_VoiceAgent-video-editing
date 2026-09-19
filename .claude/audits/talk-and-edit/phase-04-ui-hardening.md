# Talk-and-Edit Phase 4 — driving the real UI, and what it found

## Status
Implemented and verified in a real (headless) browser against the running stack, and against
live Bedrock and Rekognition. Every defect below was found by driving the editor with
Playwright rather than by reading code or calling the API — the API suite was green the whole
time these bugs were live. **Not verified:** the persisted path on a real uploaded project, and
a human speaking into a microphone.

## Objective
The repo owner ran the demo by hand and reported: voice unusable, no agent reply visible, "a lot
of prompts didn't work", can't edit one word's colour, "put the captions on top" failed, "make
the texts bigger" sometimes bugs. Instruction: drive the UI, check what it actually does, fix it,
and keep going until it holds up.

## Implementation

### Root cause of "a lot of prompts didn't work"
Every prompt was tested against `normal-project.json` in a harness. The APP loaded
`demo-project.json` — 16 words, 12 s, `videoUrl: "demo.mp4"`. Half the prompts named words that
fixture does not contain, no video ever loaded, and `analyze_frame` could not run at all in the
app. The harness and the app were exercising different documents; no backend test could have
caught it.

### Defects found and fixed
1. **Wrong demo project, no video.** The API serves the bake-off clips at `/demo-media/<name>`
   and the demo loads `normal-project` (28 s, 51 words, real footage).
2. **"Make the texts bigger" made the biggest word smaller.** Measured: `Shubher` 33.5 px against
   11.4 px body, then everything flattened to 18.3 px. A per-word `style.fontSize` is final and
   bypasses `sizeMultiplier` (`caption-style.ts` says so in its own comment). `PresetOverride`
   gained `baseFontSize`; the prompt routes a blanket resize there. Re-measured: 11.4 → 20.3 and
   33.5 → 59.6, the 2.93× ratio preserved.
3. **The agent could not see the look it was editing.** `Preset` lives only in TypeScript, so
   asked to "get rid of the red" it turned the tone layer off, reported success, and left every
   emphasised word red (`#E2452A`). The editor now resolves the active preset and sends it as an
   `<active_preset>` data block. Measured after: both `#E2452A` and `#FF5C3A` → `#FFF6E9`, with
   the agent naming both sources. It also stopped writing no-op patches ("already three words").
4. **The agent's reply was buried** as numbered tool-step 4. The backend `log[]` mixes a command
   echo, one line per tool, and the closing sentence; they are now split so the reply is the
   headline, the count a subtitle, the utterance quoted beneath, and `trace` holds only tools.
5. **Per-word editing looked impossible.** It worked, but you had to click the word AND the
   "This word" tab. Selecting a word now switches scope. Deselecting does not widen it back.
6. **Voice sent the agent things nobody said.** Filler and sub-3-character transcripts are now
   dropped in the browser; "stop listening" / "that's all" stop the mic by voice.
7. **A ref was written during render** (oxlint `react(refs)`); moved to an effect.
8. The right panel opens on Activity for the FIRST agent turn only, so the reply is visible
   without clicking; after that the user's tab choice is theirs.

## Files Created
- `services/api/app/routers/demo_media.py` — dev-only clip server for the demo.
- `apps/web/src/lib/voice-intents.ts` — pure intent matching (filler, stop, undo/redo).

## Files Modified
Structural:
- `apps/web/src/hooks/useAgentCommand.ts` — reply/trace split, voice filtering, stop-by-voice,
  sends `activePreset`.
- `apps/web/src/components/editor/EditorBootstrap.tsx` — demo loads `normal-project` + real URL.
- `apps/web/src/state/preset-override-context.tsx` — applies `baseFontSize` inside `preset.base`.
- `services/api/app/agent/planner.py` — `<active_preset>` block; colour and resize prompt rules.
- `services/api/app/agent/contracts.py` — `ActivePreset` on command and voice requests.

Additive:
- `apps/web/src/App.tsx` — controlled right-panel tab, stop-voice ref wired in an effect.
- `apps/web/src/components/agent/AgentActivityPanel.tsx` — summary and utterance lines.
- `apps/web/src/components/agent/AgentCommandBar.tsx` — focus on question, "mic is still on".
- `apps/web/src/components/inspector/CaptionStylePanel.tsx` — scope follows selection.
- `apps/web/src/hooks/useAgentActivity.ts` — `summary` field.
- `apps/web/src/lib/agent-api.ts` — `ActivePreset` type and parameter.
- `apps/web/src/lib/demo-prompts.ts` — prompt 9 changed to "two at a time".
- `apps/web/scripts/check-agent-apply.ts` — 8 voice-intent assertions.
- `packages/shared/src/project.ts`, `services/api/app/schema.py` — `baseFontSize`, together.
- `services/api/app/agent/tools/schemas.py`, `tools/project_tools.py` — `baseFontSize` arg.
- `services/api/app/main.py` — mounts `demo_media`.
- `services/api/scripts/agent_demo.py` — sends the resolved preset; two expectations corrected.
- `README.md` — local-setup runbook; `.env.example` — `VITE_USE_FIXTURE=true`.

## Files Intentionally Untouched
- `apps/web/src/lib/caption-style.ts` — the size-resolution rule it documents is correct; the bug
  was the agent writing the wrong field, so the fix belongs in the agent, not the resolver.
- `apps/web/src/components/toolbar/EditorToolbar.tsx` and the timeline tracks — see Deviations.
- `remotion/` — P2's; `baseFontSize` flows through `preset.base` and needs no composition change.
- `services/api/requirements.txt` — no dependency added.

## Architecture
NEW: a data block describing the active preset, resolved by the editor and sent with every
command; a dev-only media route. REUSED: the existing resolver reads `preset.base.fontSize`, so
`baseFontSize` needed no resolver change — it is merged into `base` by the provider.

```
PresetOverrideProvider ─(resolved preset)─► useAgentCommand ─► POST /agent/command
                                                                   └─ <active_preset> block
                                                                       (data, not instructions)
```
The key property: `Preset` stays TypeScript-only (INDEX.md invariant), and the agent still sees
it — the editor owns the resolver, so the editor tells the agent what it resolved.

## Interfaces / Contracts
- `PresetOverride.baseFontSize: number | undefined` (px at 1080p), in `project.ts` and
  `schema.py` together. Additive and optional — **no migration**, `SCHEMA_VERSION` stays 2.
- `ActivePreset {presetId, name, baseColor, emphasisColor, emphasisFontFamily, emotionColors,
  wordsPerLine}` — optional on `AgentCommandRequest` and `AgentVoiceCommandRequest`.
- `set_preset_override` gains `baseFontSize`.
- `GET /demo-media/{name}` — 200 for a file in `scripts/stt_bakeoff/clips`, 404 otherwise.
- Frontend `AgentLogEntry.summary?: string`.

## Ownership
- `apps/web/**` — P3, in lane.
- `services/api/app/agent/**` — **P4**; needs sign-off.
- `services/api/app/main.py`, `routers/demo_media.py`, `README.md` — **P1**; needs sign-off.
- `packages/shared/src/project.ts` + `services/api/app/schema.py` — **lead**; needs sign-off.
All crossings were made on the repo owner's explicit instruction.

## Validation
- `/demo-media/{name}` matches against the real directory listing rather than joining a path, so
  `..%2f..%2fmain.py` returns 404 (verified).
- `baseFontSize` is `positive()` in zod and `gt=0` in Pydantic.
- Voice filtering fails safe: anything not recognised as filler reaches the agent. The assertions
  check both directions, including that "stop making things red" is NOT a stop phrase and "undo
  the red on that word" is NOT a bare undo.

## Security
- `/demo-media` is a new unauthenticated route. It is dev-only in intent but **not gated by
  environment** — it is mounted whenever the API runs, and serves only the four bake-off clips
  already committed to the repo. Before any deployment it should be removed or gated.
- `<active_preset>` is wrapped and labelled as data, like the command and selection.
- No secrets or credentials were added or committed.

## Testing
- Agent suite: **318 checks, 0 failures** across 12 files.
- `pytest tests/`: **95 passed**.
- Web: `check:agent` + `check:captions` (**54 assertions**), `tsc -b` clean, `npm run build`
  clean, oxlint **19 warnings** (baseline; the one this phase introduced was fixed).
- `scripts/agent_demo.py` against real Bedrock: **easy 4/4, average 6/6, asks 3/3, hard 4/4**.

## Live Verification
Headless Chromium against the running stack, measuring computed styles rather than reading
messages:
- Video loads to `readyState 4`, duration 28.11 s; captions render at 1.5 s.
- Mic toggles Start → Stop → Start and is never disabled.
- Commands round-trip; the panel shows reply, count, utterance and steps.
- **One agent turn = one undo step:** 51 words to yellow → "Undo that" restores the original
  exactly, including the emphasis red → Ctrl+Shift+Z redoes → Ctrl+Z undoes.
- Font size and colour before/after for every fix above.

## Unverified / Untestable
1. **The persisted path.** Fixture mode has no `projectId`, so `applyAgentPatches` returns before
   writing. The bulk endpoint has pytest coverage; editor → bulk PATCH → reload on a real uploaded
   project has never run.
2. A human speaking into a microphone (LiveKit is proven with synthesised audio only).
3. Anything visual beyond what computed styles and screenshots show.

## Integration Status
- Demo on real video: connected, verified.
- Preset sight (`<active_preset>`): connected, verified against live Bedrock.
- `baseFontSize`: connected, verified by measurement.
- Voice filtering / stop-by-voice: connected, unit-verified, not spoken to.
- Persistence on a real project: **not exercised**.

## Dependencies / Blockers
- P1, P4 and lead sign-off (see Ownership).
- A decision on the timeline toolbar (see Deviations).

## Deviations
1. **Two catalogue expectations were wrong, not the agent.** "Three words per line" is already
   true for Rangmanch, so the agent correctly answered "already done"; the prompt now asks for
   two. "Make it bigger" is better answered than asked, so it moved to the acting tier and "change
   the colour" replaced it in `asks`.
2. **Timeline toolbar left in place, against a written invariant.** `INDEX.md` says: "no
   Video/Audio tracks, no track headers, no editing toolbar… Do not re-add them." The app shows
   all three, with inert Split, Trim, Transitions, Effects, Music and Speed. Commits `079c1bd`
   and `5e09df2` re-added them deliberately after `0722895` removed them for audit 16. They are
   honestly inert, but the agent refuses every one of them — a demo liability. Reverting a
   teammate's deliberate work was not done unilaterally; it is raised for the lead.

## Git / Change Scope
Branch `p3-agent-talk-edit`. Phase commits `4d439a7`, `0577953`, `cd2cbc2`. Pushed to origin.
`git status` reviewed before each commit; no unrelated files. PR #11 (earlier work) was already
merged; this phase is in a follow-up PR not yet opened (blocked on GitHub account permissions).

## Next Steps
1. Decide the toolbar question (owner: lead).
2. Run the agent on a real uploaded project and confirm changes survive a reload (owner: P3).
3. Speak to it through a real microphone (owner: whoever demos).
4. Gate or remove `/demo-media` before any deployment (owner: P1).
