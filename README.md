# Expressive Captions

Captions that hear how you said it.

Most auto-captions treat a reel as a stream of equally important words. You shout one word, drag
out another, drop your voice on the next, and the captions come out flat anyway. Expressive
Captions listens for that. It transcribes Hinglish, works out which words were stressed, stretched
or angry, and draws them that way. Then you fix whatever you don't like by talking to it.

Built for the AWS First Commit hackathon, Ship It track.

**Try it:** [the editor](https://4ofryng45bbr7en765off7otja0yuamo.lambda-url.ap-south-1.on.aws)
· [API health](https://pra22j2hgp.ap-south-1.awsapprunner.com/health) · region `ap-south-1`.
There is no login yet, so please be kind to it. Chrome or Edge; the microphone needs HTTPS, which
the address above has.

## What it does

**Captions with delivery in them.** Upload a reel of up to 90 seconds. The pipeline transcribes the
Hindi with word timings, turns each word into Roman Hinglish, and measures loudness, pitch and
duration per word. A clip of about 23 seconds is ready in roughly 40. Words come out tagged as
emphasised, stretched, neutral, excited or angry, and the caption style follows: bigger, longer,
shaking. Seven presets set the base look (`rangmanch`, `chamak`, `nazm`, `dhamaka`, `mrbeast`,
`minimal`, `hinglish-bold`), and any stretch of the video can use a different one.

**Editing by talking.** Type in the bar, or click the mic and say *"make that line angry"*, *"the
word bahut in blue"*, *"minimal preset from two to four seconds"*. The agent can also look at the
video, so *"put the captions where my hand is"* and stickers that sit on a face both work. Every
agent turn is one undo.

**Your own media on top.** Two tracks of images and clips over the video: move, scale, rotate,
trim, split, delete. The main video is never cut or re-timed. That is a deliberate line, not a
missing feature.

**Export that matches the preview.** The MP4 is drawn by Remotion using the same caption code the
editor previews with, so what you see is what you download. A 23-second clip takes about three
minutes.

## How it fits together

One idea holds the project up: **everything reads and writes a single `Project` JSON**. Words with
their timings and tone, the preset, the layers. The editor edits it, the pipeline produces it, the
renderer draws it.

That has two consequences worth knowing. The agent never edits pixels. It returns small patches to
the JSON, every one validated against the schema before it is applied, and the transcript reaches
the model as data in tags, never as instructions. And preview equals export, because both are
just this JSON run through the same React code.

![System diagram](docs/images/architecture-system.png)

The browser talks to two public things, the editor files and the API. Big uploads and downloads go
straight to S3 on signed links. The renderer and the voice worker sit in a private network and only
ever call out. [`docs/architecture.md`](docs/architecture.md) has the three flows drawn step by step
(upload, voice edit, export).

## Run it on your machine

You need Docker, Node 24 (`nvm use` reads `.nvmrc`), and AWS credentials in `~/.aws`. You do not
need a LiveKit account: compose runs a local dev server.

```bash
cp .env.example .env            # set DEV_PREFIX to your slot: p1, p2, p3 or p4
docker compose up -d --build    # API, LiveKit, voice worker
curl localhost:8010/health      # {"ok":true}

nvm use && npm install
cd apps/web && npm run dev
```

Open <http://localhost:5173/editor?demo=1>. It loads a bundled 28-second project with real video
and captions, so you can try everything without uploading or running the pipeline.

Export is opt-in, because its image carries a headless Chrome and takes a few minutes to build the
first time: `docker compose --profile export up -d --build`.

[`docs/getting-started.md`](docs/getting-started.md) covers the AWS access each part needs, the
full check list, and a table of what to look at when something breaks.

## Where things live

| Path | What is in it |
| --- | --- |
| `apps/web` | The editor: React, TypeScript, Vite, Tailwind, shadcn/ui |
| `services/api` | FastAPI backend: the pipeline, storage, the render route |
| `services/api/app/agent` | The agent: Bedrock tool loop and the tools it can call |
| `services/voice-agent` | LiveKit worker that turns speech into text |
| `remotion` | Caption composition, presets, and the render server for export |
| `packages/shared` | The `Project` schema (`project.ts`) and sample projects |
| `infra/aws` | Terraform for the AWS stack |
| `.claude` | The engineering log: one audit per phase, and an index of them |

`services/api/app/schema.py` mirrors `packages/shared/src/project.ts`. They change together or not
at all.

## Docs

| Read this | When |
| --- | --- |
| [Getting started](docs/getting-started.md) | Setting up, checking it works, finding your way around |
| [Architecture](docs/architecture.md) | You want the picture: components, flows, why it is shaped this way |
| [Deployment](docs/deployment.md) | How it runs on AWS, the choices behind it, cost, and honest limits |
| [AWS services](docs/aws-services.md) | Which service does what, and where it appears in the repo |
| [The AI agent](docs/ai-agent.md) | How a sentence becomes validated edits: planner, tools, voice |
| [Media layers](docs/media-layers.md) | The overlay model and how the editor and agent treat it |
| [Exporting and its deployment](docs/export-deployment.md) | The renderer, its licence, and where it can run |
| [Landing page design](docs/design/landing-design.md) | The design notes behind the marketing page |
| [`.claude/INDEX.md`](.claude/INDEX.md) | The audit log: what was built in each phase, and what was only checked |
| [`CLAUDE.md`](CLAUDE.md) | The working rules for this repo, including who owns which folder |

## Checks

```bash
docker compose exec api python -m pytest tests/ -q -p no:warnings        # API
cd apps/web && npx tsc -b && npm run check:agent && npm run check:captions && npm run check:layers
```

The agent has its own test scripts under `services/api/app/agent/tests/`. The full list, and the
one that speaks a real phrase into a real LiveKit room, is in
[getting started](docs/getting-started.md#2-check-it-actually-works).

## Rough edges

We would rather you hear these from us.

- The API has no authentication. Anyone who can reach it can use it.
- Export renders one video at a time. The caption pipeline runs inside the API process, so a
  restart during a job loses that job.
- Voice needs a speech-to-text provider your AWS identity may use. If Transcribe streaming is
  denied, set `VOICE_STT_PROVIDER=sarvam` and `SARVAM_API_KEY`; the story is in
  [`.claude/audits/ai-agent/phase-17-e2e-voice-and-editor.md`](.claude/audits/ai-agent/phase-17-e2e-voice-and-editor.md).
- Voice has been tested with synthesised speech and typed commands, not much with real mics and
  real accents.
- Bedrock and Transcribe run on borrowed credentials on the deployed stack until the owning
  account is unblocked.

The longer list, with what is verified and what is only mocked, is in
[Deployment](docs/deployment.md#11-honest-limitations).
