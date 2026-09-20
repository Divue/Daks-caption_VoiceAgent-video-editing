# New deploy (v2 stack) — Phase 03 Audit

Branch `divue/new-deploy` (off `master` at `0611fa5`, Shubh's latest). Owner: Divue. Written 2026-09-20.

## Status
**DEPLOYED AND VERIFIED END TO END** in account `<account-id>`, `ap-south-1`, as a second stack **next to** the old one
(`infra/terraform`; untouched during the build and **destroyed afterwards** in Phase 03b at the owner's request). Verified against the real deployed services in a real Chrome: open editor →
upload a clip → real pipeline → captions → **Export** → downloaded MP4 with captions burned in; and **voice** (fake mic playing
Polly speech) → LiveKit Cloud → the new Fargate worker → transcript → agent → saved caption change. Nothing here is mocked.
Delivered as a pull request from `divue/new-deploy` to `master` (see "Git / Change Scope").

| Piece | URL / name |
|---|---|
| API (App Runner) | https://pra22j2hgp.ap-south-1.awsapprunner.com |
| Editor (Lambda Function URL) | https://4ofryng45bbr7en765off7otja0yuamo.lambda-url.ap-south-1.on.aws |
| Render server | ECS Fargate `captions-v2-render`, behind an INTERNAL ALB (hostname omitted; see `terraform output render_alb`) |
| Voice worker | ECS Fargate `captions-v2-voice` (registered with LiveKit Cloud) |
| Second editor address | Amplify `https://master.dnb761en5gcll.amplifyapp.com` — repointed to the new API (see Phase 03b) |
| Old stack | **Destroyed 2026-09-20** (Phase 03b). Its Terraform stays in `infra/terraform/` for history only |

## Objective
The owner asked for a fresh, fully working deployment of everything on current `master` (which added **Export**: a Remotion render
server, image layers, and new agent tools), without touching the old deployment, with cost not a concern (~10 h window, $99 credit).
The old stack could not simply be redeployed: Export needs a render server that nothing deployed, and the account has since
turned out to have restrictions (below), so the new stack is a separate root module.

## Implementation
`infra/new-deploy/` is a **separate Terraform root** with its own local state and a `captions-v2-` name prefix (`var.name`), so no
resource can collide with, be modified by, or be destroyed with the old stack. 53 managed resources:

```
 browser ──HTTPS──> Lambda Function URL (editor, static files)
    │
    └──HTTPS──> App Runner  captions-v2-api ── VPC connector ──┐   (all API egress now goes through the VPC)
                   │  S3 / DynamoDB / Rekognition (instance role)       │
                   │  Bedrock + Transcribe (borrowed FALLBACK_AWS_* keys)│
                   │                                                     ▼
                   │                         private subnets ── NAT gateway ──> internet
                   └── http ──> INTERNAL ALB :80 ──> Fargate captions-v2-render :3100   (SG: only the API connector may reach it)
 browser ──wss──> LiveKit Cloud <──── Fargate captions-v2-voice (outbound only)
```
- **Network** (`network.tf`): new VPC `10.20.0.0/16`, 2 public + 2 private subnets, IGW, **one NAT gateway**, 4 security groups.
  A VPC is required because the render server has no auth and must not be public; App Runner can reach a private service only via a
  VPC connector, and a VPC connector sends ALL the API's outbound traffic through the VPC, so the private subnets need NAT or the API
  could not reach S3, DynamoDB, Bedrock or Transcribe.
- **API** (`api.tf`): App Runner + VPC connector. Env as the old stack plus `RENDER_SERVICE_URL=http://<alb>` and `CORS_ORIGINS`
  (localhost + the Lambda editor origin). `FALLBACK_AWS_*` and `LIVEKIT_*` come from `TF_VAR_*` exported from `.env` (never written to a file).
- **Render** (`render.tf`): internal ALB (idle timeout **4 s**, see Incident 5), target group with a deliberately lenient health
  check (the server blocks its event loop for 20–40 s while bundling), Fargate task 2 vCPU / 4 GB, grace period 300 s.
  The image is **Shubh's `remotion/Dockerfile`, unmodified** (Devanagari + emoji fonts, Chrome baked in).
- **Voice** (`voice.tf`): Fargate in the private subnets, task role with streaming Transcribe. Same image source as before.
- **Editor** (`editor.tf`, `editor_site/handler.py`, `package_editor.py`): the built `apps/web/dist` is zipped with a 90-line
  Python handler into a Lambda behind a **Function URL** (HTTPS, AWS-owned certificate, no domain needed — required because browsers
  block the microphone on plain HTTP). The handler serves GET/HEAD only, falls back to `index.html` for client routes, 404s missing
  `/assets/*`, gzips text types, and resolves paths with `realpath` + prefix check (traversal cannot leave `site/`).
- **IAM** (`iam.tf`): same permissions as the old stack, **plus `rekognition:DetectFaces`** (new agent tool "stickers on faces",
  `vision_tools.py`). All other AWS calls in the new code paths were checked against source (`grep` of every client call) and are
  covered: emoji upload and layer media write under `p1/<project>/…`.
- **Shared with the old stack, on purpose:** the S3 media bucket, DynamoDB table and the `p1` prefix. Shubh's read grant for
  Transcribe is scoped to exactly `…/p1/*` on that bucket, so a new bucket would silently break transcription. Consequence: both
  stacks see the same projects.

## Files Created
- `infra/new-deploy/{versions,variables,network,ecr,iam,api,render,voice,editor,outputs}.tf` — the stack
- `infra/new-deploy/.terraform.lock.hcl` — provider pin (copied from the old stack)
- `infra/new-deploy/editor_site/handler.py` — the Lambda static file server
- `infra/new-deploy/package_editor.py` — builds `editor.zip` from `apps/web/dist` (fixed timestamps → stable plan)
- `infra/new-deploy/.gitignore` — `.terraform/`, `*.plan`, `editor.zip`
- `remotion/Dockerfile.dockerignore` — **outside `infra/`; flagged.** BuildKit reads only `<Dockerfile>.dockerignore` (or a root
  `.dockerignore`); Shubh's `remotion/.dockerignore` is NOT read when building from the repo root, so without this the context
  (including `.env` and `node_modules`) is sent to the daemon. It changes nothing in his image.
- `.claude/audits/deploy/phase-03-new-deploy.md` — this file

## Files Modified
None tracked. (`master`'s `0611fa5` was fast-forwarded into this branch first; that is Shubh's merge, not my change.)

## Files Intentionally Untouched
- `infra/terraform/**` (the old stack's code) — 0 tracked files changed, still in git for history. (While this phase ran, the old stack itself was left untouched; it was destroyed afterwards in Phase 03b, at the owner's request.)
- All application code (`services/`, `apps/web`, `remotion/*` except the ignore file). Shubh's `remotion/Dockerfile` was used as is.
- (During the build) the old Amplify app, ECR repos and IAM roles; see Phase 03b for what happened afterwards.

## Interfaces / Contracts
Terraform variables (`variables.tf`): `name`, `aws_region`, `s3_bucket`/`dynamo_table`/`dev_prefix` (shared, defaults = current), `bedrock_model_id`,
`fallback_aws_*`, `livekit_*` (sensitive; from `TF_VAR_*`), `deploy_services` (two-stage rollout switch), `api_image_tag`/`voice_image_tag`/`render_image_tag`,
`extra_cors_origins`. Outputs: `api_url`, `editor_url`, `ecr_api|voice|render`, `render_alb`.
API contract unchanged; the API now needs `RENDER_SERVICE_URL` (set) to serve Export.

## Ownership
`infra/` is not in CLAUDE.md's ownership table (flagged before). Touches P2's folder with one new ignore file. Uses the P1 API image, the
P4 voice worker and the P2 render server as built by their owners. No schema change. Lead should be told about the new stack.

## Validation
`terraform validate` clean; `terraform fmt` applied; final `terraform plan -detailed-exitcode` → **exit 0, "No changes"** (no drift). Handler unit-checked locally
against the real packaged files (9 cases: `/`, client route, gzip asset, missing asset 404, two traversal attempts, `HEAD`, `POST` 405, favicon).

## Security
- **Render server has no auth** (Shubh's `DEPLOYING-EXPORT.md` flags this as the blocker for exposing it). Here it is private: internal ALB in private
  subnets, SG chain API-connector → ALB:80 → task:3100; nothing else can reach it. It still fetches whatever URL the API hands it — the API only passes
  presigned URLs for the project's own video and media.
- **The API still has no authentication** (MVP rule) and `POST /agent/livekit-token` is open — anyone with the API URL can spend Bedrock/Transcribe money on the
  borrowed account. Unchanged from the old stack.
- Secrets: `FALLBACK_AWS_*` and `LIVEKIT_*` are plain App Runner/ECS env vars and are in the **local Terraform state** (`infra/new-deploy/terraform.tfstate`,
  git-ignored by the repo-wide `*.tfstate*` rule). Plan files were deleted after use. `.env` was read only via `set -a; . .env` into the shell; never printed.
- Media bucket CORS was changed **additively** (see below). Editor bucket does not exist (Lambda); the Function URL is public by design (static files only).
- CORS verified: preflight from the editor origin → 200 with the matching `access-control-allow-origin`; from `https://evil.example` → 400.
- Cost/abuse: no budget alert (owner's earlier decision). Estimated run rate ≈ **$0.25/h (~$6/day)** — NAT ~$0.045/h, render task ~$0.10/h,
  voice task ~$0.025/h, ALB ~$0.023/h, App Runner and Lambda small. **This is an estimate from list prices, not a measured bill.**

## Testing
On the merged code (`0611fa5`), run 2026-09-20:
- `cd apps/web && npx tsc -b` → clean; `npm run check:agent` → All checks passed; `npm run check:captions` → All checks passed.
- `pytest tests/ -q` in the API dev image, source mounted read-only, moto (no real AWS) → **130 passed**.
- Render image, **locally, before any push**: 6 s and 8 s test clips (478×850, 720×1280) rendered to H.264/AAC at the source size and fps, with the default
  64 MB `/dev/shm` (Fargate cannot raise it); a frame at a spoken word showed the burned-in caption in the editor's italic serif.
- Earlier on `ea1ed3a`: 95→127 pytest, all 12 agent check scripts, voice-agent unit test (not re-run on `0611fa5`, but `services/voice-agent` did not change in that pull).

## Live Verification
**Against the real deployed stack:**
- `GET /health`, `GET /projects` (real DynamoDB through the VPC/NAT), `GET /costs`, `POST /agent/livekit-token` (422 on `{}` = LIVEKIT env present).
- **Export via the API on an existing project** (`b2bab5764df4`, 23.5 s, 720×1280, 95 words): rendered through App Runner → VPC → ALB → Fargate → presigned
  S3 video → MP4 back to S3; downloaded, `ffprobe`: h264 720×1280 30 fps + aac, 10.5 MB, ~2.5 min.
- **Full browser flow (Playwright + real Chrome, deployed editor URL):** upload the 23 s clip (`POST /projects` → S3 presigned POST → `POST …/process`) →
  real **Transcribe + Bedrock** pipeline (borrowed keys) → editor with 95 words / 36 blocks, Dhamaka preset, real video → **Export** → "Your video is ready" →
  downloaded MP4 (10.7 MB, 720×1280 h264/aac); frame at 1.0 s shows the title layer and the word-by-word caption burned in. New project `6f2ea8bfd891`.
- **Voice, real Chrome with a fake microphone playing Polly speech "make the captions bigger":** `POST /agent/livekit-token` → LiveKit Cloud; status
  "**Listening (LiveKit)**" (not the browser fallback); transcript "Make the captions bigger."; `POST /agent/voice-command` 200 → `set_preset_override`
  (`baseFontSize` 72) → `PATCH /projects/6f2ea8bfd891` 200 → "Done!". CloudWatch shows the job was received by **`captions-v2-voice` (1) and not by the old worker (0)**.
- **Typed agent command "put a fire emoji on her face":** `place_sticker` ran, face found in 23 of 24 sampled moments, `PATCH` 200. No `AccessDenied` in the API log group.
- Zero console errors / page errors in the voice and typed runs; one aborted `blob:` request in the upload run (the browser cancelling its local preview on navigation).
- Old stack at that time: old `/health` 200, Amplify editor 200, both App Runner services `RUNNING` (superseded by Phase 03b).

## Unverified / Untestable
- A **real human microphone** and real accents (the fake mic replays synthesized speech; Hinglish speech quality with `VOICE_STT_LANGUAGE=en-IN` is untested).
- Which of Rekognition vs. the Bedrock-vision fallback produced the face boxes (the log has no `AccessDenied`, but the code can fall back silently).
- Safari/Firefox/mobile; more than one concurrent export (the render server is one-at-a-time by design); clips near the 90 s limit; load.
- `terraform destroy` for this stack has not been run.
- Whether `enableMultiProcessOnLinux` + the frame timeouts hold on longer clips than 23.5 s on Fargate.
- The exported MP4 was checked at one frame and by `ffprobe`, not watched in full.
- One observation, not a deployment issue: the style panel showed 90 px before "make the captions bigger" and the agent set `baseFontSize` to 72 px. The agent's
  arithmetic vs. the panel's displayed size (likely the emphasised scale) is a P4 question.

## Integration Status
Editor ↔ API: connected (CORS verified both ways). API ↔ render server: connected. API ↔ voice: connected (token minted, worker received the job). API ↔
DynamoDB/S3: connected (instance role). API ↔ Bedrock/Transcribe: connected via the borrowed keys (Shubh's account). Old stack: retired in Phase 03b; the Amplify editor now points at the new API.

## Dependencies / Blockers
- Bedrock/Transcribe on the owner's own account are still blocked; the fallback keys (a teammate's account and IAM user) are still required.
- Shubh's S3 read grant must remain on `arn:aws:s3:::expressive-captions-divue-k7m2x9/p1/*`.
- Remotion licence: `DEPLOYING-EXPORT.md` argues free use today; revisit if incorporated as 4+ people.

## Deviations
1. **Editor is a Lambda Function URL, not CloudFront or App Runner** (Incidents 1, 2).
2. **A new VPC + NAT** instead of the default VPC (the old stack used the default VPC with public IPs).
3. Web build runs **on the host**, then is packaged (`package_editor.py`), rather than inside Docker: the network here was ~70–150 KB/s and a second monorepo `npm ci`
   would have cost tens of minutes for no benefit.
4. Shubh's `DEPLOYING-EXPORT.md` recommends Remotion **Lambda** and says a Fargate render container is "unacceptable behind a load balancer" without auth. This stack chose
   Option A (Fargate) and satisfies his auth concern by network isolation instead of a shared secret; the code-level hardening he lists (queue cap, `videoUrl` allow-list,
   dimension bounds, pruning failed renders) is **not done**.

## Git / Change Scope
Branch `divue/new-deploy`, one commit on top of `master` (`0611fa5`), pushed with a PR to `master`. Adds: `infra/new-deploy/`, `remotion/Dockerfile.dockerignore`,
`DEPLOYMENT.md`, and this audit. No tracked file was modified. `terraform.tfstate*`, `.terraform/`, `editor.zip` and plan files are ignored and were checked
absent from the commit; the staged files were scanned for AWS keys, LiveKit secrets and private keys (none).

## Incidents (in order)
1. **CloudFront refused again** — `AccessDenied: Your account must be verified before you can add new CloudFront resources`, despite the paid plan. Needs an AWS Support case. Dropped.
2. **A third App Runner service is refused** — `Account … is restricted and can support only two App Runner services per region` (old API + new API = 2). Ruled out a web service on App Runner.
   → Lambda Function URL. This also removed a CORS chicken-and-egg (the SPA does not need its own origin baked in).
3. First `apply` failed on a security-group description containing an apostrophe (AWS forbids it). Fixed one string; the interrupted apply had already created most of stage A, and Terraform reconciled it.
4. `.env` was moved out of the repo root to `~/Desktop/.env` mid-session (by the owner, presumably to prepare files for Shubh; timestamp and size identical) and later put back. Not touched by this work.
5. **One ALB-generated 502 in ~25 export status polls**, caused by the ALB idle timeout (300 s) exceeding Node's 5 s keep-alive, so the ALB reused a socket Node had closed. Fixed in infra: ALB `idle_timeout = 4`. The editor already tolerates a few failed polls in a row. **The fix was applied after the export runs above, so those runs did not exercise it beyond the one 502 they hit** — a long multi-export soak is not done.
6. Slow connection (~70–150 KB/s down) made every image pull and `npm ci` take many minutes; no effect on correctness.

## Runbook
Prerequisites: Terraform ≥ 1.5, AWS CLI (admin on <account-id>), Docker, Node. Secrets in the repo-root `.env`; load them into the SHELL only:
```bash
set -a; . ./.env; set +a
export TF_VAR_fallback_aws_access_key_id=$FALLBACK_AWS_ACCESS_KEY_ID  TF_VAR_fallback_aws_secret_access_key=$FALLBACK_AWS_SECRET_ACCESS_KEY
export TF_VAR_livekit_url=$LIVEKIT_URL TF_VAR_livekit_api_key=$LIVEKIT_API_KEY TF_VAR_livekit_api_secret=$LIVEKIT_API_SECRET
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY        # .env's AWS_* would override ~/.aws in the provider
```
From scratch (needs the editor zip to exist before ANY plan):
```bash
REG=<account-id>.dkr.ecr.ap-south-1.amazonaws.com
cd infra/new-deploy && terraform init
# the zip must exist before ANY plan; for stage A build the editor once with a throwaway API URL (rebuilt with the real one after stage B)
(cd ../../apps/web && VITE_API_URL=https://placeholder.invalid VITE_USE_FIXTURE=false npm run build) && python3 package_editor.py
terraform apply -var deploy_services=false                                       # network, ECR, ALB, roles, Lambda (use saved plans: -out=x.plan)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $REG
docker build -t $REG/captions-v2-api:v1   ../../services/api        && docker push $REG/captions-v2-api:v1
docker build -t $REG/captions-v2-voice:v1 ../../services/voice-agent && docker push $REG/captions-v2-voice:v1
docker build -f ../../remotion/Dockerfile -t $REG/captions-v2-render:v1 ../.. && docker push $REG/captions-v2-render:v1   # context = repo root
terraform apply                                                                  # App Runner API + both ECS services
# editor: build against the API URL, package, apply
(cd ../../apps/web && VITE_API_URL=$(cd ../../infra/new-deploy && terraform output -raw api_url) VITE_USE_FIXTURE=false npm run build)
python3 package_editor.py && terraform apply
# media bucket CORS: ADD $(terraform output -raw editor_url) to the existing rule (get-bucket-cors, append, put-bucket-cors) - never replace the list
```
Update the editor only: rebuild `apps/web`, `python3 package_editor.py`, `terraform apply`. New API image: push `:v2`, `terraform apply -var api_image_tag=v2`.
Watch: `aws logs tail /ecs/captions-v2-voice --region ap-south-1 --since 10m` (expect "registered worker"), `/ecs/captions-v2-render` ("composition bundled … ready"),
`/aws/apprunner/captions-v2-api/<id>/application`.
Teardown: `terraform destroy` in `infra/new-deploy` (does not touch the bucket, table, old stack). Then remove `https://…lambda-url…on.aws` from the media bucket's CORS rule by hand.
Rollback of a bad editor: re-package the previous `dist` and apply.

## Next Steps
1. Owner: decide whether to commit/push `divue/new-deploy` (nothing is pushed). Tell the lead about `infra/new-deploy`, the new stack and the restrictions found.
2. Use either editor address (Lambda or Amplify); both call the new API. Update `shubh_read_first.md` (on `master`), which still describes the old stack.
3. Soak test: several exports in a row and one ≥60 s clip, to exercise the ALB timeout fix and Fargate memory.
4. Open an AWS Support case for CloudFront verification and the App Runner service cap if either is wanted later.
5. Before leaving this up: auth for the API / `livekit-token`, a budget alert, and rotate `captions-dev` and the borrowed keys (unchanged from the old audit).
6. Shubh's own list from `DEPLOYING-EXPORT.md`: render-server hardening (queue cap, `videoUrl` allow-list, size bounds, prune failed renders).

---

# Phase 03b — retire the old stack, repoint Amplify (2026-09-20)

**Owner request:** "no one is using the old deployment" → destroy it; repoint the old Amplify editor to the new API. Confirmed with the owner
before running (two explicit questions: destroy yes/no, and what to do with Amplify).

## What was done, in order
1. **New API accepts the Amplify origin.** `infra/new-deploy/variables.tf`: `extra_cors_origins` default is now
   `["https://master.dnb761en5gcll.amplifyapp.com"]` (a default, so a later plain `terraform apply` cannot silently drop it). Plan was exactly
   one in-place update of `aws_apprunner_service.api`; applied. Preflight verified for both the Amplify and the Lambda origins.
2. **Amplify repointed.** `aws amplify update-app` set `VITE_API_URL` to the new API and re-sent the other three variables unchanged
   (`AMPLIFY_DIFF_DEPLOY=false`, `AMPLIFY_MONOREPO_APP_ROOT=apps/web`, `VITE_USE_FIXTURE=false`; the call replaces all of them). Rebuild job 22: SUCCEED.
3. **Amplify SPA routing fixed.** The site returned 301 → 404 for `/editor` (no single-page-app rewrite), so the editor never loaded there. This predates
   this phase (the earlier audit says the deployed editor had never been opened in a browser). Added the standard rewrite rule.
   **Slip, corrected:** my first `update-app --custom-rules` *replaced* the pre-existing catch-all rule (`/<*>` → `/index.html`, `404-200`) instead of adding to it;
   I had recorded it just before, and restored it alongside the new rule within minutes. Final rules: the rewrite + the original 404-200 rule.
4. **Old stack destroyed.** `terraform plan -destroy -out=…` then `terraform apply` of that saved plan in `infra/terraform`: **18 destroyed, 0 changed**
   (old App Runner API, ECS cluster/service/task definition, security group, log group, 2 ECR repos + lifecycle policies, 5 IAM roles/policies). The plan was
   checked to contain only `expressive-captions*` names. The plan file (contains secrets) was deleted.

## Re-verification after the destroy (all against the real deployed services)
- Old stack gone: `list-services` shows only `captions-v2-api`; only cluster `captions-v2`; only the three `captions-v2-*` ECR repos; old API URL no longer serves.
- **Data intact:** DynamoDB table ACTIVE; bucket reachable; `GET /projects` lists 15 projects (14 ready) through the new API.
- New stack: `/health` 200, `/projects` 200, Lambda editor 200, Amplify editor 200; ECS voice and render 1/1 running; `terraform plan -detailed-exitcode` on `infra/new-deploy` → exit 0, **No changes**.
- **Full browser flow again, through the Amplify editor** (new project `8efdd788c5bb`): upload → pipeline → 36 caption blocks → Export → downloadable MP4
  (10.75 MB, h264 720×1280 + aac, 23.5 s). Console: one aborted `blob:` preview request, no other errors; all API calls went to the new API, none to the old.
- **Voice again, through the Lambda editor:** "Listening (LiveKit)", transcript "Make the captions bigger.", `set_preset_override` → `baseFontSize` 91, `PATCH` saved, 0 problems.
- **ALB 502 fix now exercised:** during the second export, CloudWatch shows **86 requests through the render ALB and no ELB 502/5xx** (the first run had one 502). One run, not a soak test.

## Still open
Not load-tested; no auth on the API; borrowed Bedrock/Transcribe keys; local Terraform state; `shubh_read_first.md` on `master` still describes the old stack.
