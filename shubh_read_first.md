# Shubh — read this first

You're taking over the deploy of **Expressive Captions** (Hinglish captions you edit by voice). This page
says what is live, what you need from Divue (privately), and the exact commands to run, run, and roll out.
It is written from the real Terraform in `infra/terraform/` and the audit in `infra/AUDIT.md` — read the
audit's "Incidents" section once, it explains why some things are the way they are.

> **This repo is PUBLIC.** Never commit `.env`, `terraform.tfstate`, `*.tfvars`, plan files or any key.
> They are git-ignored on purpose. Everything secret reaches you privately (section 2), not through GitHub.

## 1. What is live right now

| Thing | Where |
| --- | --- |
| AWS account / region | `451513981733` (Divue's account) / `ap-south-1` |
| API (FastAPI on App Runner) | https://pbmw8mk9j9.ap-south-1.awsapprunner.com (`/health` → `{"ok":true}`) |
| Editor (existing Amplify app) | https://master.dnb761en5gcll.amplifyapp.com — auto-deploys GitHub `master`; not managed by Terraform |
| Voice worker | ECS Fargate service `expressive-captions-voice` (cluster `expressive-captions`) |
| Voice server | LiveKit Cloud (keys are in `.env`) — only the worker is ours |
| Data | S3 bucket `expressive-captions-divue-k7m2x9`, DynamoDB table `expressive-captions-dev`, prefix `p1` |
| Bedrock + Transcribe (batch) | **borrowed from your account** `632127306260` (IAM user `shubh-2`) via `FALLBACK_AWS_*`, because Divue's own Bedrock says "Operation not allowed". Streaming Transcribe and Rekognition use Divue's account |
| Branch | `divue/deploy` (Terraform + audit). It is **17 commits behind `master`** — merge master before opening a PR |

Terraform manages: ECR (2 repos), IAM roles, App Runner (API), ECS/Fargate (voice), security group, log group.
It does **not** manage: the S3 bucket, the DynamoDB table, the Amplify app, LiveKit.

## 2. What you must get from Divue (privately — not GitHub)

Ask for these over WhatsApp/Signal or a password manager, and send the passphrase on a different channel:

1. **AWS access to account `451513981733`** — an IAM user with admin rights (`captions-dev` has
   AdministratorAccess right now; a fresh IAM user for you is better). Put it in your own `~/.aws` with
   `aws configure`, then check: `aws sts get-caller-identity` → account must be `451513981733`.
2. **The root `.env`** (`cp` it to the repo root). It holds `LIVEKIT_*`, `FALLBACK_AWS_*` and the app settings.
3. **The Terraform state** — see section 4. Without it, `terraform apply` will try to create everything again.

Your own `shubh-2` keys are the `FALLBACK_AWS_*` pair. If you'd rather not lend them out any more, rotate them
after the event (section 7).

## 3. Run it on your laptop

You need Docker, Node (`.nvmrc` says 24; 20 and 22 worked in testing), Terraform ≥ 1.5, AWS CLI.

```bash
cp <the .env Divue sent you> .env          # repo root; never commit it
docker compose up -d --build api           # API on http://localhost:8010  (only the api service)
curl localhost:8010/health                 # {"ok":true}

npm install                                # repo root, workspaces
cd apps/web && npm run dev                 # http://localhost:5173
```

- `/editor` is the real upload screen. **Uploading runs the pipeline, which calls Bedrock + Transcribe on your
  borrowed keys — it costs real money.** The agent bar also calls Bedrock.
- `/editor?demo=1` is the offline demo. It only works if you start Vite with `VITE_USE_FIXTURE=true`
  (`.env` has `false`), and its video is blank unless you put a clip called `Normal.mp4` in
  `services/api/scripts/stt_bakeoff/clips/` (`.mp4` files are git-ignored).
- Don't run the compose `voice-agent` service against the `.env` LiveKit Cloud keys: compose starts a *local*
  LiveKit that doesn't match them. The deployed worker already covers voice.

Tests (no AWS needed, they use moto):

```bash
cd apps/web && npx tsc -b && npm run check:agent && npm run check:captions && npm run build
docker compose run --rm --no-deps api python -m pytest tests/ -q -p no:warnings     # expect 95 passed
```

## 4. Terraform state — pick ONE

Terraform tracks what it created in a **state file**. It holds the borrowed keys in plaintext, so it is
git-ignored. You need the same state Divue used, or Terraform will not know the App Runner service, roles and
ECR repos already exist.

**Way A — Divue sends you the file (works today).** Put it at `infra/terraform/terraform.tfstate`, then:
```bash
cd infra/terraform
terraform init
terraform plan          # must say "No changes" (or only changes you expect). If it wants to CREATE
                        # everything, your state is wrong or missing — stop.
```

**Way B — shared S3 backend (only if Divue tells you it has been set up).** Then there is no file to send:
```bash
cd infra/terraform && terraform init      # reads the state from S3 with your AWS access
```

**Way C — no state at all:** `terraform import` every resource. Slow; avoid.

## 5. Change / redeploy things

Secrets go in **your shell only** (never a file, never chat):

```bash
cd infra/terraform
set -a; . ../../.env; set +a
export TF_VAR_fallback_aws_access_key_id=$FALLBACK_AWS_ACCESS_KEY_ID
export TF_VAR_fallback_aws_secret_access_key=$FALLBACK_AWS_SECRET_ACCESS_KEY
export TF_VAR_livekit_url=$LIVEKIT_URL
export TF_VAR_livekit_api_key=$LIVEKIT_API_KEY
export TF_VAR_livekit_api_secret=$LIVEKIT_API_SECRET
```

**Always pass `-var enable_livekit_on_api=true`.** Its default is `false`, so a plain `apply` silently strips
the `LIVEKIT_*` vars from the API and voice falls back to the browser's speech recognition.

```bash
terraform plan  -var enable_livekit_on_api=true -out=tf.plan     # read the plan
terraform apply tf.plan > apply.log 2>&1; tail apply.log         # log to a file: a hang is invisible otherwise
rm -f tf.plan apply.log                                          # the plan file contains secrets
```

Roll out a new API image (build for `linux/amd64`; App Runner does not auto-deploy):

```bash
ECR=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 451513981733.dkr.ecr.ap-south-1.amazonaws.com
docker build -t $ECR:v2 ../../services/api && docker push $ECR:v2
terraform apply -var image_tag=v2 -var enable_livekit_on_api=true
```

Roll out the voice worker the same way with `../../services/voice-agent`, `expressive-captions-voice` and
`-var voice_image_tag=v2`. Confirm it registered before trusting it:
`aws logs tail /ecs/expressive-captions-voice --region ap-south-1 --since 10m`.

After a new API URL: set `VITE_API_URL` on the Amplify app (`aws amplify update-app` **replaces all** env vars —
send the existing ones back too) and re-run `services/api/scripts/setup_aws.py` so the bucket CORS allows the
Amplify origin. Exact commands: `infra/AUDIT.md`, "Runbook".

## 6. What has and hasn't been proven

Verified: web typecheck + build + both check scripts, API pytest (95 passed) and all agent check scripts, the
API `/health` and reading real DynamoDB, the deployed API and Amplify site answering, Terraform `validate`, and a
synthesised-speech voice run against the deployed stack (speech → LiveKit → worker → Transcribe → transcript).

**Not proven yet:** a real upload → pipeline → edit → reload run on the deployed stack; a **real microphone** in
the browser; the export renderer (`remotion/` is only on `master`, not on this branch); anything about
Hinglish speech quality with the `en-IN` voice setting.

## 7. Cleanup owed — do these soon

1. **Detach `AdministratorAccess` from `captions-dev`** and rotate its access key (it was pasted in chat once).
2. **Rotate the `FALLBACK_AWS_*` keys** (`shubh-2`) and the **LiveKit API key/secret** after the event.
3. **The API has no authentication**, and `POST /agent/livekit-token` is open — anyone with the App Runner URL
   can spend Bedrock/Transcribe money. Fine for a short demo; not for leaving up.
4. No budget alert exists (Divue chose to skip it).
5. Tell the lead about `infra/` (not in the CLAUDE.md ownership table), the `.gitignore` change, the Amplify
   env-var change, and that the voice worker on Fargate is always on (it bills while it runs).
6. **After the event:** `terraform destroy` (it does **not** delete the media bucket or the table), remove the
   two `VITE_*` vars from the Amplify app.

## 8. Rules of the repo (short)

`CLAUDE.md` is binding: stay in your own folder, don't change `packages/shared` without the lead, and every
implementation phase ends with an audit doc in `.claude/audits/`. `ONBOARDING.md` has the full local setup and
troubleshooting table.
