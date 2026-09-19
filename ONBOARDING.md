# Onboarding — Expressive Captions

Hinglish short-form video, auto-captioned with tone (emphasis, stretched words, angry shake), and
edited by talking to an agent: *"make that line angry"*, *"put the captions where my hand is"*.

This page gets you from a fresh clone to a working editor, tells you what to read so a Claude
session starts with the right context, and lists what is still broken or undecided.

---

## 1. Run it locally

**You need:** Docker, Node 24 (`nvm use` reads `.nvmrc`), and AWS credentials for the shared dev
account in `~/.aws`. You do **not** need a LiveKit account.

```bash
# AWS — the API and the voice worker mount ~/.aws read-only
aws configure
aws sts get-caller-identity        # must succeed before anything below works

# Config
cp .env.example .env
#   Set DEV_PREFIX to YOUR slot: p1 | p2 | p3 | p4.
#   It namespaces your S3 keys and DynamoDB rows so you don't overwrite a teammate's.
#   Everything else already has a working default.

# Backend: API + LiveKit dev server + voice worker
docker compose up -d --build
curl localhost:8010/health         # {"ok":true}

# Export (optional, and slow the first time — the image carries a headless Chrome).
# Skip it unless you're working on Export; without it the Export button says how to start it.
docker compose --profile export up -d --build

# Frontend
nvm use && npm install
cd apps/web && npm run dev
```

Open **http://localhost:5173/editor?demo=1** — a bundled 28-second project with real video and 51
captioned words. It needs no upload and no pipeline run, so it is the fastest way to see everything.

### Which AWS access you need

| Service | Used by | Needed for |
|---|---|---|
| Bedrock | API | the agent, and the pipeline's tone tagging |
| Transcribe (batch) | API | the pipeline, on uploaded videos |
| Transcribe (**streaming**) | voice worker | turning speech into text |
| Rekognition | API | "put the captions where my hand is" |
| S3, DynamoDB | API | storing projects and media |
| Polly | test script only | `check_voice_e2e.py`, which synthesises speech |

If your account does not have Bedrock/Transcribe yet, see `FALLBACK_AWS_*` in `.env.example`: the
API can borrow another account's keys for those two services only. It does **not** cover the voice
worker or Rekognition, which always use your own `~/.aws`. Treat borrowed keys like any secret —
never commit them, never paste them in chat.

### Using it

- Type in the bar at the bottom, or click the mic and talk. The panel on the right opens on
  **Activity** on your first command and shows what you said, what the agent did (each tool it
  called), and the result. Every agent turn is **one** Ctrl+Z.
- **Stop the mic** with the stop square on the mic button, the **"Stop listening · Esc"** button,
  or **Esc**. You can also just say "that's all".
- Pausing mid-sentence is fine: the rest of the sentence continues the same instruction.
- The chips above the bar are tested commands. **All 11** shows the full set, easiest first.

---

## 2. Check it actually works

```bash
# The agent's own test suite (plain check() scripts, not pytest)
for t in test_contracts test_tool_registry test_context_tools test_mutation_tools test_word_tools \
         test_vision_tools test_bedrock_client test_tool_config test_planner test_voice test_router \
         test_livekit_token test_layer_tools; do
  docker compose exec -T api python -m app.agent.tests.$t | tail -1
done

# The API's pytest suite — expect 128 passed
docker compose exec api python -m pytest tests/ -q -p no:warnings

# The editor — expect "All checks passed." three times, then a clean build
cd apps/web && npx tsc -b && npm run check:agent && npm run check:captions && npm run check:layers && npm run build

# The agent against REAL Bedrock, graded easy → hard (costs real API calls)
docker compose exec api python scripts/agent_demo.py --list          # free, prints the catalogue
docker compose exec api python scripts/agent_demo.py --grade easy

# Voice, end to end: speaks a real phrase into a real LiveKit room and checks a transcript comes
# back. Everything is real except the mouth — AWS Polly renders the audio, so it needs Polly too.
docker compose exec -T api python -c "import boto3; open('/tmp/speech.pcm','wb').write(boto3.client('polly', region_name='ap-south-1').synthesize_speech(Text='make that line angry', OutputFormat='pcm', VoiceId='Kajal', Engine='neural', SampleRate='16000')['AudioStream'].read())"
docker compose cp api:/tmp/speech.pcm /tmp/speech.pcm
docker compose cp /tmp/speech.pcm voice-agent:/tmp/speech.pcm
docker compose exec -T voice-agent python scripts/check_voice_e2e.py
# expect: PASS: 5 interim segment(s), final transcript 'Make that line angry.'
```

### If something is wrong

| Symptom | Cause |
|---|---|
| API exits on boot: `missing required environment variables` | `.env` lacks one of `AWS_REGION`, `S3_BUCKET`, `DYNAMO_TABLE`, `DEV_PREFIX`, `BEDROCK_MODEL_ID` |
| Agent replies `status="error"` about the model | `BEDROCK_MODEL_ID` is unset, or your account can't reach it in `ap-south-1` (see `FALLBACK_AWS_*`) |
| Editor loads but the video is blank | the API isn't on `localhost:8010`, so `/demo-media/Normal.mp4` never loads — check `VITE_API_URL` and `API_PORT` |
| Mic connects but nothing you say appears | the voice worker can't reach streaming Transcribe — check `docker compose logs voice-agent` and that **your** `~/.aws` has Transcribe |
| Activity says "Listening (browser speech recognition)" | LiveKit isn't reachable, so the editor fell back on purpose — check `docker compose ps` for `livekit` and `voice-agent` |
| `POST /agent/livekit-token` → 503 | `LIVEKIT_*` missing from `.env` — copy them from `.env.example` |
| Port 8000 already in use | `API_PORT` is 8010 in `.env.example`; change it if that clashes too |
| Export says the render server isn't running | you didn't start it: `docker compose --profile export up -d`. **Don't** set `RENDER_HOST=0.0.0.0` — that endpoint has no auth |

---

## 3. Read these first

The rules in `CLAUDE.md` are binding for every Claude session, including the audit requirement.
Point Claude at the files below for the area you are working on, so it starts from what is true now
rather than rediscovering it.

**Everyone, in this order:**
1. `CLAUDE.md` — ownership (who owns which folder), stack, the rule to stop and ask before touching
   someone else's folder or the schema, and the **binding audit rule**: every implementation phase
   ends with an audit in `.claude/audits/`, written from `.claude/audits/TEMPLATE.md`.
2. `.claude/INDEX.md` — the **Critical invariants** (the things not to break) and the map of every
   audit with what it covers.
3. `packages/shared/src/project.ts` — the one data contract. Everything reads and writes a `Project`.

**Then by area:**

| Working on | Read |
|---|---|
| **The agent / voice editing** | `.claude/audits/talk-and-edit/phase-01` → `phase-06`, in order — they are the current state. Then `services/api/app/agent/planner.py` (the system prompt is the agent's behaviour) and `services/api/scripts/agent_demo.py` (what "working" means, as tested commands). |
| **Voice transport (LiveKit)** | `talk-and-edit/phase-02` (how it runs locally), `phase-06` (starting and stopping, and why it's a state machine), `services/voice-agent/README.md`, `.claude/audits/livekit/phase-01-voice-transport.md` |
| **Agent history (P4's build log)** | `.claude/audits/ai-agent/phase-01` → `phase-08`. Read `phase-05-vision.md`'s correction banner first — its original conclusion is out of date. |
| **The editor UI** | audits `00`, `09`, `15`, `16` (the design rules: orange has a budget, no fake features), `07` (undo), `13` (why every write goes through one queue) |
| **Pipeline / API** | audits `11` (speech-to-text + prosody), `12` (persistence and the write contract), and `services/api/README.md` (every endpoint) |
| **Media layers** (images/clips over the video) | `LAYERS.md` — the model, the workflow, the agent's tools — then `.claude/audits/layers/phase-01-media-layers.md`. The arithmetic lives only in `apps/web/src/lib/layers.ts` and `services/api/app/agent/tools/layer_tools.py`; change both together. |
| **Export / rendering** | `.claude/audits/export/phase-01-containerised-render.md`, then `remotion/README.md`. `DEPLOYING-EXPORT.md` for the licence and the AWS options. |
| **Deploying** | `DEPLOYING-EXPORT.md` first (App Runner is closed to new customers — that changes the API's target too), then section 4 below, `services/api/Dockerfile`, `services/voice-agent/README.md` |

**Don't trust these as current:**
- `.claude/next-session-prompt.md` — a consumed prompt. Pasting it rebuilds shipped work.
- `.claude/audits/17-agent-capability-surface.md` — read its banner; its tool list, write contract
  and persistence limits are out of date.
- `.claude/plans/*` — the plans as written before building. The audits say what actually got built.

---

## 4. Deploying — what exists and what doesn't

Nothing is deployed from this repo yet. The intended targets (`CLAUDE.md`) and their real state:

| Part | Target | State |
|---|---|---|
| API | ~~App Runner~~ → **undecided** | `services/api/Dockerfile` is production-ready. **AWS closed App Runner to new customers**, so the target written in `CLAUDE.md` may not be available to us — AWS points at ECS Express Mode. Lead decision; see `DEPLOYING-EXPORT.md` §2. |
| Editor | Amplify | `npm run build` works. **No `amplify.yml`.** |
| Voice worker | an always-on host | **Undecided (P1).** App Runner is not a fit — it's a long-running process that joins rooms, not an HTTP server. |
| LiveKit | LiveKit Cloud, or self-hosted | Locally it's `livekit-server --dev`. **Production needs real credentials.** |
| Export | Remotion Lambda, or the container | **Works locally.** `remotion/Dockerfile` is the deployable artifact; nothing is deployed. Licence costs us $0 today. See `DEPLOYING-EXPORT.md`. |

**Fix these before anything is reachable from the internet:**
1. `POST /agent/livekit-token` has **no auth** — anyone who can reach the API can mint a room token.
2. `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret` are **public** placeholders. Replace them.
3. `/demo-media/*` is mounted unconditionally. It fails closed in the production image (the clips
   aren't copied into it), but remove it or gate it by environment anyway.
4. Build the editor with **`VITE_USE_FIXTURE=false`**. With `true`, `/editor?demo=1` points at
   `/demo-media`, which doesn't exist in production, so the demo shows a blank video.
5. Add the Amplify domain to `CORS_ORIGINS`.
6. `FALLBACK_AWS_*` is a temporary shim. Remove it once the account has its own Bedrock/Transcribe.
7. `livekit-api` now ships in the production API image — P1 needs to sign that off.

---

## 5. Open issues — good places to start

| Issue | Where | Why it matters |
|---|---|---|
| **The timeline toolbar contradicts a written invariant.** `INDEX.md` says no editing toolbar; the app shows Split, Trim, Transitions, Effects, Music, Speed. All inert, all refused by the agent. | `components/toolbar/EditorToolbar.tsx`, timeline tracks | A judge who sees scissors will ask for a cut. Needs a lead decision: rewrite the invariant, or remove the toolbar. |
| ~~Saving isn't tested end to end.~~ **Closed.** Driven in a real browser against project `d8cb55cadb89`: "make the word god bright green" → one `PATCH /projects/{id}/words` → 200 → `style.color = "#00FF00"` on the server, version 2→3. The test edit was reverted. | `useWordPatch.applyAgentPatches` | Was the biggest unknown: edits could have been lost on reload and nobody would have known. |
| **Nobody has spoken to it.** Voice is proven with synthesised speech only. | voice path | Real mics, real accents, real pauses. |
| **Hinglish speech is untested.** The worker uses `VOICE_STT_LANGUAGE=en-IN`; `hi-IN` hasn't been tried. | `.env` | The product is for Hinglish creators. |
| **"Stop making things red" varies.** It usually turns off the tone layer and sometimes recolours words instead. Both remove the red; only the first is what the catalogue checks. | agent prompt | Mildly flaky demo prompt. |

---

## 6. How to work here

- **Stay in your folder** (ownership table in `CLAUDE.md`). If a change needs someone else's folder
  or the schema, say so before making it.
- **Every implementation phase ends with an audit** in `.claude/audits/<area>/`, from
  `TEMPLATE.md`: what's verified, what's mocked, what's not tested. Never write "works end to end"
  if an external service was mocked.
- **Prove it where it runs.** Several bugs here sat behind a green API suite and only showed up
  when the editor was driven in a real browser. If it has a UI, check the UI.
- **Never commit `.env`.** It's git-ignored; keep it that way.
- One branch per person; the lead merges to `main`.
