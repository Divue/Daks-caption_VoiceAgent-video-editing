# Expressive Captions

Captions that hear your tone: Hinglish auto-captions with emphasis, stretched words and
angry shake, editable by voice.

- Plan doc (scope board, architecture, timeline): https://claude.ai/code/artifact/1785b18d-f0aa-4950-ac60-386cd3dd5d8f
- Rules for Claude Code sessions: `CLAUDE.md`
- Data contract: `packages/shared/src/project.ts` (TS) and `services/api/app/schema.py` (Python mirror)
- Sample data: `packages/shared/fixtures/demo-project.json`

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
