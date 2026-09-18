# services/api — owner P1 (agent subfolder: P4)

FastAPI backend: upload → speech-to-text → Roman script → prosody signals → Bedrock tagging → Project JSON.
Container on App Runner. `app/schema.py` mirrors the shared TS schema (do not edit without the lead).

`app/agent/` (P4): Bedrock Converse tool loop. Tools: get_timeline, find_words, update_style,
apply_preset, locate_in_frame, add_overlay. Returns validated patches, never mutates pixels.

Design and measured results: `.claude/audits/11-stt-prosody-pipeline.md` (pipeline) and
`.claude/audits/12-api-persistence-layer.md` (this API + storage).

## Run it

```sh
cp .env.example .env          # fill in; SARVAM_API_KEY from the lead (optional, see below)
docker compose up --build     # http://localhost:8000/health
# port 8000 taken?  API_PORT=8010 docker compose up --build
```

AWS credentials come from `~/.aws` (mounted read-only), or from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
in `.env` if you set them. Startup fails fast listing every missing required variable
(`AWS_REGION S3_BUCKET DYNAMO_TABLE DEV_PREFIX BEDROCK_MODEL_ID`). Without `SARVAM_API_KEY` the pipeline
still runs — Transcribe text romanised by Bedrock, worse WER — and the `sarvam` stage reports `skipped`.

## AWS resources (once per account; idempotent)

```sh
docker compose run --rm api python scripts/setup_aws.py
EXTRA_S3_ORIGINS=https://main.xxxx.amplifyapp.com docker compose run --rm api python scripts/setup_aws.py
```

Creates the DynamoDB table `DYNAMO_TABLE` (on-demand, sparse `byDay` GSI for cost rows) and **replaces** the
bucket's CORS rule so browsers can POST presigned uploads from `CORS_ORIGINS` (+ `EXTRA_S3_ORIGINS`).
All keys live under your `DEV_PREFIX`: table `pk = {prefix}#PROJ#{id}`, S3 `{prefix}/projects/{id}/`.

## Dev helpers

```sh
docker compose run --rm api python scripts/seed_fixture.py            # demo-project.json -> GET /projects/demo-project
docker compose run --rm api pytest                                    # moto; never touches real AWS
python3 services/api/scripts/e2e_clip.py services/api/scripts/stt_bakeoff/clips/Angry.mp4 --out angry.json
python3 services/api/scripts/eval_project.py Angry angry.json          # content-WER vs truth + diff vs harness
```

`--reload` restarts the server on every save under `app/`, which kills a running pipeline job; it then
reads as `failed` ("worker lost") within 120 s. Re-`process` it.

## Endpoints

Errors are always flat: `{"error": "<code>", ...}`.

| method | path | notes |
|---|---|---|
| GET | `/health` | `{"ok": true}` |
| POST | `/projects` | `{filename, contentType: "video/*", presetId?}` → `201 {projectId, upload: {url, fields}, expiresInSec}`. Browser does a multipart **POST** of `fields` + `file` to `url` (max 200 MB) |
| POST | `/projects/{id}/process[?force=true]` | start pipeline → `202` job. `400 upload_missing`, `409 already_running`, `409 has_manual_edits` (re-run replaces all words **and renumbers word ids**; `force` discards edits — it is not a merge) |
| GET | `/projects/{id}/status` | `{state: not_started\|running\|done\|failed, stages: {audio, transcribe, sarvam, align, prosody, tag, build: {state, ms, detail?, error?}}, error, elapsedMs, status}`. Poll ~2 s. transcribe and sarvam run concurrently |
| GET | `/projects/{id}` | the `Project` (packages/shared) with `videoUrl` = fresh presigned GET (1 h). Headers `X-Project-Version`, `X-Schema-Version`. `409 not_ready` before the first successful run |
| GET | `/projects` | list (your prefix) |
| PATCH | `/projects/{id}/words/{wordId}` | any of `text startMs endMs emphasis emotion stretch single emoji style signals` + optional `version`. `style` merges per key (null removes); any other field set to null removes it. `single: true` makes the word its own caption block (grouping, see `packages/shared/src/blocks.ts` rule 4). Whole Project re-validated → `422 invalid_project`; stale `version` → `409 stale_version {currentVersion}`; no `version` = last write wins |
| PATCH | `/projects/{id}` | `{presetId?, settings?, version?}` → `{project, version}` |
| GET | `/projects/{id}/cost` | `{totalUsd, byService, byStage, unverifiedRates, usdPerMinute, events[]}` |
| GET | `/costs?from=YYYY-MM-DD&to=YYYY-MM-DD` | UTC days, ≤ 31; adds `projectCount`, `meanUsdPerProject`, `byProject` |
| POST | `/projects/{id}/agent` | **P4 seam.** Validates `{utterance, selection[], version?}` against the project, then `501` with `responseContract` |
| POST / GET | `/projects/{id}/render`, `/projects/{id}/render/{renderId}` | **P2 seam.** `501` with `responseContract` |

## Layout

```
app/config.py        settings, fail-fast           app/s3.py         presigned POST/GET, key layout
app/jobctx.py        ambient job context (project id + stage reporting across threads)
app/pricing.py       rate table (+ verified flags) app/costs.py      cost_event(), queries, rollups
app/media.py         ffprobe / ffmpeg              app/jobs/runner.py background pipeline job
app/store/           dynamo.py (client, table spec) projects.py (blob + versions) jobs.py (runId, heartbeat)
app/routers/         projects, costs, agent (P4 seam), render (P2 seam)
app/pipeline/        the STT/prosody pipeline (audit 11)
```
`requirements.txt` ships to production; test deps are in `requirements-dev.txt` (installed only when
`INSTALL_DEV=true`, which docker-compose sets).
