# Work report — voice agent, video player and export

**Written for:** the whole team (P1 API, P2 renderer, P3 editor, P4 agent, and the lead).
**By:** Aman (P4) with Claude Code. **Branch:** `p3-agent-talk-edit` (Shubh's branch, at `3eb69df` when this was written).
**Status of the code:** everything below is **uncommitted** on that branch. Nothing has been pushed. It is waiting for the reviews listed in section 8.

This document explains, in plain language, what changed, why, where it lives, how to run and test it, and what is still unfinished. If you only
have two minutes, read section 1 and section 8.

---

## 1. The short version

Three user-visible things now work that did not before:

| # | What you can do now | Before |
|---|---|---|
| 1 | **Say or type "play", "stop the video", "go to 5 seconds", "faster", "mute"** and the video obeys, instantly, with no AI call | The voice agent refused ("I can't control playback") after an ~8 second AI round trip |
| 2 | **The video player is reliable**: it no longer restarts or freezes mid-use, recovers from an expired link, shows loading/buffering, and fits any aspect ratio | Video jumped back to 0:00 after some edits, went blank when the link expired, and 16:9 clips got a wrong-shaped box |
| 3 | **Click Export and get a real MP4** of the video with the captions burned in and the original sound | Export button showed "not implemented" (the server answered `501`) |

Plus: live voice now works without the AWS permission that was blocking it (we use Sarvam for speech-to-text), and the sound-volume bug I
introduced along the way was found and fixed.

Where the changes are, by owner (details in section 6):

- **P4 (`services/voice-agent`)** — small: a speech-to-text provider switch.
- **P3 (`apps/web`)** — most of the change: player, voice commands, command bar, export button, and one shared-renderer fix.
- **P2 (`remotion/`)** — new: the caption composition and a local render server.
- **P1 (`services/api`)** — the render route replaces the `501` stub, plus one S3 helper and tests.

---

## 2. Where everything stands (repo state)

| Thing | State |
|---|---|
| Current branch | `p3-agent-talk-edit`, tracking `origin/p3-agent-talk-edit`, at `3eb69df` (Shubh's latest) |
| My changes | **Uncommitted** in the working tree: 23 modified files and 15 new source/test files (plus 4 audits and this report). Not pushed. |
| Safety copy of my *older* agent work | Local branch `aman/ai-agent-backup-before-p3-migration` (commit `78e56dd`, 50 files). Contains phases 9-15 and their audits. **Local only.** |
| Original branch | `aman/ai-agent` at `a8359c5`, untouched |
| Git stash | `stash@{0}` "local prosody changes" (a one-line change in `services/api/app/pipeline/prosody.py`), untouched |
| `DESIGN.md` always shows as modified | Not a real change. The repo tracks **both** `DESIGN.md` and `design.md`, and Windows treats them as one file. Someone should delete one of the two from git. |

**What happened to my older agent work.** Before this session I had built a lot on `aman/ai-agent` (router mounting, saving agent edits, overlay
saving, a LiveKit voice setup). Shubh's `p3-agent-talk-edit` independently built better versions of most of it (one atomic save per agent turn,
more per-word tools, asking clarifying questions), so I **did not port** those. Only two ideas were worth bringing over: the Sarvam speech-to-text
provider (section 4.1) and, as a reference, the audits. Those audits (`phase-09` to `phase-15`) exist **only on the backup branch**.

---

## 3. How to run everything locally

Prerequisites: Docker Desktop, Node (the repo wants 24; 22.14 works), and a `.env` at the repo root (git-ignored).

```bash
# 1. Backend: API + LiveKit (voice server) + voice worker
docker compose up -d --build
curl localhost:8010/health              # {"ok":true}

# 2. Frontend
npm install                             # once, at the repo root
cd apps/web && npm run dev              # http://localhost:5173

# 3. Export (NEW): the render server runs natively, not in Docker
cd remotion && npm run render-server    # first start downloads ~110 MB of headless Chrome, ~1 min
```

Then open `http://localhost:5173/editor?id=<projectId>`. Upload your own video on `/editor` (under 60 seconds), or open an existing project id.

### The `.env` values that matter (and the traps I hit)

| Key | Use this | Why it matters |
|---|---|---|
| `DEV_PREFIX` | your own slot (`p4` for me) | It namespaces your S3 keys and DynamoDB rows. `p1` would overwrite P1's data. |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `ws://localhost:7880` / `devkey` / `secret` | Local LiveKit runs in dev mode. **Do not** point at LiveKit Cloud: the worker (forced to the local server) would reject cloud keys and voice would fail silently. |
| `VOICE_STT_PROVIDER` | `sarvam` (or unset = `aws`) | See 4.1. AWS live transcription is currently denied for our shared identity. |
| `VOICE_STT_LANGUAGE` | `en-IN` (`hi-IN` for Hinglish) | No default; the worker refuses to start without it. |
| `SARVAM_API_KEY` | ask the lead | Used by the batch pipeline and, now, the voice worker. |
| `VITE_USE_FIXTURE` | `true` | Needed for `/editor?demo=1`. |
| `RENDER_SERVICE_URL` | leave unset | Defaults to `http://host.docker.internal:3100` (where the render server listens). |

**AWS account migration (open):** the account is moving to a new owner (divue). At the time of writing my `.env` still holds the **old** account's keys
and points `S3_BUCKET` at the **old** bucket as a stopgap, because the new bucket returns `403` for the old keys. When the new keys arrive: put them in
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, switch `S3_BUCKET`/`DYNAMO_TABLE` to the new names, run
`docker compose up -d`, and then run the AWS check (see section 7). Old projects do not migrate.

---

## 4. What was done, area by area

Each block says: the problem, what changed, where, how to check it, and its limits.

### 4.1 Live voice without the blocked AWS permission  (P4 folder)

- **Problem.** The voice worker uses AWS Transcribe *streaming*, but the shared `shubh-2` identity gets `403 AccessDenied` for it (and for Polly and
  Rekognition). The mic connected but no words ever came back.
- **Change.** A provider switch: `VOICE_STT_PROVIDER=sarvam` uses Sarvam's streaming speech-to-text (already paid for; it also handles Hinglish in
  "codemix" mode). Default stays `aws`, so nothing changes for anyone who doesn't set it.
- **Where.** `services/voice-agent/stt_provider.py`, `requirements.txt` (`livekit-agents[aws,sarvam]`), `.env.example`, `tests/test_stt_provider.py`.
- **Check.** `docker compose exec -T voice-agent python tests/test_stt_provider.py` (12 checks). Live: `services/voice-agent/scripts/check_voice_e2e.py`
  now returns a real transcript. That script's Polly step is denied for our identity, so I generated test speech with Windows' built-in voice instead.
- **Limits.** Tested with English text-to-speech voices only. **Hinglish (`hi-IN`) is untested.** The permission is still denied; this is a workaround.

### 4.2 Voice (and typing) controls the video  (P3 folder)

- **Problem.** "Play the video" was sent to the AI model, which has no playback tool, so it answered "unsupported" after ~8 s. (It even told users to use a spacebar
  shortcut that did not exist.)
- **Change.** Playback commands are recognised **inside the editor**, next to the existing undo/redo handling, and applied straight to the player: no AI call,
  no delay, no cost. Supported: play / resume, pause / stop, restart, go to N seconds / mm:ss / the end, skip forward or back N seconds, faster / slower / named speeds
  (normal, double, half, `1.5x`), mute / unmute, plus a few Hinglish words (`chalao`, `ruko`). The **spacebar** now plays/pauses.
- **Safety rule.** The recogniser is deliberately strict: only whole phrases match. "Play the word bekaar in red" and "stop making things red" still go to the
  agent as real edits. There are 13 such must-not-match phrases in the tests.
- **Where.** `apps/web/src/lib/voice-intents.ts` (pure logic), `hooks/useAgentCommand.ts` (where it plugs in), `App.tsx` (wires it to the player and adds Space).
- **Check.** `check:agent` (section 7). Live: typed 13/13 pass; a 74-second spoken sequence of 10 commands through the real mic path: all obeyed, **zero calls to the agent**.
  The effect lands about 1 second after you stop speaking.
- **Known weakness — the word "pause".** Sarvam often mishears a spoken "pause" ("Pass", "House", "Has"), while "stop the video" is heard correctly. The batch API heard it
  fine, so the loss is on the live audio path (browser -> LiveKit -> worker). I did **not** find the root cause. Mitigations shipped: a bare "pass"/"paws" means pause, and
  while the video is *playing* a bare "house/hours/…" does too; the on-screen hint teaches "stop the video". Result: 5 of 6 spoken pauses caught in one test.
  Treat this as an open problem (section 9).

### 4.3 A reliable video player  (P3 folder)

Found by using the app like a user, with each problem reproduced before it was fixed:

| Problem (reproduced) | Cause | Fix |
|---|---|---|
| Video **jumped back to 0:00 and stopped** after some edits | When an edit collides with another write, the editor re-fetches the project. The API creates a *new* signed video link each time, so the browser thought it was a new video and reloaded | The player now keeps the same link while it is the same *file* (`lib/media-key.ts`) |
| **Blank pane** when the video link expires (links last 1 hour) | The player gave up and swapped in a fake clock | It fetches a fresh link once, and resumes where it was; then offers "Try again" |
| No loading or buffering feedback; play failures invisible | Errors were swallowed (`play().catch(() => undefined)`) | Loading skeleton, buffering spinner, and failures shown in words |
| **16:9 videos got a wrong-shaped box** | The old CSS lost the aspect ratio when the width was capped | The frame is now calculated to fit any shape (measured: 12 of 12 size/shape combinations correct) |

- **Where.** `components/preview/VideoStage.tsx`, `state/playback-context.tsx`, `lib/media-key.ts`.
- **Limits.** Simulated expiry (a refused first request), not a real hour-old link. One flaky case (two links minted in the same second are identical) was found and fixed.

### 4.4 Clearer voice feedback  (P3 folder)

The command bar now shows a hint while the mic listens ("try play, stop the video, go to 5 seconds, or make that line angry") and flashes the outcome
("Playing", "Jumped to 0:10", "Ignored 'um'") for about 4.5 seconds. Files: `components/agent/AgentCommandBar.tsx`, `App.tsx`.

### 4.5 "I can't hear the video" — a bug I introduced and fixed  (P3 folder)

To stop the video's own narration leaking into the microphone, I had turned the video down to 25% **the whole time the mic was open**. A voice session can stay open
for a whole editing session, and Windows can turn audio down further while any app uses a mic, so the video became nearly inaudible. Now it dips to 25% **only while you are
speaking** (plus a 0.9 s hold). Measured: volume stays at 1.0 except for roughly one-second dips around commands. The constants are `DUCK_FACTOR` (in `playback-context.tsx`)
and `DUCK_RELEASE_MS` (in `App.tsx`).
- **Not verifiable from here:** how loud it is through real speakers, and whether the video's narration now leaks into the mic. I cannot hear audio.

### 4.6 Export: click a button, get a captioned MP4  (P2 + P1 + P3)

This is the biggest piece. In one sentence: the editor asks the API to export; the API asks a local **render server** (Remotion + headless Chrome) to draw the video frame by
frame with the *same caption code the editor uses*; the finished MP4 is stored on S3 and offered as a download.

```
Editor  --click Export-->  API  --project + video link + frame rate-->  Render server (Node, port 3100)
   ^                        |                                                 |
   | polls progress         | when done: copies the MP4 to S3                 | renders with Remotion
   +----- "Download MP4" <--+ and returns a save-as link  <-------------------+
```

**Why the export looks like the editor.** The export does not re-implement captions. It calls the same functions (`deriveBlocks`, `resolveEmphasis`, and the new
`resolvePreset`) and renders the **same `CaptionRenderer` component** from `apps/web/src`. Change how captions look there and both change together. I extracted the one piece
that only the editor could call (the preset "override" merge) into `apps/web/src/lib/resolve-preset.ts`; it is proven identical to the old code on 49 preset/override combinations.

**Two things can still make them drift, and `npm run check -w @captions/remotion` guards both:** the caption code uses a handful of Tailwind CSS classes that the export
bundle doesn't have (so `remotion/src/caption-utilities.css` provides them by hand), and the export loads the same Google Fonts link as the editor.

What it produces: MP4 (H.264 + AAC) at the **source's resolution and frame rate**, original audio, correct colour tags. Verified on your real 2560x1440 stereo upload:
same size, same frame rate, duration within 6 ms, audio loudness identical to the source.

| Piece | Where | Notes |
|---|---|---|
| Composition | `remotion/src/{Root,CaptionVideo,fonts}.tsx`, `caption-utilities.css` | size, fps and length come from the project |
| Render server | `remotion/server/{index,bundle}.mjs` | one render at a time (a render needs 1-2 GB), queued; 15-minute limit; loopback-only |
| API route | `services/api/app/routers/render.py` | thin and stateless; probes the video's frame rate; copies the result to S3 |
| Download link | `services/api/app/s3.py` (`presigned_download`) | browsers ignore the `download` attribute on cross-origin links, so S3 itself sends `Content-Disposition: attachment` |
| Editor UI | `apps/web/src/components/layout/ExportButton.tsx`, `lib/export.ts` | progress bar, Download, Export again, Try again; the logic is a small, tested state machine |
| Drift guard | `remotion/scripts/check.mjs` | fails on a new unstyled class or drifted fonts |
| Docs | `remotion/README.md`, `services/api/README.md` | run instructions and the endpoint table |

**Rules to know:**
- It exports the **saved** project only. Style tweaks that exist only in the browser tab (glow layers, stretch, align sliders) are not saved, so they are not exported; the dialog says so.
- If the render server is not running, Export says exactly how to start it (`503 render_unavailable`).
- Measured render times on this laptop: 21-second 720p clip about 30 seconds; 17-second 1440p clip about 2 minutes.

**A real bug the export exposed (please read).** In the export, words ran together ("Hellogoodmorning"). The gap between words was `0.28em`, but `em` was resolved against a font
size nothing had set (the 16 px default), so the gap never grew with the frame while the words did. The editor had the same latent problem on large previews. I fixed it in the shared
`CaptionRenderer.tsx` (the row now takes the caption's base size). **This slightly changes how the editor preview looks**: on small previews the space between words grows from a
fixed 4.5 px to 28% of the text size. P3 should look at it.

---

## 5. How the parts fit together (mental model)

- **One project JSON** (`packages/shared`) is the source of truth. The agent never edits pixels; it returns validated patches.
- **Editor (`apps/web`)** draws captions from that JSON with `CaptionRenderer`, and owns the video player.
- **Voice path:** browser mic -> LiveKit (local dev server) -> voice worker (speech-to-text only) -> text back to the browser -> either handled locally (playback, undo) or sent to `POST /agent/voice-command`.
- **Export path:** described in 4.6. It reuses the editor's caption code rather than copying it.
- **What runs where:** API, LiveKit and the voice worker in Docker; the editor (Vite) and the render server natively on the host.

---

## 6. Who owns what, and what each owner should review

CLAUDE.md says to stop and tell the owner before touching another folder. The repo owner asked for these changes to be made on this branch and **flagged for review**;
this is that flag.

| Owner | Files changed | Please review |
|---|---|---|
| **P3** (`apps/web`) | `App.tsx`, `AgentCommandBar.tsx`, `AppHeader.tsx`, `VideoStage.tsx`, `CaptionRenderer.tsx`, `useAgentCommand.ts`, `api.ts`, `voice-intents.ts`, `playback-context.tsx`, `preset-override-context.tsx`, `scripts/check-agent-apply.ts`; new `ExportButton.tsx`, `lib/export.ts`, `lib/media-key.ts`, `lib/resolve-preset.ts` | **`CaptionRenderer.tsx`** (the word-spacing change, section 4.6) and `preset-override-context.tsx` (the merge moved to `resolve-preset.ts`) first |
| **P2** (`remotion/`) | new `package.json`, `src/`, `server/`, `scripts/`; `README.md` | the whole folder; this is now the export engine |
| **P1** (`services/api`, compose) | `routers/render.py`, `s3.py`, `tests/test_render.py`, `tests/test_seams_and_cost_routes.py`, `README.md`; `docker-compose.yml` (`extra_hosts`), `.env.example` | `render.py` and the S3 helper; the old "501 stub" test was replaced |
| **P4** (`services/voice-agent`) | `stt_provider.py`, `requirements.txt`, `.env.example`, `tests/test_stt_provider.py` | mine; done |
| **Lead** | none (no `packages/shared` or schema change) | the **Remotion license** decision (section 9) |

Also changed: root `package-lock.json` (Remotion dependencies) and workspace name `@captions/remotion` (a workspace named just `remotion` would collide with the npm package).

---

## 7. How to test it

| What | Command | Last result |
|---|---|---|
| API tests (whole suite) | `docker compose exec -T api python -m pytest tests/ -p no:warnings -q` | **127 passed** (95 before + 32 new for export) |
| Agent test modules | `docker compose exec -T api python -m app.agent.tests.<test_planner \| test_router \| test_contracts \| test_word_tools \| test_voice \| test_livekit_token \| test_context_tools \| test_tool_registry>` | all pass |
| Agent against real Bedrock | `docker compose exec -T api python scripts/agent_demo.py --grade easy` | 4/4 (costs a few AI calls) |
| Voice worker | `docker compose exec -T voice-agent python tests/test_stt_provider.py` | pass |
| Web typecheck / build | `cd apps/web && npx tsc -b` and `npm run build` | clean |
| Web headless checks | see the note below | **135 checks, 0 failures** |
| Web caption checks | `cd apps/web && npm run check:captions` | pass |
| Export drift guard | `npm run check -w @captions/remotion` | pass |
| One frame of a real project | `cd remotion && npm run still -- <projectId> <timeMs>` | writes a PNG to `remotion/out/` |
| AWS readiness (per capability) | a script outside the repo: `Downloads\expressive-captions-e2e\aws_check.py`, run with `docker compose exec -T api python - < aws_check.py` | on the old account: S3, DynamoDB, Bedrock, Transcribe-batch OK; Rekognition and Polly denied |

> **Windows note for `check:agent`:** the npm script sets an environment variable with POSIX syntax and fails under `cmd.exe`. Run it from Git Bash:
> `cd apps/web && JITI_ALIAS='{"@":"'"$(pwd -W | tr '\\' '/')"'/src"}' npx jiti scripts/check-agent-apply.ts`
> A harmless `tr: warning` may print; the result is the same. (The underlying problem is a small bug in `apps/web/package.json` for P3 to fix.)

**Browser tests (real Chrome, real stack).** I drove the real editor with scripts (Puppeteer). They are **not in the repo**; they live on Aman's machine in
`C:\Users\amanr\Downloads\expressive-captions-e2e\` (`phase-18\` for the player/voice tests, `phase-19\` for export). `README.txt` there explains them. They need
`npm i puppeteer-core`, Chrome, and the stack running. It would be worth adding them to the repo (P3): several of the bugs above were only findable this way.
Tests that never triggered their condition are reported as **INCONCLUSIVE and count as failures**; that rule came from a mistake I made (a "pass" where no edit had actually happened).

Each area also has a detailed audit under `.claude/audits/ai-agent/`: `phase-16` (local run), `phase-17` (voice + editor end to end), `phase-18` (voice/player fixes), `phase-19` (export).

---

## 8. What to do next (in order)

1. **P3** reviews the `apps/web` changes, starting with `CaptionRenderer.tsx` (section 4.6). Then they can be committed on the branch.
2. **P2 / P1** review `remotion/` and `render.py` respectively.
3. **Lead** decides the Remotion license question (section 9).
4. **Someone** with a real microphone tries the voice commands and reports what is misheard (my tests used a computer voice, not a person).
5. **Whoever demos** tries a 60-second clip and an odd-sized video for export (not yet tried).
6. When divue's AWS keys arrive: update `.env` as described in section 3, then rerun the AWS check.
7. Decide about the `DESIGN.md`/`design.md` duplicate in git.

---

## 9. Open problems, risks and decisions

| Item | Detail | Who |
|---|---|---|
| **Remotion license** | Free for individuals and companies of up to 3 people; a team of 4 or more needs a paid company license (<https://www.remotion.dev/license>). CLAUDE.md chose Remotion; decide before any real launch. | Lead |
| **AWS Transcribe streaming, Polly and Rekognition are denied** for the shared identity | Sarvam covers live voice. Rekognition denial means "put captions where my hand is" (vision) cannot work; Polly denial only affects a test script. Grant the permissions if AWS is preferred. | Lead / whoever owns IAM |
| **AWS account migration** | New keys and resource names pending (section 3). | divue / lead |
| **Demo clips missing** | `services/api/scripts/stt_bakeoff/clips/*` is git-ignored and empty on this machine, so `/demo-media/Normal.mp4` returns 404 and `?demo=1` shows captions with no video. Presumably Shubh has the files; ask. | Shubh |
| **"Pause" recognition** | See 4.2. Recommend teaching "stop the video". A higher audio bitrate might help; the experiment crashed and was not repeated. | P4 / P3 |
| **Hinglish** | Untested. Set `VOICE_STT_LANGUAGE=hi-IN`; test with real Hinglish audio (the Windows test voices are English only). | P4 |
| **Echo** | Whether the video's narration leaks into the mic after the ducking change is unmeasured. | P3 / P4 |
| **Export limits** | Untested: odd-sized sources, 60 s clips, Linux/macOS, offline fonts, emoji glyphs. Not built: cancel button, cloud (Lambda) rendering, SRT export, running the render server in Docker. | P2 |
| **Security** | (a) The render server has no authentication; it listens on loopback only by default (`RENDER_HOST=0.0.0.0` would expose it). (b) LiveKit Cloud credentials and the Sarvam key were printed into an AI chat transcript during this work: **rotate them** if that transcript is shared. (c) `/agent/livekit-token` still has no auth (pre-existing). | Lead / P1 |
| **Test data** | 11 projects and 2 exported videos (55 MB) under `p4/` on S3; two small renders in `remotion/out/renders/`. Nothing was deleted. | whoever wants to tidy |

---

## 10. Gotchas we hit (so you don't)

- **A `<video>` from S3 is silent inside Web Audio.** Reading its sound through an audio analyser returns zeros even for loud files, because cross-origin video without CORS
  headers is muted inside that graph. Don't use it to check loudness; use `ffmpeg -af volumedetect` on the file.
- **Signed S3 links change on every fetch** but point at the same file. Compare the *file* (`mediaKey`), not the whole URL.
- **Two links minted in the same second are identical.** Recovery code that "sets the new link" then does nothing; call `video.load()`.
- **`em` needs a font size.** A gap written in `em` on an element nothing sizes is 16 px, forever.
- **The render server's `/health` can't answer while it bundles** (webpack blocks the event loop for ~20-40 s on start).
- **Git Bash rewrites paths** like `/tmp/x` and `branch:path`; set `MSYS_NO_PATHCONV=1` for Docker/git commands that contain them.
- **LiveKit only dispatches the voice worker when a room is created.** Reusing one room name in quick succession (as the e2e script does) yields "no agent dispatched".
- **`check:agent` fails under `cmd.exe`** (see the Windows note in section 7).
- **`docker compose` picks up `.env` changes only when the container is recreated** (`docker compose up -d`); the Vite dev server needs a restart for `VITE_*` changes.

---

## 11. Numbers at a glance

- API: **127** tests pass. Web headless: **135** checks pass. Worker: 12 checks. Agent: 8 modules pass; live Bedrock 4/4 easy prompts.
- Player before/after (real Chrome): layout 12/12 combinations fit; expired-link recovery 10/10; resync no longer restarts playback.
- Voice: in a 10-command spoken sequence, 9 of 10 were obeyed at first (the miss was "pause"); a later full run obeyed all 10, but "pause" is still inconsistent (5 of 6 caught in a dedicated test). Zero agent calls for playback; about 1 s from end of speech to action.
- Export: 21 s 720p clip about 30 s; 17.8 s 1440p clip about 2 min; output matches the source's size, frame rate, duration (within 6 ms) and loudness.
- Size of this change: 23 modified files and 15 new source/test files (counted with `git status`), plus 4 audits and this report. The lockfile diff is large (Remotion's dependencies) and can be ignored in review.
