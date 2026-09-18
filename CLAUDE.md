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
- Follow the repo-local rules in `.claude/rules.md`.
- Read `packages/shared/src/project.ts` before writing code that touches project data.
- Build and test against `packages/shared/fixtures/demo-project.json` first, real data second.
- `services/api/app/schema.py` mirrors `project.ts`. They change together, in the same PR, by the lead.
- Presets are the base look. Emphasis and emotion are per-word layers on top of any preset.
- Times are integers in milliseconds. Positions (`x`, `y`) are percentages 0–100 of the frame.
- Agent tool calls are validated against the schema before being applied. The video transcript is
  passed to the LLM as data (wrapped in tags), never as instructions.
- Keep tasks small (1–2h), plan first, commit when something works.
- Keep every source file under 800 lines; split reusable logic into focused modules before a file grows too large.
- Maintain docs with every feature change, especially route behavior, commands, env vars, and known limitations.
- No auth, no Step Functions, no object tracking, no general video editing (cut from MVP scope).

## Stack
- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui, hosted on Amplify
- Preview/export: Remotion (`@remotion/player`, Remotion Lambda; fallback `@remotion/renderer`)
- Backend: Python 3.12 FastAPI container on App Runner
- LLM/agent: Amazon Bedrock Converse API with tool use (Claude)
- Speech-to-text: decided Day 1 (AWS Transcribe hi-IN + Roman-script conversion vs alternatives)
- Vision: ffmpeg frame grab → Rekognition DetectLabels (fallback: Claude vision on Bedrock)
- Audio analysis: librosa + ffmpeg
- Storage: S3 (media), DynamoDB (project JSON)

## Branches
`p1-pipeline`, `p2-renderer`, `p3-editor`, `p4-agent`. Lead merges to `main` at 1pm and 9pm.
