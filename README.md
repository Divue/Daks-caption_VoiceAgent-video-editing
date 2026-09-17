# Expressive Captions

Captions that hear your tone: Hinglish auto-captions with emphasis, stretched words and
angry shake, editable by voice.

- Plan doc (scope board, architecture, timeline): https://claude.ai/code/artifact/1785b18d-f0aa-4950-ac60-386cd3dd5d8f
- Rules for Claude Code sessions: `CLAUDE.md`
- Data contract: `packages/shared/src/project.ts` (TS) and `services/api/app/schema.py` (Python mirror)
- Sample data: `packages/shared/fixtures/demo-project.json`
- Deploy / live URL: `docs/deploy.md`

## Layout
```
packages/shared/   schema + fixture            (lead)
services/api/      FastAPI pipeline + deploy   (P1)
services/api/app/agent/  voice agent           (P4)
remotion/          captions, presets, export   (P2)
apps/web/          React editor                (P3)
```
