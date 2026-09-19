# Talk-and-Edit Phase 4 — driving the real UI, and what it found

## Status
Working and verified in a real browser. Every defect below was found by driving the actual
editor with Playwright, not by reading code or calling the API — which is the point: the API
suite was green the whole time these bugs were live.

## Objective
The repo owner ran the demo by hand and reported: voice unusable, no agent reply visible,
"a lot of prompts didn't work", can't edit one word's colour, "put the captions on top"
failed, "make the texts bigger" sometimes bugs. Find out why, fix it, and stop guessing —
they explicitly asked for the UI to be driven and the results checked.

## Why the API suite missed all of this
Every prompt was tested against `normal-project.json` in a harness. The APP loaded
`demo-project.json` — 16 words, 12 seconds, `videoUrl: "demo.mp4"`. So:
- half the prompts named words that fixture does not contain,
- no video ever loaded, so the stage was empty,
- `analyze_frame` could not run **at all** in the app, however well it worked in tests.

The harness and the app were exercising different documents. That is the root cause of "a lot
of prompts didn't work", and no amount of backend testing would have caught it.

## Defects found and fixed

**1. Demo ran on the wrong project, with no video.** The API now serves the bake-off clips at
`/demo-media/<name>` (dev-only, matched against the real directory listing, no traversal —
verified: `..%2f..%2fmain.py` → 404), and the demo loads `normal-project`: 28s, 51 words, real
footage. Vision works in the app for the first time.

**2. "Make the texts bigger" made the biggest word smaller.** Measured in the browser: before,
`Shubher` 33.5px against 11.4px body; after, everything flattened to 18.3px. An explicit
per-word `style.fontSize` is final and bypasses `sizeMultiplier` (`caption-style.ts` says so in
its own comment), so a blanket per-word size destroys the emphasis hierarchy. `PresetOverride`
gained `baseFontSize`; the prompt now routes a blanket resize there and reserves per-word size
for "make THIS word bigger". Re-measured: 11.4→20.3 and 33.5→59.6, the 2.93× ratio preserved.

**3. The agent could not see the look it was editing.** `Preset` lives only in TypeScript, so
the agent had no idea Rangmanch draws emphasis in `#E2452A` and the angry tone in `#FF5C3A`.
Asked to "get rid of the red" it turned the tone layer off, reported success, and left every
emphasised word red. The editor now resolves the active preset and sends it as an
`<active_preset>` data block. Measured after: emphasis `#E2452A`→`#FFF6E9` **and** angry
`#FF5C3A`→`#FFF6E9`, with the agent naming both sources. It also stopped doing no-op work —
asked for three words per line it now answers "already three".

**4. The agent's reply was buried as a numbered tool step.** The backend `log[]` is three
things in one list: a command echo, one line per tool, and the closing sentence. Split — the
reply is the headline, the count a subtitle, the utterance quoted beneath, and `trace` holds
only real tool calls.

**5. Per-word editing looked impossible.** It always worked, but you had to click the word AND
then the "This word" tab; until then every control still edited all 51 with nothing saying
why. Selecting a word now switches scope.

**6. Voice sent the agent things nobody said.** Any final transcript became a Bedrock round
trip, including "uh" and the recogniser's guesses at silence. Filtered in the browser, with
"stop listening" handled locally.

**7. `stopVoiceRef.current` was assigned during render** (oxlint `react(refs)`). Moved to an
effect.

## Not fixed — flagged for a decision
`.claude/INDEX.md` says: *"The bottom strip is a CAPTION RIBBON, not a timeline: one lane, no
Video/Audio tracks, no track headers, no editing toolbar… Do not re-add them."* The app
currently shows Video and Audio tracks, track headers, and a toolbar offering Split, Trim,
Snapping, Link tracks, Transitions, Effects, Stickers, Music and Speed. Commits `079c1bd`
("layers back (rebuilt, not restored)") and `5e09df2` ("timeline tools and per-track controls
back") put them there deliberately, after `0722895` removed them for audit 16.

The controls are honestly inert (`InertControl`: disabled, muted, "not built yet" tooltip), so
this is not faked behaviour. But it is a **demo liability**: the UI advertises cutting,
transitions, effects and music, and the agent correctly refuses every one of them. A judge who
sees scissors will ask for a cut. Either the invariant is stale and should be rewritten, or
the toolbar should go. **Not decided unilaterally — it reverses a teammate's deliberate work.**

## Files Created
`services/api/app/routers/demo_media.py`, `apps/web/src/lib/voice-intents.ts`, this audit.

## Files Modified
`EditorBootstrap.tsx`, `App.tsx`, `AgentCommandBar.tsx`, `AgentActivityPanel.tsx`,
`CaptionStylePanel.tsx`, `useAgentCommand.ts`, `useAgentActivity.ts`, `lib/agent-api.ts`,
`preset-override-context.tsx`, `scripts/check-agent-apply.ts`, `main.py`, `contracts.py`,
`planner.py`, `tools/schemas.py`, `tools/project_tools.py`, `packages/shared/src/project.ts`,
`services/api/app/schema.py`, `scripts/agent_demo.py`, `README.md`, `.env.example`.

## Testing
- Agent suite **318 checks**, pytest **95 passed**, web **54 assertions**
  (`check:agent` + `check:captions`), `tsc -b` clean, `npm run build` clean, oxlint **19
  warnings** (unchanged baseline).
- Demo catalogue against real Bedrock: **easy 4/4, average 6/6, asks 3/3, hard 4/4**.

## Live Verification (real headless Chromium against the running stack)
- Video loads to `readyState 4`, duration 28.11s; captions render (`"this is Shubher"` at 1.5s).
- Mic toggles Start→Stop→Start and is never disabled.
- Commands round-trip and the panel shows the reply, the count, the utterance and the steps.
- **Undo: one agent turn is ONE undo step.** 51 words to yellow → "Undo that" restores the
  original exactly, including the emphasis red → Ctrl+Shift+Z redoes → Ctrl+Z undoes.
- Rendered-style verification for every claim above (computed `fontSize`, `color`, y%).

## Unverified
1. **The persisted path.** Fixture mode has no `projectId`, so `applyAgentPatches` returns
   before writing. The bulk endpoint is covered by pytest, but editor→bulk-PATCH→reload has
   never been exercised on a real uploaded project. This is the largest remaining gap.
2. A human speaking into a real microphone. The LiveKit path is proven with synthesised audio;
   the browser-speech fallback has never been heard.
3. Two expectations in the catalogue were wrong rather than the agent, and were changed:
   "three words per line" is already true, and "make it bigger" is better answered than asked.

## Next Steps
1. Decide the timeline/toolbar question above (owner: lead).
2. Exercise the agent on a real uploaded project and confirm changes survive a reload.
3. Speak to it.
