# Phase 17 — End-to-end voice agent + editor test, and the Sarvam STT fix Audit

## Status
Voice and the editor are **verified end to end in a real browser** with synthetic speech. One code
change (P4 folder) unblocked voice. Hinglish quality with a real reel, a human microphone, and
export are **not verified / not possible** (see below).

## Objective
Prove the talk-and-edit flow on `p3-agent-talk-edit` (tip `4d439a7`) end to end, and fix what blocked it.
Blocker found in phase 16: AWS Transcribe **streaming** is denied for the shared identity (`shubh-2`), so the
LiveKit worker got no transcripts.

## Implementation (the only code change)
`services/voice-agent/stt_provider.py`: added `get_stt_provider()` (`VOICE_STT_PROVIDER`, **default `aws`**, so
unset behaves exactly as before; unknown values raise) and `get_sarvam_api_key()`. `get_stt_plugin()` now builds
`sarvam.STT(language, model="saaras:v3", mode="codemix", api_key=...)` when `sarvam` is selected; the AWS branch is
unchanged. Plugin imports stay lazy. `requirements.txt`: `livekit-agents[aws,sarvam]~=1.5`. `.env.example` documents the
new variables. `tests/test_stt_provider.py`: +7 checks. Ported from the snapshot branch
`aman/ai-agent-backup-before-p3-migration` (`78e56dd`); deliberately **not** ported: named-agent dispatch (the target
removed `agent_name` on purpose), the token change, `useLiveKitVoice.ts`, `exclude_unset`.
Config (gitignored `.env`): `VOICE_STT_PROVIDER=sarvam`, `VOICE_STT_LANGUAGE=en-IN`.
Before trusting the port, its call shape was checked in the built image (livekit-agents / sarvam plugin 1.8.2): the
constructor takes `language, model, mode, api_key`; `saaras:v3` and `codemix` are valid literals; languages include
`hi-IN`, `en-IN`, `unknown`. The plugin's own defaults are `saaras:v4` / `transcribe`; v3 + codemix are set explicitly.

## Files Created / Modified
Modified (all P4): `services/voice-agent/{stt_provider.py, requirements.txt, .env.example, tests/test_stt_provider.py}`.
Created: this audit. No file outside `services/voice-agent` and `.claude/audits` changed. Harness, test media,
screenshots and the demo recording live outside the repo (`C:\Users\amanr\Downloads\expressive-captions-e2e`).

## Testing (commands actually run)
- Worker unit tests in the container: 12/12 PASS (7 new).
- `check_voice_e2e.py` (real token, LiveKit room, agent dispatch, Sarvam streaming): **PASS**, final transcript
  `'Make that line angry.'` (was `403 AccessDenied` on Transcribe). Audio was Windows SAPI TTS, not Polly (Polly is also denied).
- Browser harness (`puppeteer-core` driving installed Chrome, fake microphone from a WAV):
  - **A upload -> captions: PASS.** Real upload via the UI; all 7 pipeline stages `done`; 26 words visible in the editor.
  - **B typed agent -> saved: PASS.** "put a fire emoji on the word of": version 1 -> 2, `of:🔥` saved.
  - **C voice -> agent -> saved: PASS.** Word "show" selected, mic on, the fake mic said "make that line angry": version 1 -> 2,
    words 8-15 ("I am so excited to show you this") became `angry`; the UI shows ANGRY tags and the timeline recoloured.
- Regression: API pytest 95 passed; six agent test modules pass; `agent_demo.py --grade easy` 4/4 on real Bedrock. Frontend
  untouched this phase (tsc / `check:captions` / `check:agent` were green in phase 16).

## Live Verification
Real: Chrome, editor, API, S3 upload, Transcribe batch + Sarvam batch + Bedrock (pipeline and agent), LiveKit dev server,
worker, Sarvam streaming STT. Not real: a human voice and microphone.

## Findings worth knowing
1. **"that line" needs a target.** With nothing selected and the playhead at 0:00 (before the first caption at 0:00.1) the agent
   correctly **asks** ("Could you click on the word (or words) in the line…") and the command bar shows it. My first voice run
   looked like a failure until I read the screenshot. Selecting a word first resolves it.
2. **"that line" was read as the spoken sentence** (8 words), not the 3-word caption block containing the selection.
   Plausible, but a creator might expect the block. Not changed.
3. **Barge-in is real** (`useAgentCommand.ts:88-89`): a new utterance aborts the in-flight turn. A looping phrase shorter than
   one agent turn can starve every turn. Relevant to a noisy room; not a defect.
4. Tone changes re-split caption blocks (12 -> 11 blocks in the run), as the demo catalogue says.

## Unverified / Untestable
1. **Hinglish.** The test speech is English (Windows TTS). `hi-IN` + codemix was not exercised. The real-reel run was requested by the
   repo owner but no path had been supplied when this was written.
2. A **human at a microphone**: permission prompt UX, accents, noise. Chrome's fake device replaced it.
3. Chrome's own SpeechRecognition fallback (needs Google's service; not headless-testable).
4. Undo after an agent turn, page reload persistence in the UI (persistence was confirmed by `GET /projects/{id}` instead).
5. Grades average / asks / hard of `agent_demo.py`.

## Blocked / Out of scope (reported, not fixed)
- **No export.** `remotion/` is a README on every branch and `POST /projects/{id}/render` returns 501 (owner P2). The "demo video"
  produced here is a **screen capture of the editor preview** (6.7 fps capture, encoded at 25 fps, narration muxed), not a render.
- **Demo clips missing.** `services/api/scripts/stt_bakeoff/clips/*` is git-ignored; `/demo-media/Normal.mp4` still 404s (Shubh has them).
- **IAM** still denies Transcribe streaming and Polly for `shubh-2`; the Sarvam provider works around it and does not fix it. The default
  stays `aws` so the team can switch back once the permission is granted.

## Security
`SARVAM_API_KEY` is read from the environment inside the container; it is never logged or committed (`.env` is gitignored). The Sarvam key
is now used by a second service (the voice worker) in addition to the batch pipeline. LiveKit runs in dev mode with the public
`devkey`/`secret`; `/agent/livekit-token` still has no auth (pre-existing, noted in the target's audit). Voice audio leaves the machine to Sarvam's API.
(Carried over from phase 16: LiveKit Cloud credentials were exposed in an earlier transcript; rotate them.)

## Git / Change Scope
Branch `p3-agent-talk-edit` @ `4d439a7`. Uncommitted: the four `services/voice-agent` files and this audit. Nothing committed or pushed.
Test data left under the `p4` prefix: several projects created by the harness and checks (e.g. `ab6dab179429`, `eeb07edbe614`,
`a6d95feeefd0`); nothing deleted.

## Next Steps
1. Run a real Hinglish reel with `VOICE_STT_LANGUAGE=hi-IN` (owner: whoever supplies the reel).
2. Ask the lead to grant `transcribe:StartStreamTranscription` if AWS streaming is preferred (owner: lead).
3. Decide what "demo video" means for Shubh: screen capture (available now) or an export (needs P2's renderer).
4. Tell P3 about finding 1 (the empty-selection question at 0:00) if the first-time experience matters for the demo.
