# API + persistence layer for Expressive Captions (P1)

> ## Build status — 2026-09-18 (read before trusting the rest)
>
> Built on `p1-pipeline`; outcome and measurements in `.claude/audits/12-api-persistence-layer.md`.
>
> | section | status |
> |---|---|
> | §1 blob as JSON string, optimistic `version` | **built as planned** |
> | §1 two tables / `DYNAMO_COST_TABLE` | **changed (D5):** one table `expressive-captions-dev`, cost rows `sk=COST#…` with a sparse `byDay` GSI. There is no `DYNAMO_COST_TABLE`. |
> | §2 `store/dynamo.py` "resource + table handles" | **changed:** one shared low-level *client* (thread-safe), no resources |
> | §3 lazy `migrate()` | built (`SCHEMA_VERSION=1`, no steps). `scripts/backfill.py` **not built** (D8) |
> | §4 endpoints | all built. `GET /projects/{id}` before ready → `409 not_ready` (D6). Errors are flat `{"error":…}`. Agent/render are 501 seams |
> | §4 job execution | built with `BackgroundTasks`; job state per D2 (runId-guarded whole-item writes, heartbeat in Transcribe poll). App Runner min=max=1 **not configured — not deployed** |
> | §5 cost logging | built; project comes from `app/jobctx.py` (D3), not a parameter. `verified` means "list price", not "reconciled with a bill" |
> | §6 env/secrets | `config.py`, `.env.example`, `~/.aws` mount built. Sarvam optional (D7). App Runner role / Secrets Manager **not done** |
> | §7 `CLAUDE.md` edit | **proposed, not applied** (lead). Drop the `DYNAMO_COST_TABLE` line from it |
> | §8.1 `stretch_text` | done as written in §8.1 |
> | *(not in this plan)* | **`tag.py` rewritten**: line-level tone from the new `app/pipeline/semantics.py` replaces `_angry_words`; emphasis is now the harness's top-15% budget. Lead-approved mid-build; see audit 12 §8 |
> | §10 build order | followed; audio stage per D4 |
> | §11 verification | done except: targets corrected (D1); kill test was during `audio`, not Transcribe |
> | §13 weak points | 1 real (documented in `/process` 409); 2 deferred; 3 worse than stated, fixed (D4); 4 fixed (clients); 5 fixed (D3); 6 moved to audio stage; 7, 8 accepted |

## Context

The STT/prosody pipeline is designed, measured and (mostly) written — `services/api/app/pipeline/`
is the code we ship, `scripts/stt_bakeoff/caption_eval/` is its evaluation harness (audit 11, top box).
What does not exist: anything that stores a `Project`, anything that runs the pipeline asynchronously,
and anything the editor can call. `apps/web` has zero HTTP calls; `app/main.py` is `/health` and a CORS
middleware. This plan is the surface and the storage that wrap the pipeline.

**Decisions taken in the planning session:**

| question | answer |
|---|---|
| Frontend | Stays Vite + React. Plain CORS REST, presigned S3 direct from browser. Audit 11 §10.1 closed. |
| Database | **DynamoDB** (reversing the "Postgres, not Mongo" line in the brief). |
| Which pipeline | `services/api/app/pipeline/` — per audit 11's top box. `caption_eval/` stays a harness. |
| Sarvam | Stays, alongside Transcribe. Both are needed: Sarvam=text, Transcribe=timings. Bedrock-romanise fallback already in `run.py`. |
| Cost rows | Same database as projects. |

**The DynamoDB choice removes the largest chunk of the original brief.** There is no ORM, no Alembic,
no RDS instance to provision, no VPC connector for App Runner, no DB password to put in Secrets Manager,
and no `CLAUDE.md` stack change — `CLAUDE.md:46` already says DynamoDB, so the documented stack stays
true as written. boto3 is already a dependency. That is roughly a day of hackathon time not spent.
The cost is that schema evolution moves into application code; §3 below is how that is handled.

---

## 1. Data model

### Verdict: one item per project, `Project` stored as a JSON **string**

The brief's real question — blob or normalised — survives the move to Dynamo. Both sides:

**Blob (one item, whole `Project` in one attribute)**
- The `Project` JSON *is* the contract (`CLAUDE.md`: "ONE shared project JSON. Every feature reads and
  writes that JSON"). One write = one Pydantic-validated `Project`. It is structurally impossible to
  persist a half-applied change.
- The agent's entire design is "return a validated JSON patch applied to a Project" (`CLAUDE.md`,
  `app/agent/`). That is a blob operation. Normalised tables mean translating every agent patch into N
  row writes and hoping they land together.
- `apps/web`'s reducer already works this way — audit 02: every action re-validates the *whole* candidate
  with `Project.safeParse` and drops it if invalid. Server and client share one mental model.
- `GET /projects/{id}` is one `GetItem`.

**Normalised (item per word: `pk=PROJ#{id}`, `sk=WORD#0001`)**
- Per-word PATCH becomes a single `UpdateItem` — no read-modify-write, no version conflicts.
- No 400 KB item ceiling; any video length.
- But `GET /projects/{id}` becomes a Query + reassemble + re-validate, and every read path has to *enforce*
  the invariant the blob gives for free.
- Pipeline writing 94 words = `BatchWriteItem` paging. An agent patch over a 12-word phrase = 12 writes.
- Roughly 3× the persistence code for a benefit (concurrent per-word writes) that a single-user,
  no-auth editor never collects.

**Blob wins, more clearly than it would have under Postgres**, because the alternative here isn't a
`WHERE` clause, it's hand-rolled fan-out. Measured sizing: Real_reel is 94 words ≈ 25 KB of JSON; the
400 KB limit lands around ~1,400 words ≈ a 5-minute clip. MVP clips are 15–30 s. We add a guard that
returns 413 above 350 KB and revisit only if that fires.

**Why a JSON string and not a native Dynamo Map:** the schema is full of floats (`fontSize`, `stretch`,
`x`, `y`, `loudnessZ`, `durationRatio`). boto3's document client rejects Python floats and round-trips
everything through `Decimal`, which means a conversion layer on every read and write and a class of
bugs where `stretch: 2.5` comes back as `Decimal('2.5')` and fails Pydantic or serialises wrong. A JSON
string round-trips exactly, and we give up nested `UpdateExpression`s we weren't going to use anyway.

### Tables — two, not single-table design

Single-table design with overloaded GSIs is the right answer for a product and the wrong answer for three
days. Two tables, each with an obvious key schema.

**`DYNAMO_TABLE`** (existing env var) — projects and jobs

| item | pk | sk | attributes |
|---|---|---|---|
| project | `{DEV_PREFIX}#PROJ#{projectId}` | `PROJECT` | `doc` (JSON string), `schemaVersion` (N), `version` (N), `status`, `s3Key`, `createdAt`, `updatedAt`, `hasManualEdits` (BOOL) |
| job | `{DEV_PREFIX}#PROJ#{projectId}` | `JOB` | `state`, `stages` (JSON string), `startedAt`, `heartbeatAt`, `error` |

Job is a **separate item** on purpose: the editor polls status every ~2 s for ~45 s. Polling a 300-byte
job item instead of a 25 KB project item is ~20× fewer RCUs and a faster response.

**`DYNAMO_COST_TABLE`** (new env var) — one item per external model call

| | |
|---|---|
| pk | `{DEV_PREFIX}#PROJ#{projectId}` |
| sk | `{iso8601}#{uuid4hex[:8]}` |
| GSI `byDay` | pk `day` (`2026-09-18`), sk = same as table sk |

Separate table because the `byDay` access pattern wants a different partition key, and mixing them means
GSI overloading. Both tables on-demand billing: at hackathon volume (hundreds of items) this is
effectively $0 — under $0.01 for the whole three days — and there is no instance to leave running.

---

## 2. Storage layer — files

```
app/store/dynamo.py     boto3 resource + table handles, built from config
app/store/projects.py   get / create / put / patch_word / patch_project + migrate()
app/store/jobs.py       job state, per-stage transitions, heartbeat, stale detection
```

`projects.patch_word(project_id, word_id, patch, expected_version)`:
1. `GetItem` → parse `doc` → `migrate()` → `Project.model_validate`
2. apply the patch to that word, re-validate the **whole** `Project` (mirrors the client reducer)
3. `PutItem` with `ConditionExpression: version = :expected`, `version = version + 1`,
   `hasManualEdits = true`
4. `ConditionalCheckFailedException` → HTTP 409 with the current version, so the client can refetch

Two round-trips at ~5 ms each in-region. Single editor per project means the condition essentially never
fails — its job is to turn a hypothetical lost update into a visible 409 rather than silent data loss.

---

## 3. Migration story

Dynamo's "no migrations" is a pitch and a trap. The trap is real here: audit 11 §6 proposes five schema
changes (`lines[]`, `emotion`→line tone, graded `emphasis`, `Signals.confidence`, `Word.locked`) that the
lead may land mid-hackathon, and by then there will be projects in the table written under the old shape.

**Lazy migration on read.** Every project item carries `schemaVersion`. `app/store/projects.py` holds an
ordered list of steps:

```python
MIGRATIONS = [
    (1, 2, _v1_to_v2),   # derive lines[] from word gaps; emphasis bool -> 0|2
]
SCHEMA_VERSION = 2
```

`migrate(doc)` applies every step above the item's stored version, in order, on read. The migrated doc is
written back on the next write. ~25 lines, no dependency, no downtime, and an old item that is never
opened is never touched. `scripts/backfill.py` does a `Scan` + rewrite for the case where lazy isn't
enough (e.g. a new GSI needs populating).

Practically: the API layer is unblocked by §6 either way. It should be built with `SCHEMA_VERSION = 1`
today and gain a step the same day the lead lands the change.

---

## 4. API surface

Arguing with audit 11 §7 — it's a good sketch with five real gaps.

```
GET    /health

POST   /projects                        create + presigned upload
POST   /projects/{id}/process           start the pipeline
GET    /projects/{id}/status            per-stage progress
GET    /projects/{id}                   Project JSON
GET    /projects                        list (demo/debug)
PATCH  /projects/{id}                   presetId / settings
PATCH  /projects/{id}/words/{wordId}    per-word edit
POST   /projects/{id}/agent             P4 seam
POST   /projects/{id}/render            P2 seam
GET    /projects/{id}/render/{jobId}    export status
GET    /projects/{id}/cost              per-project spend
GET    /costs?from=&to=                 aggregate spend
```

### Where this differs from §7, and why

1. **§7 folds create and start into one call.** If `POST /projects` returns a presigned URL, the server
   never learns that the upload finished. Splitting out `POST /{id}/process` makes the trigger explicit
   and lets a failed upload be retried without creating a duplicate project. (The alternative —
   S3 event → Lambda → API — is more moving parts for a client that is right there and knows when its
   own PUT returned.)
2. **§7 has no project-level PATCH.** The preset picker (audit 06) and the settings toggles change
   `presetId` and `settings.*`. Those aren't word edits and there is nowhere to put them.
3. **§7 never says what `videoUrl` contains.** The pipeline currently writes `s3://.../clip.mp4`, which a
   browser `<video>` cannot play. `GET /projects/{id}` must return `videoUrl` as a freshly **presigned GET
   URL** (1 h), rewritten on every read; the durable `s3Key` lives outside `doc`. Without this the editor
   has no video.
4. **§7 has no failure story.** Each stage needs an explicit `failed` state with a message the editor can
   show, and `process` needs to 409 when a job is already running.
5. **§7 omits render status.** Remotion Lambda renders are async too; one endpoint isn't enough.
6. **Presigned POST, not PUT.** A presigned POST can carry a `content-length-range` condition; a
   presigned PUT cannot. Caps uploads at 200 MB, which prevents one obvious way to break the demo.

### Shapes

**`POST /projects`**
```jsonc
// req
{ "filename": "reel.mp4", "contentType": "video/mp4", "presetId": "hinglish-bold" }
// 201
{ "projectId": "a1b2c3d4e5f6",
  "upload": { "url": "https://bucket.s3.ap-south-1.amazonaws.com/",
              "fields": { "key": "p1/a1b2c3d4e5f6/source.mp4", "policy": "...", "...": "..." } },
  "expiresInSec": 900 }
```
Creates the project item with `status: "awaiting_upload"` and an empty `doc`.

**`POST /projects/{id}/process`** → `202 { "state": "running", "stages": {...} }`, or `409` if already
running, `400` if the S3 object isn't there (`head_object` check first — cheap, and turns a confusing
30-s failure into an instant one).

**`GET /projects/{id}/status`**
```jsonc
{ "projectId": "a1b2c3d4e5f6",
  "state": "running",                       // queued | running | done | failed
  "stages": {
    "audio":      { "state": "done",    "ms": 1840 },
    "transcribe": { "state": "running", "ms": null },   // ~11 s, the long one
    "sarvam":     { "state": "done",    "ms": 1120 },   // runs concurrently with transcribe
    "align":      { "state": "pending", "ms": null },
    "prosody":    { "state": "pending", "ms": null },
    "tag":        { "state": "pending", "ms": null },
    "build":      { "state": "pending", "ms": null }
  },
  "error": null,
  "startedAt": "2026-09-18T06:12:04Z" }
```
Stages are a **map, not a list** — `transcribe` and `sarvam` run in parallel in `run.py`'s
`ThreadPoolExecutor`, so there is no linear progress index. Stage names map 1:1 onto the modules in
`app/pipeline/`.

**`GET /projects/{id}`** → `200` the `Project` per `packages/shared/src/project.ts`, with `videoUrl`
presigned, plus response headers `X-Project-Version` and `X-Schema-Version`. `409`-able writes use them.

**`PATCH /projects/{id}/words/{wordId}`**
```jsonc
// req — any subset of the mutable Word fields
{ "text": "bhai", "emphasis": true, "stretch": 2.4, "style": { "color": "#ff2d55" }, "version": 7 }
// 200
{ "word": { "id": "w12", "...": "..." }, "version": 8 }
// 409
{ "error": "stale_version", "currentVersion": 9 }
```
`version` optional; omitted means last-write-wins (the editor can opt in once P3 is ready).

**`PATCH /projects/{id}`** → same envelope for `{ presetId?, settings? }`.

**`POST /projects/{id}/agent`** (P4's seam — this plan defines the envelope and stubs the body `501`)
```jsonc
// req
{ "utterance": "make the swear words red and shake them", "selection": ["w12","w13"] }
// 200
{ "patch":  [ { "op": "replace", "path": "/words/12/style/color", "value": "#ff2d55" } ],
  "applied": true, "version": 9,
  "steps":  [ { "tool": "find_words", "args": {...} }, { "tool": "update_style", "args": {...} } ] }
```
`steps` feeds the existing agent activity log in `apps/web` (audit 09) so it shows real tool calls.
The route validates the resulting `Project` before persisting — per `CLAUDE.md`, agent tool calls are
schema-validated before being applied.

**`POST /projects/{id}/render`** (P2's seam — `501` until Remotion exists; `remotion/` is currently a
README only) → `202 { "renderId": "...", "state": "queued" }`.
**`GET /projects/{id}/render/{renderId}`** → `{ state, progress, outputUrl }`.

**`GET /projects/{id}/cost`**
```jsonc
{ "projectId": "a1b2c3d4e5f6", "totalUsd": 0.0481, "durationMs": 15400,
  "usdPerMinute": 0.187, "unverifiedRates": ["sarvam"],
  "byService": { "bedrock": 0.0361, "transcribe": 0.0120, "sarvam": 0.0 },
  "byStage":   { "tag": 0.0361, "transcribe": 0.0120, "sarvam": 0.0 },
  "events": [ { "ts": "...", "service": "bedrock", "modelId": "global.anthropic.claude-sonnet-4-6",
                "stage": "tag", "inputTokens": 8120, "outputTokens": 640,
                "usd": 0.0341, "latencyMs": 6210, "ok": true } ] }
```

**`GET /costs?from=2026-09-18&to=2026-09-18`** → same rollup across the `byDay` GSI, plus `projectCount`
and `meanUsdPerProject` — that is the "what does a 30 s clip cost us" answer.

### Job execution

FastAPI `BackgroundTasks` on the App Runner instance. No Step Functions (cut from scope), no Celery, no
SQS.

- The pipeline entrypoint stays a **plain `def`**, not `async def`, so Starlette runs it in the threadpool.
  An `async def` here would block the event loop for 45 s and freeze the whole API — the single easiest
  way to get this wrong.
- Job state lives in Dynamo, not process memory, so a status poll routed to another App Runner instance
  still answers correctly.
- Set App Runner min=max=**1** instance for the hackathon.
- The runner writes `heartbeatAt` after each stage. `GET /status` treats a `running` job whose heartbeat
  is >120 s old as `failed` ("worker lost") — that is what stops an instance restart from leaving a job
  spinning forever in the demo.

### Re-running the pipeline over manual edits

`POST /process` on a project with `hasManualEdits: true` returns **409** unless `?force=true`. This is the
MVP substitute for audit 11 §6's `Word.locked` and needs **no schema change** — it's a top-level
attribute outside `doc`. If the lead lands `locked`, the runner can upgrade to preserving locked words
individually. Worth saying to the lead: of the five §6 changes, `locked` is the only one the API layer
has an opinion about, and this 409 buys time on it.

---

## 5. Cost logging

```
app/pricing.py    rate table, ap-south-1, with explicit verified flags
app/costs.py      cost_event() context manager, writer, and the two queries
```

Every external call is wrapped:

```python
with cost_event(project_id, stage="tag", service="bedrock", model_id=MODEL) as ev:
    resp = client.converse(...)
    ev.tokens(resp["usage"]["inputTokens"], resp["usage"]["outputTokens"])
```

The context manager times the call, computes USD from the rate table, and writes one row — **including on
failure** (`ok: false`), because a Bedrock call that times out has still been billed for input tokens.
The write is wrapped in try/except: a cost-logging failure must never break a pipeline run.

Call sites: `app/pipeline/stt.py` (Transcribe job + the `romanize_words` Bedrock fallback),
`app/pipeline/run.py` (Sarvam), `app/pipeline/tag.py` (`_angry_words` Bedrock), and later `app/agent/`.
These are edits inside the pipeline modules — small, but they are P1's files, which is fine, and they are
the only pipeline changes this plan requires.

Rate table, calibrated against audit 11 §8 and the harness's own arithmetic in
`caption_eval/pipeline.py` (`inputTokens*3/1e6 + outputTokens*15/1e6`):

| service | unit | rate | verified |
|---|---|---|---|
| bedrock `global.anthropic.claude-sonnet-4-6` | per 1M tokens | $3.00 in / $15.00 out | yes — matches measured $0.023 on Angry |
| transcribe batch `hi-IN` | per audio minute | $0.024 | **no** — §8 marks it "published rate, assumed" |
| sarvam `saaras:v3` | per audio minute | 0.00 | **no** — §8: "pricing not verified" |

Sarvam logs `audioSeconds` at a zero rate, so when someone gets the real number we multiply historic rows
instead of having lost the usage. `usdVerified: false` propagates into the API response as
`unverifiedRates` — the dashboard says "$0.048 (+ Sarvam, unpriced)" rather than quietly understating.
`rateVersion` on every row so a rate correction doesn't silently rewrite history.

Sanity target from §8: ~$0.05 per 30 s clip, Bedrock ~$0.038 of it. If `GET /costs` disagrees with that
by more than ~2×, the rate table or the instrumentation is wrong.

Every event is also emitted as one JSON line to stdout. App Runner ships stdout to CloudWatch for free,
so there is a second record if a Dynamo write fails, and CloudWatch Logs Insights can answer ad-hoc
questions without new code.

**Note, per the brief:** this is visibility, not throttling. Nothing in this design gates, downgrades or
retries-cheaper based on cost. Bedrock cost is not a constraint on model choice.

---

## 6. Environment and secrets

Three real bugs. Anyone cloning this repo today gets a `KeyError` before they get a caption.

**a. `SARVAM_API_KEY` is read in four places and set nowhere** — `app/pipeline/run.py:26`,
`scripts/stt_bakeoff/engines.py:192`, `caption_eval/pipeline.py:71`, `caption_eval/evidence/sarvam_modes.py:8`.

**b. `.env.example` says `AWS_REGION=us-east-1`; everything we run is `ap-south-1`** — `app/pipeline/stt.py:18`
and `tag.py:74` both default to `ap-south-1`, `caption_eval/pipeline.py:212` hardcodes it, and the real
`.env` says `ap-south-1`. Only `.env.example` and `scripts/stt_bakeoff/engines.py:113,148` still say
`us-east-1`.

**c. `.env.example` asks for `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`; the real `.env` says credentials
come from `~/.aws`.** The code agrees with `.env` — nothing passes explicit credentials to boto3. **But
`docker-compose.yml` doesn't mount `~/.aws`**, so the container has no credentials by either story. This
is a latent third bug that only hasn't bitten because nothing in `app/` calls AWS yet.

Fixes:

`.env.example` rewritten to match reality — drop the two key fields, `ap-south-1`, add the two new vars,
and say where the Sarvam key comes from:

```sh
# Credentials come from ~/.aws (run `aws configure`), NOT from this file.
# docker-compose mounts ~/.aws into the API container read-only.
AWS_REGION=ap-south-1
AWS_PROFILE=default

S3_BUCKET=
DYNAMO_TABLE=
DYNAMO_COST_TABLE=
DEV_PREFIX=p1

BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6

# Sarvam Saaras v3 — dashboard.sarvam.ai → API keys. Ask the lead for the team key.
SARVAM_API_KEY=

CORS_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:8000
VITE_USE_FIXTURE=false
```

`docker-compose.yml` gains `- ~/.aws:/root/.aws:ro`, which makes the credential story true.

`app/config.py` — a `Settings` object read once at import that raises on startup listing **every** missing
variable at once, instead of a `KeyError` thrown 30 seconds into a pipeline run from inside a thread pool.
`run.py:26`'s `os.environ["SARVAM_API_KEY"]` becomes `settings.sarvam_api_key`.

**App Runner:**

| what | how |
|---|---|
| AWS credentials | **Instance role**, never env vars. IAM policy scoped to the one bucket, the two tables, `transcribe:*Job`, `bedrock:InvokeModel`/`Converse`. |
| `SARVAM_API_KEY` | Secrets Manager secret `expressive-captions/sarvam`, referenced as a secret env var in the App Runner service config. Needs `secretsmanager:GetSecretValue` on that ARN in the **instance role** (not the access role). ~$0.40/month — about 4 cents for the hackathon. SSM Parameter Store `SecureString` is free and App Runner references it identically, if we'd rather pay nothing. |
| everything else | Plain env vars in the service config. They aren't secret and fewer indirections is fewer things to debug at 2am. |

No `.env` ships in the image; `.dockerignore` should be checked to confirm.

---

## 7. `CLAUDE.md` edit — small, because DynamoDB stays

Staying on Dynamo means **no documented-stack change** — `CLAUDE.md:46` stays true as written, which is
the main practical argument for it. Three additions, all in the Local dev section, proposed for the lead:

```diff
   | AWS dev data | your own `DEV_PREFIX` (p1–p4) inside the shared bucket and table |
+- `SARVAM_API_KEY` is required — Saaras v3 supplies the Hinglish Roman text that AWS Transcribe
+  cannot. Get it from the lead; it is a real secret and never goes in git.
+- AWS credentials come from `~/.aws` (`aws configure`), never from `.env`. docker-compose mounts
+  `~/.aws` into the API container read-only.
   - Storage: S3 (media), DynamoDB (project JSON + model-cost events)
```

Plus `DYNAMO_COST_TABLE` alongside `DYNAMO_TABLE` wherever the table is mentioned.

---

## 8. Things to settle with the lead before/while building

1. **`app/pipeline/tag.py` contradicts a stated invariant — but the fix is one line, not a deletion.**
   `tag()` sets the magnitude correctly on `tag.py:54` (`"stretch": round(durationRatio, 2)`) and
   then *also* rewrites the spelling on `tag.py:55` (`"text": stretch_text(...)`), producing
   `"guys"` → `"guuuuuys"`. The second write is redundant with the first and is what
   `.claude/INDEX.md` forbids: *elongation is carried by `Word.stretch`, never by repeating letters
   in `Word.text`.* Audit 11 §5.3 measured the damage: `"STT"`→`"ST"`, `"Benetton"`→`"Beneton"`.

   **Scope: drop the `"text":` key on `tag.py:55`, and `tag.py:62` which exists only to undo it for
   angry words.** Detection, thresholds and the two-part `is_stretched` test all stay.

   **Do not delete `stretch_text`'s arithmetic — move it to the renderer.** `MS_PER_EXTRA_CHAR=120`,
   `MAX_EXTRA_CHARS=5` and `MAX_WORD_CHARS=14` are real, measured knowledge; audit 11's top box
   credits `MAX_WORD_CHARS` ("captions must fit the frame") as a practical cap the harness lacks.

   Note for P2, easy to get wrong: `stretch` carries `durationRatio` (× the speaker's median per
   syllable) while the repeat count comes from `extraMs` (absolute ms held). **Different
   quantities** — the repeat count cannot be derived from `stretch` alone. It doesn't need to be:
   `signals.extraMs` is already in the schema (`project.ts:30`) and already populated by
   `prosody.py:110`, so `clamp(round(extraMs/120), 1, 5)` capped at `14 - len(text)` reproduces
   today's output exactly.

   **No schema change is required and no data is lost** — the JSON already carries everything the
   renderer needs. This is still a behaviour change to the shipped pipeline, so the lead signs off,
   and it needs P2 to implement the draw side before it can land without visibly losing elongation.

2. **Audit 11 §6 schema changes.** Propose only, per ownership rules. The API layer is unblocked either way
   — §3's migration hook is what makes that true. Of the five, `Word.locked` is the one with an API-layer
   consequence, and §4's `hasManualEdits` 409 defers it.
3. **Audit 11 §10.3 (where the pipeline runs)** — settled by this plan: the App Runner container. librosa
   is already in `requirements.txt` and the Dockerfile already installs `ffmpeg` + `libsndfile1`.
4. **Audit 11 §10.4 (3-vote Bedrock consensus)** — recommend *deferring until cost logging exists*, then
   measuring it. It is ~$0.11/clip against a stated non-constraint, so the only real question is whether it
   improves held-word stability, and §5 is what makes that measurable. Not on the MVP path.
5. **Audit 11 §10.6 (elongation)** — ship best-effort, no MMS_FA. Shipping `signals` in the API response
   (already in the schema, already what §7 argued for) is the UI affordance that makes a wrong call one
   click to fix.
6. Audit 11 §10.1 and §10.5 are closed by this session's answers: Vite, and Sarvam stays.

---

## 9. Files

**New**
```
app/config.py                  Settings, fail-fast on missing env
app/pricing.py                 rate table + usd()
app/costs.py                   cost_event() CM, writer, queries
app/s3.py                      presigned POST/GET, key layout
app/store/dynamo.py            resource + table handles
app/store/projects.py          get/create/put/patch + optimistic version + migrate()
app/store/jobs.py              per-stage job state, heartbeat, stale detection
app/jobs/runner.py             background task orchestrating app/pipeline/run.py
app/routers/projects.py        create, process, status, get, list, patch, patch word
app/routers/agent.py           P4 seam (501 body, real envelope + validation)
app/routers/render.py          P2 seam (501)
app/routers/costs.py           per-project + aggregate
scripts/create_tables.py       idempotent table creation
scripts/backfill.py            scan + rewrite, for when lazy migration isn't enough
tests/                         first tests in services/api
requirements-dev.txt           pytest, moto — dev only, never the prod image
```

**Modified**
```
app/main.py                    include routers
app/pipeline/run.py            settings.sarvam_api_key; stage callbacks; cost_event around Sarvam
app/pipeline/stt.py            stage callbacks; cost_event around Transcribe + romanize_words
app/pipeline/tag.py            cost_event around _angry_words  (+ see §8.1)
requirements.txt               + soundfile        ← the only new prod dependency
docker-compose.yml             mount ~/.aws:ro
.env.example                   rewritten (§6)
CLAUDE.md                      three lines (§7) — lead's call
```

**`requirements.txt` gains exactly one line, `soundfile`.** No ORM, no migration tool, no DB driver —
boto3 is already there. No torch, no whisper, per audit 11 §9. That is the Dynamo dividend.

**Not touched:** `packages/shared/`, `apps/web/`, `remotion/`, `app/agent/` internals,
`scripts/stt_bakeoff/caption_eval/`.

---

## 10. Build order

1. `config.py`, `.env.example`, docker-compose `~/.aws` mount → `docker compose up` and `/health` works
   from a clean clone. **Do this first**; it is the thing currently blocking anyone else on the team.
2. `store/dynamo.py`, `store/projects.py`, `scripts/create_tables.py`, tests against the fixture.
3. `s3.py` + `POST /projects` + `GET /projects/{id}` → upload a clip by hand, read back a seeded project.
4. `pricing.py` + `costs.py` + call sites → cost rows appear. Before the runner, so the first real pipeline
   run is already instrumented.
5. `store/jobs.py` + `jobs/runner.py` + `POST /process` + `GET /status`.
6. `PATCH` word / project.
7. `GET /cost`, `GET /costs`.
8. Agent and render seams (envelopes + 501), so P4 and P2 can code against them.

Steps 1–3 unblock P3. Step 8 unblocks P4 and P2 without either waiting on the pipeline.

---

## 11. Verification

**End to end, against a real clip:**
```bash
docker compose up --build                       # /health
python services/api/scripts/create_tables.py    # idempotent, under DEV_PREFIX

curl -XPOST localhost:8000/projects -d '{"filename":"Angry.mp4","contentType":"video/mp4"}'
# -> presigned POST; upload services/api/scripts/stt_bakeoff/clips/Angry.mp4 to it with curl -F
curl -XPOST localhost:8000/projects/$ID/process
watch -n2 curl -s localhost:8000/projects/$ID/status    # stages flip; transcribe+sarvam concurrent
curl -s localhost:8000/projects/$ID | jq .
```

**Correctness checks that actually prove something:**
- Diff `GET /projects/{id}` against the harness's own output for the same clip,
  `caption_eval/evidence/stage-outputs/Angry/08_project.json`. Word count and timings should be close;
  where they differ, that is the `app/pipeline` vs harness delta audit 11's top box describes, not a bug
  in this layer.
- `GET /projects/{id}/cost` for Angry should land near **$0.023 Bedrock** (audit 11 §2) and **~$0.05 total**
  (§8). More than ~2× off means the rate table or the instrumentation is wrong.
- Total wall-clock from `process` to `done` should be **30–45 s** (§8). Much faster means a stage silently
  no-op'd.
- PATCH a word, re-GET, confirm the value changed and `version` incremented. PATCH again with the stale
  version → 409, not a silent overwrite.
- Kill the container mid-job, restart, `GET /status` → `failed` / "worker lost" within 120 s, not a job
  stuck in `running`.
- `POST /process` on a project with edits → 409; with `?force=true` → 202.
- Round-trip `packages/shared/fixtures/demo-project.json` through put/get and assert byte-identical after
  `Project.model_validate` — catches float/Decimal damage, which is the specific failure the JSON-string
  choice exists to prevent.

**Unit tests** (`pytest`, `moto` for Dynamo/S3 — dev requirements only): migration steps, pricing maths,
optimistic-concurrency 409, stale-job detection, presigned-POST conditions. These are the first tests in
`services/api`, which audit 11's caveat box explicitly flags as missing.

---

## 12. Addendum — checked against the real AWS account (2026-09-18)

Written after the plan was approved. Three assumptions in §1–§6 turned out to be wrong or
incomplete. Everything here was run against the shared dev account in `ap-south-1`.

| check | result |
|---|---|
| `S3_BUCKET` exists | **yes** — `firstcommit-stt-bakeoff-632127306260`, `ap-south-1`, already has a `p1/` prefix |
| bucket CORS config | **none** — `GetBucketCors` → `NoSuchCORSConfiguration` |
| `DYNAMO_TABLE` | **empty string in `.env`**, and `ListTables` shows no project table at all (only an unrelated `voxmith-terraform-locks`) |
| Bedrock model access | **yes** — `global.anthropic.claude-sonnet-4-6` is in `ListInferenceProfiles` |

Consequences for the build order in §10:

1. **There is no database yet.** `DYNAMO_TABLE=` is blank, so §10 step 2 is not "connect to the
   table", it is "create it". `scripts/create_tables.py` is on the critical path, and the name has
   to be agreed and written into `.env` / `.env.example` before anything stores a project.
2. **Browser upload will fail until the bucket has a CORS rule.** This is the classic 2am bug and
   it is not mentioned anywhere in §4. A presigned POST from `http://localhost:5173` needs
   `AllowedOrigins: [http://localhost:5173, <amplify domain>]`, `AllowedMethods: [POST, PUT, GET, HEAD]`,
   `AllowedHeaders: ["*"]`, `ExposeHeaders: [ETag]`. Add it as a step, and put the rule in
   `scripts/create_tables.py` (or a sibling `scripts/setup_aws.py`) so it is reproducible rather
   than a console click nobody remembers.
3. **The bucket is named for the bake-off.** `firstcommit-stt-bakeoff-…` is fine to reuse — a new
   bucket is another thing to create and grant — but source video should live under
   `{DEV_PREFIX}/projects/{projectId}/` so it doesn't mix with the bake-off's `p1/` artifacts.

---

## 13. Known weak points in this plan

Listed by the author. An implementing session should treat these as the places to push back first,
not as settled.

1. **Re-running the pipeline cannot preserve manual edits, and §4 implies it can.**
   `build.py:build_project` emits word ids positionally (`f"w{i}"` over `enumerate(words, 1)`).
   A re-run produces a different word count and therefore different ids, so every client-held id is
   invalidated and there is nothing to merge a manual edit back onto. `hasManualEdits` → 409 is
   honestly a *refuse to destroy* guard, not a merge. `?force=true` is destructive. Say so in the
   API docs; do not imply otherwise. Audit 11 §6's `Word.locked` does not fix this on its own —
   stable word ids are the missing prerequisite.
2. **Word ids are positional and therefore unstable.** Related to (1) but broader: any change to
   `build_project`'s enumeration shifts every id. If `PATCH /words/{wordId}` is to mean anything
   across time, ids should be derived from something stable (e.g. index + start time hash) — or the
   instability should be documented and the editor told to refetch after any re-run.
3. **The "audio" stage is hand-waved.** `pipeline/run.py:run()` requires **both** `wav_path` (local,
   for librosa) and `s3_uri` (for Transcribe). Nothing in the plan says who extracts the wav, where
   it is written on an App Runner instance with ephemeral disk, who uploads it, or who deletes it.
   That is a real gap: `tempfile.TemporaryDirectory` + upload + guaranteed cleanup, and a decision
   about whether the wav is kept in S3 after the run.
4. **boto3 clients across threads.** `cost_event` writes to Dynamo from inside `run.py`'s
   `ThreadPoolExecutor`. boto3 *resources* are not thread-safe and sharing a `Table` handle across
   workers is a real hazard. Use a client per thread, or a module-level lock, or hand cost rows back
   to the calling thread through a queue. The plan says none of this.
5. **"Stage callbacks" is an undefined interface.** §5 and §9 both say the pipeline modules gain
   "stage callbacks" without specifying the signature. Decide it explicitly — a single
   `on_stage(name, state, error=None)` callable threaded through `run()` is probably enough — and
   keep it optional so `run()` stays callable from a script with no job attached.
6. **The 350 KB write guard fires too late.** Rejecting an oversized project at write time means the
   pipeline has already spent ~$0.05 and 40 s. Check `durationMs` at `POST /process` instead and
   refuse long clips up front.
7. **`GET /costs?from=&to=` over the `byDay` GSI is one Query per day.** Fine for a 3-day
   hackathon; it does not generalise. Note the limit rather than pretending it's a range query.
8. **"~5 ms round trips" is App-Runner-in-region.** From a laptop over the internet it is 30–60 ms,
   so the read-modify-write PATCH is ~100 ms in local dev. Not a problem, but don't be surprised.
