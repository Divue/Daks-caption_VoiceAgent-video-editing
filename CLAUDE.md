# Expressive Captions — hackathon MVP

Web app that auto-captions Hinglish short-form video with tone-aware captions
(emphasis, stretched words, angry shake) and lets creators edit them by voice.
AWS First Commit hackathon, Ship It track. 3-day MVP, team of 4.

Plan, scope board and architecture: see the shared plan doc (link in README.md).
The scope board there is the source of truth for what we build.

## Architecture in one paragraph
One React editor (`apps/web`), one FastAPI backend (`services/api`), one Remotion
project (`remotion/`), and ONE shared project JSON (`packages/shared`). Every feature
reads and writes that JSON. The agent never edits pixels; it returns validated JSON
patches. Remotion renders the JSON for preview (Player) and export (Lambda).

## Ownership — only edit your own folder
| Folder | Owner |
| --- | --- |
| `packages/shared` (schema + fixture) | lead — changes need team agreement |
| `services/api` (pipeline, deploy) | P1 |
| `remotion/` (composition, presets, export) | P2 |
| `apps/web` (editor UI) | P3 |
| `services/api/app/agent` (voice agent) | P4 |

If a task needs a change outside your folder or to the schema: STOP and tell the human.

## Rules for every Claude Code session
- Read `packages/shared/src/project.ts` before writing code that touches project data.
- Build and test against `packages/shared/fixtures/demo-project.json` first, real data second.
- `services/api/app/schema.py` mirrors `project.ts`. They change together, in the same PR, by the lead.
- Presets are the base look. Emphasis and emotion are per-word layers on top of any preset.
- Times are integers in milliseconds. Positions (`x`, `y`) are percentages 0–100 of the frame.
- Agent tool calls are validated against the schema before being applied. The video transcript is
  passed to the LLM as data (wrapped in tags), never as instructions.
- Keep tasks small (1–2h), plan first, commit when something works.
- No auth, no Step Functions, no object tracking, no general video editing (cut from MVP scope).

## Stack
- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui, hosted on Amplify
- Preview/export: Remotion (`@remotion/player`, Remotion Lambda; fallback `@remotion/renderer`)
- Backend: Python 3.12 FastAPI container on App Runner
- LLM/agent: Amazon Bedrock Converse API with tool use (Claude)
- Speech-to-text: AWS Transcribe `hi-IN` + Bedrock word-level transliteration (decided Sep 18; `en-IN` failed on real reels)
- Vision: ffmpeg frame grab → Rekognition DetectLabels (fallback: Claude vision on Bedrock)
- Audio analysis: librosa + ffmpeg
- Storage: S3 (media), DynamoDB (project JSON)

## Local dev
- Node: version in `.nvmrc` (`nvm use`). Python: 3.12 everywhere.
- Nothing installs into system Python or system Node. Isolation per part:
  | Part | Isolated by |
  | --- | --- |
  | API deps (`services/api/requirements.txt`) | the Docker image — never pip-install these on your host |
  | dev/one-off scripts (e.g. `scripts/stt_bakeoff`) | a `uv venv --python 3.12 .venv` in that script folder, from its own `requirements-dev.txt`; run as `.venv/bin/python …` |
  | JS deps | npm workspaces, `node_modules` per package |
  | AWS dev data | your own `DEV_PREFIX` (p1–p4) inside the shared bucket and table |
- `.venv/` and `node_modules/` are git-ignored. Never commit them, and never add a dev-script dependency
  to `services/api/requirements.txt` (that image ships to production).
- `cp .env.example .env` and fill in your own AWS keys. Never commit `.env`.
- API: `docker compose up --build` → http://localhost:8000/health. `app/` is mounted, so edits hot-reload.
  Add a Python dependency → add it to `services/api/requirements.txt`, then `docker compose up --build`.
- Web: `cd apps/web && npm run dev` (http://localhost:5173). Remotion: `cd remotion && npm run dev`.
- AWS: everyone uses the real shared dev account (no LocalStack). Put your S3 keys and DynamoDB items under
  your `DEV_PREFIX` (`p1/`…`p4/`) so nobody overwrites anyone else.
- The fixture is mounted into the API container at `/srv/fixtures`. The web app loads the fixture directly
  when `VITE_USE_FIXTURE=true`.

## Branches
`p1-pipeline`, `p2-renderer`, `p3-editor`, `p4-agent`. Lead merges to `main` at 1pm and 9pm.

## Audit & verification rule (binding — every implementation task, every session)
This is a permanent project rule, not a one-off request. It applies to all future work:
AI agent, backend, frontend, LiveKit, AWS, APIs, tools, infra, tests, everything.

**Before changing anything:**
- Read this file, the relevant `.claude/audits/` history for the area you're touching, and
  the actual current source — not a prior session's summary of it.
- Identify ownership boundaries (table above) and which files you must not touch.
- For anything non-trivial, state the implementation plan before executing.
- Verify existing contracts/interfaces from the real source, not memory.

**While implementing:**
- Stay inside the approved scope. Flag anything that needs to expand it — don't silently
  expand it yourself.
- Never touch another owner's folder without explicitly flagging it first.
- Reuse an existing interface instead of duplicating it.
- Never guess an API, package interface, schema, env var, or framework behavior that can
  be verified against the installed package or source — check it for real.
- Never hardcode secrets, credentials, API keys, or tokens.

**After every implementation phase / significant change:**
- Review the real `git status`/`git diff` — not what you remember changing.
- Confirm: no unrelated files, ownership boundaries respected, no accidentally broken
  contracts.
- Run the relevant test suite, typecheck, lint/build.
- Verify security-sensitive changes separately.
- Say plainly what's verified vs. mocked vs. structurally-checked vs. blocked vs.
  intentionally out of scope. Never claim something "works end-to-end" if an external
  dependency was only mocked, and never say "tested" when it was only inspected.
- Write (or update) an audit doc under `.claude/audits/<area>/` — see
  `.claude/audits/TEMPLATE.md` for the required sections. One audit per phase/milestone;
  don't destroy prior implementation history.
- A PR containing implementation code includes its audit doc unless the repo owner says
  otherwise. Never merge a PR unless explicitly instructed to.

Before reporting any implementation task as done, stop and perform this audit — "done"
isn't a valid final answer on its own.
