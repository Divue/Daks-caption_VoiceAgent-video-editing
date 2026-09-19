# Deploy to AWS with Terraform — Phase 01 Audit

Written for a teammate who has never seen the conversation that produced it. It doubles as the
runbook: every command needed to reproduce, redeploy or tear down is in **Runbook** below.

---

## Status
**DEPLOYED, PARTLY VERIFIED (2026-09-19).** The API runs on App Runner in the owner's account
(`https://pbmw8mk9j9.ap-south-1.awsapprunner.com`, status RUNNING). The editor is the pre-existing Amplify
app (`https://master.dnb761en5gcll.amplifyapp.com`), rebuilt with `VITE_API_URL` pointing at that API.
Verified against the real deployed services: `/health`, CORS preflight from the Amplify origin, `/costs`
and `/projects` reading the real DynamoDB table through the instance role. **NOT yet run: an upload →
pipeline → edit → reload pass** (the real proof), and nobody has opened the deployed editor in a browser.
Four incidents happened on the way; all are recorded below and all are resolved or worked around.
**Voice (added later the same day, see "Phase 02 — Voice"):** the STT worker runs on ECS Fargate, registered
with LiveKit Cloud, and the API mints LiveKit tokens. An end-to-end run through the deployed stack **PASSED**
(synthesised speech → real room → deployed worker → streaming Transcribe → final transcript). A real browser
microphone has still not been tried.

### Incident 1 — CloudFront refuses new accounts until verified (2026-09-19)
`terraform apply` → `aws_cloudfront_distribution.web`:
`AccessDenied (403): Your account must be verified before you can add new CloudFront resources. To verify
your account, please contact AWS Support.` This is an account-level restriction on this ~1-week-old
account, not a Terraform or config bug — the same class of block as the Bedrock and Transcribe
"account not authorized / being verified" errors seen earlier (`SubscriptionRequiredException`,
`ValidationException: Operation not allowed`). Resolution time is unknown, so the design must not wait on
it. Options under consideration: (a) Amplify Hosting via Terraform (AWS-managed CDN, not a customer
CloudFront distribution — **not yet confirmed to be exempt**); (b) a second App Runner service serving the
built editor from an nginx image (HTTPS without CloudFront); (c) S3 static website (HTTP only, so browser
speech recognition — which needs a secure context — would not work). State after the failure is consistent
(`terraform state list` shows 10 managed resources, none half-created).

### Incident 2 — Amplify app quota reached; the Terraform Amplify attempt hung (2026-09-19)
Switched the frontend from CloudFront to Amplify Hosting (`frontend.tf`). The plan was 2 to add / 3 to
destroy; the 3 destroys (the empty web bucket, its public-access block, the CloudFront OAC — all created
minutes earlier by this same Terraform) succeeded. `aws_amplify_app` then **hung for 11+ minutes** with no
visible error; Terraform was stopped with SIGINT (state saved cleanly, no Amplify resource created). A
direct CLI probe explained it: `LimitExceededException: You have reached the maximum number of apps in this
account` (the AWS provider retries this silently). The account's one Amplify app slot is taken by a
**pre-existing app, `Daks-caption_VoiceAgent-video-editing` (appId `dnb761en5gcll`, created 2026-09-18
04:58 IST)**, connected to `github.com/sept1st2c/Daks-caption_VoiceAgent-video-editing`, branch `master`,
auto-build on. Its builds succeed (latest: PR #13, 2026-09-19 10:26 IST). It already has a correct
monorepo build spec (`appRoot: apps/web`, `npm run build --workspace=apps/web`) and an SPA rewrite, but **no
`VITE_API_URL` / `VITE_USE_FIXTURE` env vars** (only `AMPLIFY_DIFF_DEPLOY`, `AMPLIFY_MONOREPO_APP_ROOT`), so
the live site at `https://master.dnb761en5gcll.amplifyapp.com` calls `http://localhost:8010` (the default in
`apps/web/src/lib/api.ts`). That app was **not created, touched or modified by this work.**
Lesson: pipe `terraform apply` to a file, not through `grep`/`tail`, so a hang is visible.

### Decision after Incident 2 — reuse the existing Amplify app (owner's choice)
`frontend.tf` was **deleted**; Terraform no longer manages any frontend hosting. The editor is the existing
Amplify app; its origin is the `editor_url` variable (default `https://master.dnb761en5gcll.amplifyapp.com`),
used for the API's `CORS_ORIGINS` and printed as an output. To make that site talk to the deployed API the
Amplify app needs `VITE_API_URL=<api_url>` and `VITE_USE_FIXTURE=false` added to its environment variables
(keeping its two existing ones) and a rebuild. **Not done yet** — it needs the API URL, and it changes a live
app the teammate also uses (its site would call the deployed API instead of `localhost:8010`).

### Incident 3 — App Runner refuses this account too (2026-09-19)
Phase 3 (`terraform apply -var deploy_api=true`, plan: 1 to add) failed on `aws_apprunner_service.api`:
`SubscriptionRequiredException: The AWS Access Key Id needs a subscription for the service` (HTTP 400,
`CreateService`). Nothing was created (`terraform state list` still shows only ECR, IAM and the two data
sources). This is the same error class as Transcribe earlier, alongside CloudFront ("account must be
verified"), Bedrock ("operation not allowed" / "being verified") — **four services blocked on one
new-account verification**, while ECR, IAM, S3, DynamoDB and Amplify (older app) work. The likely root
cause is account-level (sign-up/payment-method verification or a pending support case), not anything in
this repo. Not yet confirmed with AWS. Next: fix at the account level (Support case; see Next Steps) or
deploy the API somewhere that is not gated (EC2 was raised as a workaround, not started).

**Resolved the same day:** the account was on the AWS **Free plan**, which AWS documents as "access to
select AWS services and features" (the Paid plan gives "access to all"). The owner upgraded to the Paid plan
(remaining credits stay). Re-probed with read-only calls: App Runner `list-services`, Transcribe
`list-transcription-jobs` and CloudFront `list-distributions` all succeeded. **Bedrock on the owner's own
account still returned `ValidationException: Operation not allowed`**, so the `FALLBACK_AWS_*` keys stay in
use. `terraform apply -var deploy_api=true` then created the App Runner service (4m39s).

### Incident 4 — the instance role was missing `dynamodb:Scan` (2026-09-19)
`GET /projects` on the deployed API returned **500**; the App Runner application log showed
`AccessDeniedException ... not authorized to perform: dynamodb:Scan`. `store/projects.py:348`
(`list_projects`) calls `scan`, and the first draft of `iam.tf` did not grant it — **the earlier claim in
this audit that the permissions were "derived from every call site" was wrong**: the first grep missed the
`scan`. Fixed by re-enumerating every DynamoDB/S3 call (`get_item`, `put_item`, `update_item`, `query`,
`scan`; S3 `head_object`, `download_file`, `upload_file`, presigned POST/GET) and applying an in-place IAM
change (1 changed, 0 added, 0 destroyed). Also added `s3:AbortMultipartUpload` (`upload_file` goes multipart
on large files) and removed `dynamodb:DeleteItem` (no call site). IAM's own `simulate-principal-policy`
reported `Scan`/`Query`/`GetItem` as allowed immediately, but the running service kept returning
AccessDenied for **about three minutes** before `GET /projects` returned 200 (IAM propagation). Lesson: the
smoke test found what the plan review missed — always hit a list/scan route, not only `/health`.


### Phase 02 — Voice: LiveKit Cloud + the STT worker on ECS Fargate (2026-09-19)
**What was asked:** "deploy the LiveKit server". **What that meant in practice:** the owner's keys are for
**LiveKit Cloud** (`LIVEKIT_URL` is `wss://…livekit.cloud`, key length 15, secret length 44, neither is the
`devkey`/`secret` dev placeholder), so LiveKit already hosts the server and nothing of it is deployed by us.
What was deployed is the **voice worker** (`services/voice-agent`, `CMD python worker.py start`): a process
that joins a room, transcribes the browser mic with AWS Transcribe *streaming*, and sends text back on
`lk.transcription`. It serves no port and takes no inbound traffic, so it runs as **one Fargate task, no load
balancer** (App Runner does not fit; the worker README says the same).

Built by `infra/terraform/voice.tf` (9 resources in stage A, 2 in stage B, plus 1 in-place change):
- ECR `expressive-captions-voice` (+ lifecycle), CloudWatch log group `/ecs/expressive-captions-voice` (7 days),
  ECS cluster `expressive-captions`, security group `expressive-captions-voice` (**egress only, no ingress**),
  default-VPC public subnets with a public IP (no NAT gateway).
- IAM: `expressive-captions-voice-execution` (AmazonECSTaskExecutionRolePolicy) and
  `expressive-captions-voice-task` with `transcribe:StartStreamTranscription` (+`…WebSocket`) on `*`.
  **The worker uses the default credential chain, not `aws_fallback.py`, so streaming Transcribe runs on the
  owner's own account** — this worked, unlike batch Transcribe before the Paid-plan upgrade.
- Task definition (0.5 vCPU / 1 GB, X86_64) with env `LIVEKIT_URL/KEY/SECRET`, `VOICE_STT_LANGUAGE=en-IN`,
  `AWS_REGION`; ECS service, `desired_count=1`, `deployment_minimum_healthy_percent=0`.
- App Runner: `enable_livekit_on_api=true` adds `LIVEKIT_URL/KEY/SECRET` to the API's env (in-place update).
- `deploy_api` and `deploy_voice` now default to **true** so a plain `terraform apply` can no longer destroy the
  running API or worker (they only existed as `false` for the very first from-scratch apply).

**Order mattered, on purpose:** worker first, API keys last. With keys on the API but no worker, the browser
gets a token, connects, and shows "listening" while no transcript ever returns — the editor only falls back to
browser speech recognition when the LiveKit *connection* fails (`apps/web/src/hooks/useVoiceInput.ts:264-275`).
Verified sequence: image pushed → stage B applied → worker log shows `registered worker` (url
`wss://voice-edited-captions-naurgd4k.livekit.cloud`) → only then `enable_livekit_on_api=true`.

**Verified against the real deployed stack:**
- Worker log: `starting worker` (livekit-agents 1.8.2), `HTTP server listening on :8081`, `registered worker`.
- `POST /agent/livekit-token` on the deployed API → returns `{token, url}`, token is a JWT (not printed).
- `services/voice-agent/scripts/check_voice_e2e.py` run with `--api https://pbmw8mk9j9.ap-south-1.awsapprunner.com
  --url wss://…livekit.cloud`, phrase "make that line angry" rendered by Polly (16 kHz PCM, 51,600 bytes) on the
  owner's account: `agent joined: agent-AJ_zx6dKQns4ZMM`, 5 interim segments, then
  **`PASS: … final transcript 'Make that line angry.'`**, exit 0. That exercises: token minting through the
  deployed API (so the LiveKit key/secret are right), LiveKit Cloud signalling/RTC, automatic agent dispatch to
  the Fargate worker, streaming Transcribe on the owner's account, and `lk.transcription` forwarding.

**NOT verified:** a real browser microphone on the Amplify site; real Indian/Hinglish speech (the test phrase is
synthesised English; the language is `en-IN`, and `hi-IN` streaming quality is undocumented — see ONBOARDING §5);
that the agent then executes the resulting command end to end from the deployed editor; long-running behaviour
(Fargate restarts, LiveKit Cloud plan limits/minutes).

**New risks introduced by this phase:**
- `POST /agent/livekit-token` was harmless while it answered 503. **It is now live and unauthenticated**
  (ONBOARDING §4 item 1): anyone with the API URL can mint a token for any room name and the worker
  auto-dispatches into it, so a stranger can consume LiveKit Cloud minutes and streaming-Transcribe spend.
  Not mitigated here; needs P1/P4 (auth or a room-name allow-list) before any public exposure.
- LiveKit key/secret are plain env vars in the ECS task definition, in the App Runner service, and in the local
  Terraform state (git-ignored) — same trade-off the owner chose for the fallback keys. Rotate after the event.
- **The local Docker voice stack now mismatches the root `.env`:** `docker-compose.yml` starts a local LiveKit
  dev server (accepts only `devkey`/`secret`) and forces the worker's `LIVEKIT_URL=ws://livekit:7880`, while the
  root `.env` now holds LiveKit Cloud keys. Anyone running voice locally through compose must use matching
  values or comment the `LIVEKIT_*` lines. Not changed here (compose is not this phase's file).
- `VOICE_STT_LANGUAGE` is still **missing from the owner's root `.env`** (the deployed worker gets `en-IN` from
  Terraform). Local runs will refuse to start until it is set.
- Cost: Fargate 0.5 vCPU / 1 GB, always on, roughly $0.60/day (estimate from public pricing, not measured).

## Objective
Put the app on the **owner's own AWS account (451513981733, ap-south-1)** for the hackathon demo
(~1.5 days), using Terraform instead of console clicking so that everything is reproducible and one
`terraform destroy` removes it. Scope is the MVP path only:

| Part | Where | Why |
|---|---|---|
| API (`services/api`) | AWS App Runner, image from ECR | free HTTPS; `Dockerfile` already runs on `$PORT`; `/health` exists |
| Editor (`apps/web`) | the **existing** Amplify app (auto-deploys GitHub master) — *originally* S3 + CloudFront, see Incidents 1–2 | HTTPS + SPA routing already in place |
| Voice / LiveKit | **not deployed** | `LIVEKIT_*` unset → `/agent/livekit-token` answers 503 and the editor falls back to browser speech recognition (a supported path, per `services/voice-agent/README.md`) |
| Export | nothing to deploy | `/projects/{id}/render` returns 501 in the repo |

## Implementation
Branch `divue/deploy`, cut from `master` at `da87410`. All new code is under `infra/terraform/`.
Resources created by `terraform apply` (plan output, verified):

- **ECR**: `expressive-captions-api` (+ lifecycle policy: keep 5 images, `force_delete` for destroy).
- **IAM**: `expressive-captions-apprunner-access` (App Runner pulls from ECR) and
  `expressive-captions-api-instance` (what the running container's boto3 uses).
- **Frontend**: *none any more.* The first design (private S3 + CloudFront) and the second (a Terraform-made
  Amplify app) both failed on account limits; `frontend.tf` was deleted. See Incidents 1–2.
- **App Runner** `expressive-captions-api` (1 vCPU / 2 GB, port 8000, health check `/health`,
  auto-deploy off). **Created only when `-var deploy_api=true`**, because the image must be in ECR first.

Two-phase apply, by design: (1) `terraform apply` with `deploy_api=false` → ECR + IAM;
(2) push the image; (3) `terraform apply -var deploy_api=true` → App Runner.

### Instance-role permissions — derived from the real call sites, not guessed
| Permission | Source in `services/api/app` |
|---|---|
| `s3:GetObject`, `s3:PutObject`, `s3:AbortMultipartUpload` on `bucket/p1/*` | `s3.py`: `download_file`, `upload_file`, presigned POST/GET signing (the signer needs Put/Get) |
| `s3:ListBucket` on the bucket | `s3.py::exists()` treats only 404/NoSuchKey as "missing"; without ListBucket S3 returns **403** for a missing key and `exists()` would raise |
| `dynamodb:GetItem/PutItem/UpdateItem/Query/Scan` on the table **and** `table/index/*` | `store/jobs.py`, `store/projects.py` (incl. `list_projects` → `scan`, line 348), `costs.py`; the `byDay` GSI is used by `costs.py` `query`. **`Scan` was missing at first — Incident 4.** |
| `rekognition:DetectLabels` on `*` | `agent/tools/vision_tools.py:203` (no resource-level permission exists for this action) |
| *(none)* Bedrock, Transcribe | `pipeline/stt.py`, `pipeline/semantics.py`, `agent/bedrock_client.py` all go through `aws_fallback.client()` → borrowed keys, not the role |

No `DeleteItem`: the code never deletes items.

### Changes made to AWS resources OUTSIDE Terraform (teammates: read this)
| Resource | Change | How | Undo |
|---|---|---|---|
| Amplify app `dnb761en5gcll` (auto-deploys GitHub master) | added env vars `VITE_API_URL=https://pbmw8mk9j9.ap-south-1.awsapprunner.com`, `VITE_USE_FIXTURE=false` (kept `AMPLIFY_DIFF_DEPLOY=false`, `AMPLIFY_MONOREPO_APP_ROOT=apps/web`); started rebuild job 14 (SUCCEED) | `aws amplify update-app` / `start-job` | remove the two vars, rebuild. **Effect: that site now talks to the deployed API instead of `localhost:8010`, for everyone.** |
| S3 media bucket `expressive-captions-divue-k7m2x9` | CORS rule now allows `http://localhost:5173` and `https://master.dnb761en5gcll.amplifyapp.com` | `services/api/scripts/setup_aws.py` with `EXTRA_S3_ORIGINS` | re-run the script without the extra origin |

## Files Created
- `infra/terraform/versions.tf` — provider pin (`aws >= 5.40`), region, default tags, local state note
- `infra/terraform/variables.tf` — inputs; the two fallback keys are `sensitive`, read from `TF_VAR_*`
- `infra/terraform/ecr.tf` — ECR repo + lifecycle policy
- `infra/terraform/iam.tf` — the two roles and the instance policy above
- `infra/terraform/apprunner.tf` — the API service, env vars, health check
- `infra/terraform/outputs.tf` — ECR URL, editor URL, frontend bucket, distribution id, API URL
- `infra/terraform/voice.tf` — voice worker: ECR, ECS cluster/task/service, security group, log group, IAM (Phase 02)
- `infra/terraform/.terraform.lock.hcl` — provider lock file (**commit this one**)
- `.claude/audits/deploy/phase-01-terraform-aws-deploy.md` — this file

## Files Modified
- `infra/terraform/variables.tf`, `apprunner.tf`, `outputs.tf` — Phase 02: LiveKit + voice variables, optional `LIVEKIT_*` on the API, voice ECR output; `deploy_api`/`deploy_voice` default true.
- `.gitignore` — additive: `infra/terraform/.terraform/`, `*.tfstate`, `*.tfstate.*`, `*.tfvars`
  (state contains the fallback keys in plaintext, so it must never be committed).

## Files Intentionally Untouched
- `services/api/**` (P1 pipeline, P4 agent), `apps/web/**` (P3), `remotion/**` (P2), `packages/shared/**`
  (lead): **zero application code changes**. The deploy needs none — config is all environment variables
  that `app/config.py` already reads.
- `.env` and `.env.example`: not edited and not read for values. The fallback keys stay in the owner's
  `.env` for local dev; for deploy the owner exports them into the shell as `TF_VAR_*`.
- The existing S3 media bucket and DynamoDB table: **referenced by name only, never imported or managed**
  by Terraform, so `terraform destroy` cannot delete the project data.

## Architecture
```
browser ──HTTPS──▶ existing Amplify app (builds GitHub master)        [NOT managed here]
   │
   └──HTTPS (VITE_API_URL)──▶ App Runner (ECR image, services/api)        [NEW infra, REUSED image/code]
                                 ├─ instance role ─▶ S3 media bucket (p1/*), DynamoDB, Rekognition   [existing resources]
                                 └─ FALLBACK_AWS_* keys ─▶ Bedrock + Transcribe on the teammate's account
browser ──presigned POST──▶ S3 media bucket   (needs the Amplify origin in the bucket's CORS)
```

## Interfaces / Contracts
Env vars passed to the container — names checked against `app/config.py` (`REQUIRED` = `AWS_REGION`,
`S3_BUCKET`, `DYNAMO_TABLE`, `DEV_PREFIX`, `BEDROCK_MODEL_ID`) and `app/aws_fallback.py`:
`AWS_REGION`, `S3_BUCKET`, `DYNAMO_TABLE`, `DEV_PREFIX=p1`, `BEDROCK_MODEL_ID`, `CORS_ORIGINS`
(= the `editor_url` variable, the Amplify URL), and — only when set — `FALLBACK_AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY`.
No `AWS_ACCESS_KEY_ID` is set on purpose: S3/DynamoDB/Rekognition use the instance role.
`SARVAM_API_KEY` is deliberately not set (owner's decision): the pipeline falls back to Transcribe +
Bedrock romanisation, exactly as `config.py` documents.
**`DEV_PREFIX` must stay `p1`**: the teammate's inline S3 read grant for Transcribe is scoped to
`arn:aws:s3:::expressive-captions-divue-k7m2x9/p1/*`.

## Ownership
`CLAUDE.md`'s ownership table has no row for infrastructure. `infra/` is new and was created on the
owner's own branch at their direction. **The lead must be told before this merges**: it adds a top-level
folder, edits the root `.gitignore`, and runs the API against borrowed credentials.
The borrowed keys belong to the teammate's account (632127306260, IAM user `shubh-2`); putting them on a
running service on another account should be agreed with them.

## Validation
- `terraform validate`: passes. `terraform fmt -check`: clean.
- `terraform plan`: 11 to add / 0 to change / 0 to destroy. No plan errors.
- Failure modes: App Runner fails to start if the image tag isn't in ECR (hence the two-phase apply);
  the API exits at boot if any `REQUIRED` env var is missing (all five are set by `apprunner.tf`).

## Security
- **The API has no authentication** (MVP rule in `CLAUDE.md`). Once deployed, anyone with the App Runner
  URL can upload and trigger paid Bedrock/Transcribe calls. Mitigations: the URL is unguessable-ish but
  not secret; usage is capped by `MAX_CLIP_SECONDS`/`max_upload_bytes`; the deployment is meant to be
  destroyed right after the hackathon. **No budget alert was set up — the owner decided to skip it.**
- The fallback keys are stored as **plain App Runner environment variables** (owner's choice over Secrets
  Manager), so anyone with console access to the account can read them, and they are in the local
  Terraform state file (git-ignored). They belong to the teammate's account: rotate after the hackathon.
- `terraform apply` ran under the IAM user `captions-dev` after `AdministratorAccess` was attached by the
  owner from root. That user's access key was exposed in chat earlier (rotation deferred by the owner).
  **Detach `AdministratorAccess` after deploy** so the exposed key returns to its narrow scope.
- Known from `ONBOARDING.md` §4: `/agent/livekit-token` has no auth (moot while `LIVEKIT_*` is
  unset → 503) and `/demo-media/*` fails closed in the production image (no clips are copied into it).
- Presigned URLs are signed with the instance role's temporary credentials, so they can stop working
  earlier than their nominal 900 s / 3600 s expiry if the role session ends first. Unverified — watch for
  it during the smoke test.

## Testing
Run so far (all against local files or read-only AWS calls):
- `terraform fmt -check -diff` → no diff.
- `terraform init` → success, provider installed.
- `terraform validate` → "The configuration is valid."
- `terraform plan` → `Plan: 11 to add, 0 to change, 0 to destroy.`
No application test suite was run: no application code was changed.

Against the **deployed** stack (real network calls, 2026-09-19):
- `GET /health` → 200 `{"ok":true}`. App Runner `list-services` → `RUNNING`.
- `OPTIONS /health` with `Origin: https://master.dnb761en5gcll.amplifyapp.com` → 200 and
  `access-control-allow-origin` echoes that origin.
- `GET /costs?from=2026-09-18&to=2026-09-19` → 200 with real data (24 events, 5 projects, ~$0.12 total).
- `GET /projects` → 500 (Incident 4), then 200 with the owner's real earlier projects after the IAM fix.
- Amplify site `/` → 200; the built JS chunk `usePipelineStatus-*.js` contains
  `pbmw8mk9j9.ap-south-1.awsapprunner.com` and **no** `localhost:8010`.
- Amplify `/editor` → 301 → `/editor/` → **status 404 but the body is the 1,810-byte `index.html`** (the app's
  page is served, only the status code is wrong). Cause not investigated; the app's SPA rewrite on that Amplify
  app is the pre-existing `/<*>` → `/index.html` `404-200`. Whether a browser renders the editor correctly at
  that URL is **unverified** (no browser was driven).

## Live Verification
- **Verified against real live AWS services:** everything listed under Testing → "Against the deployed stack";
  ECR image present (`describe-images`: 413,981,851 bytes); App Runner service RUNNING; DynamoDB reads via the
  instance role (`/costs`, `/projects`); bucket CORS contents read back with `get-bucket-cors`; Amplify job 14
  SUCCEED and env vars read back.
- **Verified from AWS documentation:** App Runner is offered in `ap-south-1`; Free plan vs Paid plan access.
- **NOT verified:** (1) a real upload: presigned POST from a browser to S3 with the Amplify origin;
  (2) the pipeline (audio → Transcribe → Bedrock tagging → build) running on App Runner — including whether
  App Runner throttles CPU for the in-process background job; (3) `hi-IN` Transcribe + Bedrock from App Runner
  with the borrowed keys (worked locally on 2026-09-19); (4) presigned GET URLs signed with the role's
  temporary credentials living their full 3600 s; (5) the deployed editor rendered in a real browser.

## Unverified / Untestable
- Whether App Runner throttles CPU enough to stall the in-process pipeline job (jobs run as FastAPI
  `BackgroundTasks`; the editor polls status, which should keep the instance active). Only the smoke test
  will tell. If it stalls, raise it as a P1 issue rather than working around it here.
- Whether `hi-IN` Transcribe and Bedrock work from the deployed service with the borrowed keys — worked
  locally on 2026-09-19 (pipeline run on branch `p1-aws-fallback`), not yet from App Runner.
- The exact monthly cost. App Runner at 1 vCPU/2 GB is estimated at roughly $10–25/month; this is an
  estimate from memory of public pricing, not measured.

## Integration Status
| Piece | State |
|---|---|
| Terraform code | written, validated, applied |
| ECR + IAM roles/policy | connected (created; policy corrected in Incident 4) |
| API image `expressive-captions-api:v1` | connected (pushed, verified) |
| App Runner service | connected — RUNNING, `/health`, `/costs`, `/projects` verified |
| Editor (existing Amplify app) | connected — rebuilt against the API; **browser rendering unverified** |
| Media-bucket CORS for the Amplify origin | connected (read back) |
| Upload → pipeline → edit → reload on the deployed stack | **not tested** |
| Voice: LiveKit Cloud + worker on Fargate | **connected and end-to-end tested with synthesised speech** (Phase 02); real browser mic **not tested** |
| `POST /agent/livekit-token` | live and **unauthenticated** — see Phase 02 risks |
| Bedrock on the owner's own account | still blocked (`Operation not allowed`); deploy uses the fallback keys |
| Transcribe on the owner's own account | now accessible after the Paid-plan upgrade, but the deploy still routes it through the fallback keys (`aws_fallback.py` covers both services together) |

## Dependencies / Blockers
- Lead: agree to an `infra/` folder and the `.gitignore` change before merging to master.
- Teammate (`shubh-2`, account 632127306260): agree that his keys run on a deployed service; rotate later.
- Owner: `terraform apply` needs their explicit yes at each phase (billable resources).

## Deviations
Three changes from the first plan, all forced by account limits (Incidents 1–3): the editor moved from
Amplify → S3 + CloudFront → **the pre-existing Amplify app**; and the API's App Runner target is currently
**blocked** (Incident 3). Each choice was made by the owner.

## Git / Change Scope
Branch `divue/deploy` off `master@da87410`. Uncommitted. `git status` shows only: modified `.gitignore`,
new `infra/` and new `.claude/audits/deploy/`. No unrelated changes were present or introduced.

## Runbook
Prerequisites: Terraform ≥ 1.5, AWS CLI with a profile that has admin rights on the account, Docker.
All paths are from the repo root. `<acct>` = `451513981733`, region `ap-south-1`.

```bash
# 0. once
cd infra/terraform && terraform init

# 1. ECR + IAM (App Runner not created yet)
terraform apply

# 2. build + push the API image (production image: no dev deps; must be linux/amd64)
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t $(terraform output -raw ecr_repository_url):v1 ../../services/api
docker push  $(terraform output -raw ecr_repository_url):v1

# 3. App Runner. Export the borrowed keys in YOUR shell first; never put them in a file or in chat.
export TF_VAR_fallback_aws_access_key_id=...      # from your .env
export TF_VAR_fallback_aws_secret_access_key=...
terraform apply -var deploy_api=true
terraform output api_url

# 4. point the existing Amplify app (dnb761en5gcll) at the deployed API and rebuild it.
#    update-app REPLACES all env vars, so send the two existing ones back too.
aws amplify update-app --app-id dnb761en5gcll --region ap-south-1 --environment-variables \
  AMPLIFY_DIFF_DEPLOY=<existing>,AMPLIFY_MONOREPO_APP_ROOT=<existing>,VITE_API_URL=<api_url>,VITE_USE_FIXTURE=false
aws amplify start-job --app-id dnb761en5gcll --branch-name master --job-type RELEASE --region ap-south-1

# 5. let the Amplify origin upload to the media bucket (this REPLACES the bucket's CORS list;
#    setup_aws.py merges CORS_ORIGINS from .env with EXTRA_S3_ORIGINS, so localhost stays allowed)
cd ../../services/api && set -a && . ../../.env && set +a
EXTRA_S3_ORIGINS=$(cd ../../infra/terraform && terraform output -raw editor_url) .venv/bin/python scripts/setup_aws.py

# roll out a new image later: push with a new tag, then
terraform apply -var deploy_api=true -var image_tag=v2

# teardown (does NOT touch the media bucket, the DynamoDB table, or its CORS list)
terraform destroy -var deploy_api=true
```

### Voice runbook (Phase 02)
```bash
# secrets are read from the repo .env into THIS shell only (nothing printed, nothing written)
export TF_VAR_livekit_url=...  TF_VAR_livekit_api_key=...  TF_VAR_livekit_api_secret=...   # from .env
# stage A: ECR, cluster, roles, security group (deploy_voice=false only on a from-scratch first apply)
terraform apply -var deploy_voice=false
# build + push the worker image (build context has no .env, so no secrets are baked in)
docker build -t <acct>.dkr.ecr.ap-south-1.amazonaws.com/expressive-captions-voice:v1 ../../services/voice-agent
docker push  <acct>.dkr.ecr.ap-south-1.amazonaws.com/expressive-captions-voice:v1
# stage B: the ECS task + service
terraform apply
# confirm "registered worker" BEFORE giving the API the keys
aws logs tail /ecs/expressive-captions-voice --region ap-south-1 --since 10m
# only then, and only once the worker is verified:
terraform apply -var enable_livekit_on_api=true
# end-to-end check against the deployed stack (speech.pcm from Polly, see check_voice_e2e.py's docstring)
docker run --rm -v <dir with speech.pcm>:/data <voice image> python scripts/check_voice_e2e.py \
  --api https://<api_url> --url wss://<project>.livekit.cloud --pcm /data/speech.pcm --timeout 30
# roll the worker: push a new tag, then  terraform apply -var voice_image_tag=v2
# turn voice off (browser falls back):   terraform apply -var enable_livekit_on_api=false
```
Note `enable_livekit_on_api` defaults to false, so a later plain `terraform apply` **removes** the LiveKit
vars from the API and voice silently falls back to the browser. Pass `-var enable_livekit_on_api=true` every
time, or change its default (not done, so the safe state stays the default).

## Next Steps
1. Test voice with a **real browser microphone** on `https://master.dnb761en5gcll.amplifyapp.com` (Chrome/Edge),
   then a full command: speak → transcript → agent patch → caption changes. — owner + teammates
2. Run the real upload → pipeline → edit → reload smoke test on the deployed stack. — owner + Claude session
3. **Protect `POST /agent/livekit-token`** (auth or room allow-list) before sharing the URL widely. — P1 / P4
4. Add `VOICE_STT_LANGUAGE=en-IN` to the root `.env`; align `docker-compose.yml` voice settings with the Cloud
   keys for local runs. — owner / P4
5. **Detach `AdministratorAccess` from `captions-dev`**, and rotate the exposed `captions-dev` key. — owner
6. Once Bedrock works on the owner's own account, drop the two `FALLBACK_AWS_*` values and re-apply, then ask
   the teammate to rotate the borrowed keys. — owner / teammate
7. Tell the lead about `infra/`, the `.gitignore` change, the Amplify env-var change and the always-on
   Fargate worker. — owner
8. After the event: `terraform destroy` (does not touch the media bucket or table), remove the two Amplify
   env vars, rotate the LiveKit keys. — owner
