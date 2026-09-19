# Phase 18 — Voice controls the video, and the player stops sticking Audit

## Status
Implemented and verified in a real Chrome against the real running stack (real API, S3, LiveKit, Sarvam
streaming STT, Bedrock). Every fix has a before/after measurement. **Not verified:** a human voice on a real
microphone, real speaker echo, Hinglish speech, anything on a phone or another browser. The `apps/web`
changes are in **P3's folder** and need P3's review before they go to Shubh.

## Objective
Reported: "I can't play the video, it gets stuck, I tell the voice agent to play it and it doesn't respond."
Find the causes by using the app like a user, then fix them. The repo owner also asked for: voice control of
the video, clearer voice feedback, no sticking/restarting, a loading state, and a video that fits its area.

## What was actually wrong (evidence)
| # | Defect | Evidence before | Result after |
|---|---|---|---|
| B1 | **The agent has no playback tool, by design.** "Play the video" went to Bedrock (~8 s) and came back `UNSUPPORTED: I can't control video playback`. It also told the user to "use the spacebar", which did not exist. | Live agent: 4/4 playback phrases refused | Playback is answered locally in the editor. 0 agent calls for all playback commands (typed and spoken). Space now plays/pauses. |
| B5 | **The video restarted mid-use.** A 409 resync refetched the project; the API re-mints the presigned URL on every fetch, so `<video src>` changed and the browser reloaded: jumped back 15.8 s to 0:00 and stayed paused (13/26 samples paused mid-clip). | Reproduced with a real `PATCH 409` then refetch | Same source held while the file is the same. 2/2 valid resync runs: no jump, no pause, played to the end. |
| B4/B6 | **Expired link = dead end.** The `<video>` was unmounted and a blank pane remained. | Reproduced (403 on the first request): video GONE | Recovers by itself, resumes where it was. 10/10 runs. |
| B3 | **No loading / buffering feedback**; `play().catch(() => undefined)` hid every play failure. | No indicator on a 40 KB/s link | Loading skeleton, buffering spinner, play failures shown in words. |
| B7 | **Landscape clips got a wrong-shaped box** (`height:100% + aspect-ratio + max-width:100%` loses the ratio when max-width clamps). | 16:9 at 1440x900: 640x488 (26% off); 3 of 4 viewports failed | Contain-fit computed by ResizeObserver: 12/12 combinations within 1% aspect, any of 16:9, 9:16, 1:1. |
| B8 | **Voice gave no feedback** on what was heard or what to say. | Code + observation | Hint while listening; the outcome ("Playing", "Jumped to 0:10", "Ignored “Um”") flashes in the command bar for 4.5 s. |

## Implementation
- `lib/voice-intents.ts`: pure `parseTransportIntent` / `resolveTransport` / `describeTransport` (play, pause/stop,
  restart, go to N s / mm:ss / the end, skip ±N s, faster/slower/named speeds, mute/unmute; Hinglish `chalao`, `ruko`).
  Anchored whole-phrase so real edits are never swallowed ("play the word bekaar in red", "stop making things red").
- `hooks/useAgentCommand.ts`: transport commands intercepted next to undo/redo/stop-listening, no agent turn.
- `state/playback-context.tsx`: `play()` returns a result instead of swallowing it; `buffering`, `ready`, `playError`;
  `setMuted`; `duck()` turns the video to 25% **only while the user is speaking** (an interim transcript is present) plus a 0.9 s
  hold, so the clip is not buried under narration when someone talks. (First version ducked for as long as the mic was OPEN; see
  the follow-up below — that was a regression I introduced.)
- `components/preview/VideoStage.tsx`: stable source by file identity (`lib/media-key.ts`), automatic recovery from an expired
  or failed link (one automatic try per file per 30 s, then a "Try again" button), loading/buffering/error states,
  contain-fit sizing.
- `components/agent/AgentCommandBar.tsx` + `App.tsx`: hint, outcome flash, Space shortcut (ignored in inputs/buttons/sliders).
- `services/voice-agent`: unchanged in this phase (Sarvam provider is phase 17).

## Files
Modified (apps/web, **P3's folder, flagged**): `scripts/check-agent-apply.ts`, `src/App.tsx`,
`src/components/agent/AgentCommandBar.tsx`, `src/components/preview/VideoStage.tsx`, `src/hooks/useAgentCommand.ts`,
`src/lib/voice-intents.ts`, `src/state/playback-context.tsx`. New: `src/lib/media-key.ts`, this audit.
Not touched: `packages/shared`, `services/api`, `remotion/`. Harness, test media and screenshots are outside the repo.

## Testing (commands actually run)
- `tsc -b` clean; `npm run build` succeeds; `oxlint` on touched files: one warning, pre-existing (`usePlayback` export).
- `check:agent` + `check:captions`: all pass (107 `ok` lines in `check:agent`, 0 failures). 35 of them are new: they cover the parser
  (including a 13-phrase list that must NOT be read as playback, plus separate negatives for the "pass"/"house" aliases), the
  clamping/stepping arithmetic, the recogniser aliases, and `mediaKey`.
- API pytest 95 passed; 8 agent test modules pass; worker tests pass; `agent_demo --grade easy` 4/4 on live Bedrock.
- Real Chrome (puppeteer-core) scenarios, before -> after: layout 9/15 -> 15/15 overall harness; resync fail -> pass (x2 valid);
  expired link fail -> 10/10; loading and buffering indicators absent -> present.
- Typed playback in the UI: 13/13 (play, seek, speed, mute, stop, Space, no agent calls, a real edit still reaches the agent).
- Spoken (fake microphone playing a 74 s sequence of 10 commands through real LiveKit + Sarvam): play, go to 10 s, pause,
  faster, normal speed, mute, unmute, restart, filler ignored, pause: all obeyed, **0 agent calls**. Effect lands about
  0.7-1.3 s after the end of the phrase.

## Findings worth knowing
1. **Sarvam en-IN garbles a spoken "pause"**: it returned "Pass", "Pass", "Pass", "House" and "Has" in different runs, while "stop the
   video", "play", "faster", "mute", "restart" were heard correctly. The batch API and the plugin fed directly (no LiveKit) heard "Pause"
   correctly, so the loss happens on the LiveKit/Opus path. **DTX is at most a small factor** (David: 6/6 either way; Zira: DTX on 0/3,
   off 1/3). A bitrate experiment crashed the Python SDK and was abandoned; no publish-setting change is shipped because none was
   proven. Mitigation shipped instead: bare "pass"/"paws" always mean pause, and while the video is playing a bare "house/hours/pose/..."
   does too; the hint teaches "stop the video". Six spoken "pause" in one run: 5 caught, 1 reached the agent ("House", paused state).
2. "That line" still needs a selected word or a playhead inside a caption (unchanged, by design).

## Follow-up: "I can't hear the sound in the video" (a regression I introduced)
**Cause (most likely, measured):** the first ducking held the video at 25% volume for the whole time the mic was open. A voice
session can stay open for the entire editing session, and on Windows the OS can turn other audio down further while any app has a
microphone open, so the clip could be nearly inaudible. Measured in Chrome: `volume` 1 -> 0.25 as soon as the mic opened, back to 1
when it closed (so ducking did restore correctly).
**Ruled out (measured):** every project's source file has an AAC audio track with real content (mean -15.6 to -21 dB, peaks near 0 dB),
the browser decodes it (`webkitAudioDecodedByteCount` rises), and nothing is muted.
**Fix:** duck only while the user is speaking. Measured over a 60 s spoken session with the mic open and the video playing:
volume 1.0 throughout except ~1 s dips to 0.25 around 5 of the spoken commands; back to 1.0 and unmuted after the mic stops.
**A measurement trap worth recording:** reading the audio through a Web Audio analyser gives 0 for ALL of our videos, even ones known
to be loud, because a cross-origin video without CORS headers is silenced inside that graph. A 440 Hz tone control read 0.354 (so the
analyser works), which is how the trap was caught. Nothing about real playback follows from that zero.
**Not verifiable from here:** actual loudness through your speakers. If the sound is still missing with the mic OFF, it is outside
this code (tab muted in Chrome, output device, or Windows: Sound settings > Communications > "Do nothing").

## Deviations / mistakes made along the way (kept for honesty)
1. My first resync "pass" was **invalid**: no write happened, so no resync did. I made the test require `409 then refetch` and treat
   anything else as INCONCLUSIVE, then re-ran. The baseline failure I rely on was captured with a genuine resync.
2. A control run that swapped the old `VideoStage` back in **did not run** (the page showed no video) and its restore step initially
   failed on a relative path, leaving the old file on disk for a few minutes. The fixed file was restored from a backup and verified
   byte-identical (hash and line count). No comparison is claimed from that attempt.
3. A recovery flake (1 in 4) was traced to two presigned links minted in the same second being identical, so `setHeld(sameString)`
   did nothing. Fixed with an explicit `video.load()`; 10/10 afterwards. The test was changed from "block this signature" to "block the
   first request" so it can tell an identical link from a fresh one.
4. One harness edit corrupted non-ASCII characters (PowerShell 5.1 encoding); it affects only some log-line matching in my tool.

## Unverified / Untestable
1. A human at a microphone, real room noise, real speaker echo. Ducking is verified by the element's `volume` only, not by measuring
   feedback into the mic, and no test can hear loudness through real speakers. Whether the video's own narration now leaks into the
   recogniser (the reason ducking exists) is unmeasured; the speech-only ducking trades some of that protection for audible sound.
2. Hinglish / hi-IN speech (test voices are English). 3. Firefox/Safari/mobile. 4. Browser fullscreen with captions.
5. Real one-hour expiry (simulated with a refused first request). 6. Whether higher Opus bitrate improves recognition.

## Security
No secrets added or logged; `.env` files unchanged this phase. The recovery path re-fetches the project through the existing
authenticated-less API only to read `videoUrl`. Space shortcut is ignored inside inputs, so it cannot swallow typed text.

## Git / Change Scope
Branch `p3-agent-talk-edit` @ `3eb69df`, nothing committed or pushed. `git status` reviewed: only the files above.
Test data left under the `p4` prefix (projects `9d33655dac21`, `b1694bfc9130`, `19022ae8e357`, plus earlier ones); nothing deleted.

## Next Steps
1. P3 reviews the `apps/web` diff (owner: P3), then it can be committed on the branch.
2. Try it with your real microphone and a real reel; report any misheard commands so aliases are based on more than TTS voices (owner: you).
3. If "pause" stays unreliable for real voices, prototype a higher publish bitrate in `useVoiceInput` and measure before/after (owner: P3/P4).
4. `hi-IN` codemix spike with real Hinglish audio (owner: you); an LLM `playback` tool remains an option for fuzzy phrasing.
