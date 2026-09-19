# Expressive Captions

Captions that hear your tone: Hinglish auto-captions with emphasis, stretched words and
angry shake, editable by voice.

- Plan doc (scope board, architecture, timeline): https://claude.ai/code/artifact/1785b18d-f0aa-4950-ac60-386cd3dd5d8f
- Rules for Claude Code sessions: `CLAUDE.md`
- Data contract: `packages/shared/src/project.ts` (TS) and `services/api/app/schema.py` (Python mirror)
- Sample data: `packages/shared/fixtures/demo-project.json`

## Run it locally (10 minutes)

You need Docker, Node (`.nvmrc` → 24, use `nvm use`) and your own AWS credentials for the
shared dev account. Bedrock, Rekognition, Transcribe, S3 and DynamoDB are all reached with
those credentials.

```bash
# 1. AWS credentials — the API container mounts ~/.aws read-only
aws configure          # or: aws configure --profile default
aws sts get-caller-identity   # must succeed before anything below will work

# 2. Config
cp .env.example .env
#    then edit .env and set DEV_PREFIX to YOUR OWN slot (p1 | p2 | p3 | p4) so you do not
#    write over anyone else's S3 keys and DynamoDB rows. Everything else already has a
#    working default, including the LiveKit dev credentials.

# 3. Backend: API + LiveKit dev server + the voice worker
docker compose up -d --build
curl localhost:8010/health            # {"ok": true}

# 4. Frontend
nvm use && npm install
cd apps/web && npm run dev
```

Open **http://localhost:5173/editor?demo=1** — that loads the bundled 28-second demo project
with a real video, which is what the agent demo is built around.

### Check it actually works

```bash
# the agent, end to end against real Bedrock — 16 graded commands
docker compose exec api python scripts/agent_demo.py --list     # no API calls
docker compose exec api python scripts/agent_demo.py --grade easy

# voice, end to end: speaks a phrase into a real LiveKit room and asserts a transcript
# (two commands — see services/voice-agent/scripts/check_voice_e2e.py's docstring)
```

### If something is wrong

| Symptom | Cause |
|---|---|
| API exits on boot with `missing required environment variables` | `.env` is missing one of `AWS_REGION`, `S3_BUCKET`, `DYNAMO_TABLE`, `DEV_PREFIX`, `BEDROCK_MODEL_ID` |
| Agent answers `status="error"` about the model | `BEDROCK_MODEL_ID` is unset, or your account cannot reach that inference profile in `ap-south-1` |
| Mic does nothing, log says browser speech recognition | LiveKit is not reachable; the editor falls back on purpose. Check `docker compose ps` for `livekit` and `voice-agent` |
| `POST /agent/livekit-token` → 503 | `LIVEKIT_*` unset in `.env` — copy them from `.env.example` |
| Editor loads but the video is blank | The API is not on `localhost:8010`, so `/demo-media/Normal.mp4` never resolves. Check `VITE_API_URL` and `API_PORT` |
| Port 8000 already taken | `API_PORT` is already 8010 in `.env.example`; change it if that clashes too |


## Layout
```
packages/shared/   schema + fixture            (lead)
services/api/      FastAPI pipeline + deploy   (P1)
services/api/app/agent/  voice agent           (P4)
remotion/          captions, presets, export   (P2)
apps/web/          React editor                (P3)
```

## Run locally
```bash
nvm use                      # Node from .nvmrc
cp .env.example .env         # fill in your own AWS keys
docker compose up --build    # API on http://localhost:8000/health (hot reload)
cd apps/web && npm run dev   # editor on http://localhost:5173 (once P3 scaffolds it)
```
