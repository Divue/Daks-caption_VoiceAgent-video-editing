# 12 — API + persistence layer (`services/api`, P1)

**Area:** `services/api/app/{config,s3,media,jobctx,pricing,costs}.py`, `app/store/`, `app/jobs/`,
`app/routers/`, `scripts/{setup_aws,seed_fixture,e2e_clip,eval_project}.py`, `tests/`, plus small
instrumentation edits in `app/pipeline/{run,stt,tag,prosody}.py`.
**Status:** built, tested (46 unit tests on moto) and run end-to-end on all 4 clips against the real
shared account (`ap-south-1`, `DEV_PREFIX=p1`). **Not deployed to App Runner. Not called by `apps/web`.**
**Branch:** `p1-pipeline` (from `master`). **Date:** 2026-09-18.
**Plan:** `.claude/plans/api-persistence-layer.md` — audited first, 8 deviations signed off (D1–D8 below).

Every claim is labelled **measured** (run in this session, real AWS unless it says moto) or **assumed**.
Every end-to-end number is **one run per clip** (n=1); Bedrock is not deterministic at `temperature=0`.

---

## 1. What was built

```
browser ──POST /projects──▶ API ──▶ Dynamo item (status awaiting_upload) + presigned POST
browser ──multipart POST──────────▶ S3 p1/projects/{id}/source.mp4          (200 MB cap in the policy)
browser ──POST /process──▶ API: head_object, claim job (runId), BackgroundTasks(run_job)
                                   run_job (threadpool): download → ffprobe → ≤60 s? → 16k wav → S3
                                   → app/pipeline/run.py (transcribe ∥ sarvam → align → prosody → tag → build)
                                   → Project.model_validate → one conditional write
browser ──GET /status (poll)──▶ job item (stages map, heartbeat, runId)
browser ──GET /projects/{id}──▶ Project, videoUrl rewritten to a presigned GET
```

One DynamoDB table `expressive-captions-dev` (on-demand), shared by p1–p4 through key prefixes:

| item | pk | sk | notes |
|---|---|---|---|
| project | `p1#PROJ#{id}` | `PROJECT` | `doc` = Project **JSON string**; `version`, `schemaVersion`, `status`, `s3Key`, `presetId`, `hasManualEdits` |
| job | `p1#PROJ#{id}` | `JOB` | `runId`, `state`, `stages` (JSON string), `startedEpoch`, `heartbeatEpoch`, `error` |
| cost | `p1#PROJ#{id}` | `COST#{ts}#{rnd}` | has `day = p1#YYYY-MM-DD` → only item type in the sparse `byDay` GSI |

Endpoints: see `services/api/README.md` (single source; not repeated here).

## 2. Measured end-to-end results (real AWS, n=1 per clip)

| clip | dur | words | process→done | transcribe | tag (Bedrock) | Bedrock $ | Transcribe $ | total $ | content-WER api / harness |
|---|---|---|---|---|---|---|---|---|---|
| Angry | 15.9 s | 46 | 24.3 s | 9.2 s | 6.6 s | 0.0062 | 0.0061 | **0.0124** | 0.116 / 0.116 |
| Excited | 14.6 s | 15 | 27.6 s | **18.4 s** | 1.5 s | 0.0008 | 0.0060 | 0.0068 | 0.308 / 0.308 |
| Real_reel | 23.5 s | 94 | 24.0 s | 11.3 s | 8.8 s | 0.0097 | 0.0094 | 0.0191 | 0.161 / 0.151 |
| Normal | 27.2 s | 51 | 22.9 s | — | — | 0.0063 | 0.0109 | 0.0172 | 0.286 / 0.286 |

- **Text quality matches the harness** (content-WER via the harness's own metric, `caption_eval/evidence/wer.py`,
  imported by `scripts/eval_project.py`). Sarvam aligned 46/46, 15/15, 94/94 words.
- **Timings vs harness `08_project.json`:** median start delta 0 ms on every clip. Words >100 ms apart:
  Angry 0, Excited 1 (max 1109 ms), Normal 3, **Real_reel 24 of 91** (max 479 ms). The harness uses its
  envelope snap; `app/pipeline` uses `prosody.repair_timings`. Which is closer to true onsets was **not measured** here.
- **Cost is ~2–4× below the brief's targets, and that is correct, not a no-op.** The brief's "$0.023 Bedrock /
  ~$0.05 total" for Angry came from the *harness*, whose single Bedrock call reconciles both transcripts
  (3,928 in / 725 out tokens, `06_bedrock.json`). `app/pipeline` calls Bedrock only for `_angry_words`
  (Angry: 415 in / 331 out). Sarvam is logged at $0 (unpriced).
- **Latency is 23–28 s, not 30–45 s,** for the same reason. Transcribe dominates and varies: 9.2–18.4 s for
  similar-length clips.
- `ffprobe` found Angry/Excited are **478×850** and Real_reel 720×1280. `build.py`'s default would have
  silently stored 1080×1920 (plan §13.3 was worse than stated).

### Other checks (measured)

| check | result |
|---|---|
| fixture round-trip (moto): `demo-project.json` → put → get → `Project.model_validate` | equal, floats bit-identical |
| PATCH with stale `version` (real AWS) | `409 {"error":"stale_version","currentVersion":2}`, value not overwritten |
| `POST /process` on an edited project | `409 has_manual_edits`; `?force=true` → 202, edits discarded (moto) |
| container killed mid-job (real, `docker compose kill` during `audio`) | `GET /status` → `failed`, "worker lost", **116 s** after the kill; re-`process` then succeeded in 22.9 s |
| two threads reporting stages concurrently (moto) | both updates survive |
| cost row attribution from `ThreadPoolExecutor` (moto) | only via `jobctx.submit`; a plain `pool.submit` loses the project — test pins this |
| presigned POST from host with `curl -F` (real) | 204; S3 CORS preflight from `Origin: http://localhost:5173` → 200 |
| clip > 60 s (moto) | rejected in the `audio` stage before any paid call |

## 3. Pipeline quality seen through the API (measured, n=1 — for `tag.py` tuning, not this layer)

- **Word-level anger (`tag._angry_words`) has poor precision and recall on this run.** Angry: 4 words tagged
  (`fed up What the`), none of the 4 annotated words (`fuckkk`, `shit`, `happening`, `hota`). Normal (calm):
  6 false positives (`pagal ho chuke hain bhai kaam`). Real_reel (no annotations): 4. Audit 11's "rant 8/10
  anger" was the **harness's line-level tone**, not this function. Audit 11's claim that `app/pipeline`'s anger
  reasoning is "sharper" is not supported by this run.
- **Stretch:** 4 plausible true positives (`guys`×2, `What`, `fuck`) vs 10 unannotated (`bhai`; Normal: `uh Aaj
  STT So log know hash`; Real_reel: `saal`×2). Consistent with audit 11 §3 ("weak").
- `Word.text` is now clean: `STT` stays `STT`, `guys` stays `guys` (see §4, D-stretch).

## 4. Deviations from the plan (all signed off before building)

| id | plan said | built | why |
|---|---|---|---|
| D1 | Angry ≈ $0.023 Bedrock, 30–45 s; diff vs `08_project.json` | corrected targets; text+timing diff + content-WER vs `truth/` | targets were the harness's; `08_project.json` has another schema (`lines[]`, int emphasis, ids from `w0`) |
| D2 | `stages` JSON string, heartbeat per stage | one lock-guarded in-memory state per run, whole-item writes conditional on `runId`; heartbeat inside Transcribe's poll loop | two threads read-modify-writing one string lose updates; a slow Transcribe would be declared dead; a lost run could overwrite its successor |
| D3 | `cost_event(project_id, ...)`, undefined "stage callbacks" | `app/jobctx.py` contextvar: project id + `on_stage` + heartbeat; `jobctx.submit` copies context into pool threads | pipeline call sites have no project id; contextvars don't cross into `ThreadPoolExecutor` |
| D4 | audio stage unspecified | download → ffprobe (rotation-aware) → reject >60 s → wav kept at `p1/projects/{id}/audio.wav`; `preset_id` threaded through `run()` | `run()` needs duration/size; `presetId` was dropped |
| D5 | two tables (`DYNAMO_COST_TABLE`) | one table + sparse `byDay` GSI | sparse GSI is not overloading; one fewer table and env var |
| D6 | `GET /projects/{id}` before ready unspecified | `409 not_ready`; `scripts/seed_fixture.py` | an empty doc cannot be a valid Project; P3 needed data before the pipeline |
| D7 | Sarvam required at startup | optional; `sarvam` stage `skipped` | would block anyone without the secret from `/health` |
| D8 | `scripts/backfill.py` | not built; prosody divide-by-zero fixed | YAGNI (zero migrations exist); Sarvam text + empty Transcribe divided by zero |
| D-stretch | plan §8.1 | removed the two `Word.text` rewrites in `tag.py`; `stretch_text()` kept, unused, as renderer reference | INDEX.md invariant; lead-approved |

Also, unplanned but small: `API_PORT` in compose (8000 was taken on the dev machine by another project);
flat error bodies everywhere; `.env` may carry AWS keys (user request) — `.env.example` documents both ways.

### Rejected alternatives

- **Normalised per-word items** — rejected, more firmly than the plan argued: `build.py` ids are positional,
  so per-word sort keys would be positional too; a re-run replaces the set either way.
- **Dynamo Map for the doc** — Decimal round-trip on every float. JSON string round-trips exactly (tested).
- **boto3 resources** — not thread-safe; a single low-level client is shared instead.
- **Threading `project_id` through every pipeline signature** — touches every function for plumbing; the
  contextvar keeps `app/pipeline` callable from scripts with no job.
- **Rejecting long clips at `POST /process`** (plan §13.6) — duration isn't known until ffprobe; rejecting
  in the audio stage costs the same ($0) and needs no second probe.

## 5. Bugs found during integration, and the lesson

1. **Container paths are shallow.** `Path(__file__).parents[3]` raised `IndexError` in `/srv/tests`. Tests and
   scripts now search all parents. *Lesson: anything path-relative must be run in the container, not just on the host.*
2. **A redundant pre-validation turned a 422 into a 500.** Validating `style` separately raised outside the
   handler. Removed: the whole Project is validated in exactly one place (`store/projects._edit`).
   *Lesson: one validation boundary.*
3. **Two error shapes.** `HTTPException` wrapped bodies in `{"detail": …}`, `JSONResponse` did not. A
   handler in `main.py` flattens all of them.
4. **`stretch_text`'s docstring is off by one** (`"guys"`, 590 ms → `"guuuuuuys"`, 6 u's, not 5). Matters
   to P2 if they port it; test pins the real output.
5. **Transient DNS failure → unhandled 500s.** While a runaway status-poll loop (a quoting bug in my shell
   one-liner) hit the API for ~7 min, the container briefly failed to resolve `dynamodb.ap-south-1`. botocore
   retried, then the request 500'd. The background job was unaffected. *Nothing maps AWS connectivity
   errors to a 503; the editor will see a bare 500.*
6. **Frame size was never measured before.** See §2 — the default was wrong for 3 of 4 clips.

## 6. Weak or unfinished (with the caveat that makes it weak)

- **Not deployed.** No App Runner service, IAM instance-role policy, Secrets Manager secret, or min=max=1
  setting exists. **Assumed risk:** App Runner may throttle CPU when no request is in flight, which would
  starve `BackgroundTasks`; the editor's 2 s status polling may keep it busy enough. Verify on first deploy.
- **Rates not reconciled against a bill.** Transcribe $0.024/min and its 15 s minimum are **assumed**; Bedrock
  uses list price. `unverifiedRates` surfaces this in every response.
- **Sarvam's sync-API duration limit (≈30 s, assumed) is untested** — the longest clip is 27.2 s. With
  `MAX_CLIP_SECONDS=60`, a 30–60 s clip may fall back to Bedrock romanisation; the `sarvam` stage then shows
  `failed` with Sarvam's own message, so it is visible, not silent.
- **Kill test killed during `audio`, not during Transcribe.** The heartbeat inside Transcribe's poll loop is
  exercised by the real runs (no false "worker lost") but a kill *during* Transcribe was not tried.
- n=1 per clip for every latency/cost/quality number.
- `GET /projects` is a Scan of the shared table filtered by prefix. `GET /costs` is one Query per day (≤31).
- Unknown `style` keys in a PATCH are silently dropped (schema ignores extras) rather than rejected.
- Transcribe jobs are never deleted; `audio.wav` is kept per project with no S3 lifecycle rule.
- PATCH without `version` retries once on a race, then 409s.

## 7. Not yet wired

- `apps/web` makes no HTTP calls to any of this (P3).
- `POST /projects/{id}/agent` → 501 with contract; `app/agent/` untouched (P4).
- `POST|GET /projects/{id}/render…` → 501 with contract; `remotion/` is a README (P2).
- Nothing renders `stretch` as repeated letters yet — held words now look plain until P2 does.
- No App Runner deployment.

## 8. Open decisions for the next session

1. **`tag.py` anger** — measured precision is poor (§3). Tune with `caption_eval/`, or adopt the harness's
   line-level tone, which needs audit 11 §6's `lines[]` (lead).
2. **Stretch false positives** on the calm clip (7). Same harness.
3. **Model choice.** `opus-5`/`fable-5-1` are in the account's inference profiles and cost is not a constraint
   (user memory); every measurement is Sonnet 4.6. Cost rows now make an A/B measurable.
4. **Agent patch paths (P4):** `/words/N` is an array index; `w12` is index 11. Resolve ids server-side.
5. **Fixture vs invariant (lead):** `demo-project.json` has `"text": "Hellooooo"`, contradicting INDEX.md.
6. **P2:** draw repeats from `signals.extraMs` (`clamp(round(extraMs/120),1,5)`, cap at 14 chars), not `stretch`.
7. **Deploy** (IAM policy, Secrets Manager or SSM for the Sarvam key, min=max=1) and check background-task CPU.
8. **`CLAUDE.md`** says the lead merges to `main`; the repo's default branch is `master`. Proposed edit in plan §7.
9. Map AWS connectivity errors to `503` so the editor can retry instead of treating it as a bug.
