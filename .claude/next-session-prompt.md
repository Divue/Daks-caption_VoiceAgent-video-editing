> **STALE — do not paste this into a session (2026-09-19).** The work it asks for — the frontend
> editor shell and captions workflow — has shipped, and has been built on heavily since. Pasting it
> would ask Claude to rebuild existing code. Kept only as history. For where things stand now, start
> from `ONBOARDING.md` at the repo root.

# Next session prompt — build the frontend editor shell + captions workflow (P3)

Paste the block below into a fresh Claude Code session.

> Supersedes the previous contents of this file (P1's *build the API* prompt, consumed on
> 2026-09-18 — that work shipped; see `.claude/audits/12-api-persistence-layer.md`).
> The approved plan, `.claude/plans/frontend-editor-captions.md`, is the source of truth.

---

Implement the frontend editor shell + captions workflow for Expressive Captions
(`apps/web`, P3's folder). The plan is written, audited and approved. Build it.

## Read first, in this order

1. Root `CLAUDE.md` — rules, ownership, stack, branches.
2. `.claude/INDEX.md` — critical invariants (especially: no fake backend/AI behaviour;
   `project-reducer.ts` is the only mutation site; `PRESETS` is the only preset source;
   stretch never goes in `Word.text`).
3. **`.claude/plans/frontend-editor-captions.md` — the plan. Read all of it.**
   §0 corrects the facts an earlier brief got wrong. §0.1 and §3.1 are day-one blockers.
   §9b is the plan's own audit; findings A1 and A2 are the ones that will bite first.
4. `packages/shared/src/project.ts` and `presets.ts` — the data contract.
5. `.claude/audits/00-current-frontend-architecture.md` for orientation, then `02`
   (reducer contract) and `09` (current editor layout). Skim `04`–`08` only when you
   touch those components.

Do **not** read `services/api/app/**` — `services/api/README.md` §Endpoints plus the
plan's §4.2 table is the whole API surface you need, and both were verified against the
running API.

## Two things may block you on day one — check both before writing code

- **Plan §0.1:** `packages/shared/fixtures/demo-project.json` is missing `extraMs` in
  every `signals` object, which `Signals` requires, so `Project.parse()` throws and
  `/editor` cannot mount. The lead owns the fix. Verify it has landed; if not, ask —
  do not work around it, and do not edit `packages/shared` yourself.
- **Plan §3.1:** `packages/shared/src/blocks.ts` (`deriveBlocks`) is the lead's to land
  and Task 3 needs it. If it is missing, ask rather than writing a local copy — a copy
  that diverges from P2's is the exact failure that module exists to prevent.

If both are still outstanding, Tasks 0–2 (API client, real video playing on screen) need
neither — start there rather than waiting.

## Before you write code

- `npm install` at the repo root (`node_modules` is absent; `npm run dev` fails without it).
- `docker compose up --build`; `API_PORT=8010` is the repo default, so
  `curl localhost:8010/health` → `{"ok":true}`.
- Add `envDir: '../..'` to `apps/web/vite.config.ts`. Without it Vite never reads the
  repo-root `.env` and `import.meta.env.VITE_API_URL` is `undefined` (plan §0). Prove it
  with a `console.log` before trusting any fetch.
- `git checkout -b p3-editor` off **`p1-pipeline`** — `master` has no API and no audit 12.

## Scope

Whole editor shell, but **only the captions workflow is implemented**: drop a video →
`POST /projects` → presigned S3 upload → `POST /process` → poll `/status` showing the
real 7-stage map → `GET /projects/{id}` → captions on the timeline and over the playing
video → select a word → `PATCH /words/{id}`. Everything else (trim, split, transitions,
effects, stickers, music) is present with real labels and correct icons and is **visibly
inert**. No mock data, no fake progress, no simulated agent replies.

Stay inside `apps/web`. Never touch `packages/shared/`, `services/api/`, `remotion/` or
`app/agent/`. If a task seems to need a schema change, stop and ask — plan §10 lists the
changes already proposed to the lead; propose, never apply.

## How to work

Follow the plan's §6 build order. It is nine tasks, 12–18 h total, each ending somewhere
committable; commit after each. Tasks 2 and 3 put a real video and real captions on
screen early — do those before the shell.

The plan's §9 is your verification list. The headline check: upload
`services/api/scripts/stt_bakeoff/clips/Angry.mp4` and expect **15.9 s, 478×850, 46
words, 6 emphasised (13.0%), all 46 `angry`, ~18–22 s end to end**. Disagreement means
something is wrong. Run `npm run lint && npm run build` before each commit.

Two invariants that are easy to break and expensive to debug: **never reconstruct
`Word.text` from repeated letters** — repeats are drawn from `signals.extraMs`, and
collapsing them turns `know` into `now` (plan §8.6). And **`timeMs` never enters
`project-reducer`** — it would run a full-project Zod validation 60×/s (plan §3.2).

When you are done, write `.claude/audits/13-frontend-editor-captions.md` in the style of
audit 12: label every claim measured or assumed, record deviations from the plan and why,
and list what is weak or unfinished.
