# Next session prompt — API + database layer

Paste the block below into a fresh Claude Code session. **Planning only — no
implementation in that session.**

---

We're building the backend for Expressive Captions (AWS First Commit hackathon,
Ship It track). The transcription/prosody pipeline is designed and validated; your
job is the **API surface and the database layer** that wrap it.

**PLAN FIRST. Do not write implementation code this session.** Use plan mode,
ask me about anything genuinely ambiguous, and end with a plan I approve. I want
to review the data model and endpoint list before a line is written.

## Read first, in this order
1. Root `CLAUDE.md` — rules, ownership, stack, branches.
2. `.claude/INDEX.md` — audit index and invariants.
3. `.claude/audits/11-stt-prosody-pipeline.md` — **the important one.** The pipeline
   this API wraps: its 8 stages, measured results, the proposed schema change (§6),
   a first-draft API surface (§7), cost/latency (§8), and open decisions (§10).
4. `packages/shared/src/project.ts` — the data contract. `services/api/app/schema.py`
   mirrors it.
5. `services/api/app/pipeline/` — **the pipeline we're shipping** (`run.py`, `align.py`,
   `prosody.py`, `tag.py`). This is what the API orchestrates. Do not rewrite it.
   `services/api/scripts/stt_bakeoff/caption_eval/` is its *test harness*, not a rival
   implementation — see the box at the top of audit 11.

Audit 11 §7 is a **first draft I wrote without building anything**. Treat it as a
starting point to improve or argue with, not a spec.

## What to plan

### 1. Database — Postgres
- **Postgres, not Mongo.** Pick whatever makes schema migrations easiest and least
  ceremonial; recommend one stack (ORM + migration tool) and justify it briefly.
- The repo currently documents **DynamoDB** for project JSON (`CLAUDE.md:46`).
  Moving to Postgres is a documented-stack change — flag it for me explicitly,
  say what it costs to switch, and propose the CLAUDE.md edit. Don't just do it.
- Decide where it runs (RDS? Aurora Serverless v2? something else) and what that
  costs to stand up for a 3-day hackathon. We're on AWS ap-south-1 with credits,
  and using AWS meaningfully is a judging criterion.
- Key question to answer: does the `Project` JSON live as a JSONB blob, or as
  normalised `projects` / `lines` / `words` tables? Argue both; the editor does
  per-word PATCHes and the agent applies validated JSON patches, so think about
  what each shape costs.

### 2. API surface
- Async job flow — the pipeline takes 20–45s per clip.
- Cover: create project + upload, poll per-stage status, fetch project, per-word
  edits, the agent endpoint (P4's seam), and export via Remotion Lambda.
- The editor is at `apps/web` (currently Vite + React, **not** Next.js — confirm
  with me whether that's changing before you design around it).
- Video should go **straight to S3** via presigned URL, never through FastAPI.

### 3. Model cost logging — required
Every external model/service call must be logged so we can see what a video cost:
- Which service (Bedrock / Transcribe / Sarvam), which model id, input+output
  tokens or audio seconds, computed USD, latency, and which project + pipeline
  stage it belongs to.
- Queryable per project and in aggregate ("what have we spent today", "what does
  a 30s clip cost us").
- Audit 11 §8 has the measured per-stage numbers to calibrate against
  (~$0.05 per 30s video; Bedrock ~$0.038 of it).
- Note: **Bedrock cost is not a constraint** on model choice — this logging is for
  visibility, not for throttling or downgrading models.

## Environment — fix this as part of the plan
- `SARVAM_API_KEY` is read by `services/api/app/pipeline/run.py:26`,
  `scripts/stt_bakeoff/engines.py:192` and both `caption_eval` scripts, but is set
  **nowhere** — not in `.env`, not in `.env.example`. Anyone cloning the repo hits
  a `KeyError`. Add it to both, and plan how the container receives it.
- `.env.example` says `AWS_REGION=us-east-1`; everything we actually run is
  `ap-south-1`. Fix.
- `.env.example` lists `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, but the real
  `.env` says credentials come from `~/.aws`. Pick one story and make both files
  agree.
- Plan how secrets reach App Runner in deployment (Secrets Manager? SSM Parameter
  Store?) rather than shipping a `.env`.

## Constraints
- Ownership: `services/api` is P1's. Schema changes (`packages/shared/src/project.ts`
  + `services/api/app/schema.py`) need lead agreement — propose, don't apply.
- Python 3.12, FastAPI, container on App Runner. API deps live in
  `services/api/requirements.txt` (that image ships to production — do **not** add
  torch, whisper, or anything the pipeline doesn't need; only librosa + soundfile
  beyond current deps).
- 3-day MVP, team of 4. Reliable beats clever.
- No auth, no Step Functions (cut from MVP scope per CLAUDE.md).

## Deliverable
A plan I can approve: the data model, the migration story, the endpoint list with
request/response shapes, the cost-logging design, the env/secrets fix, and anything
in audit 11 §10 you think we should settle before building.
