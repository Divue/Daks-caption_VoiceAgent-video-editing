# Deployment — how Expressive Captions runs on AWS, and why

This page explains **everything about how the app is deployed**, from zero knowledge. Read top to bottom the
first time; later use the table of contents. Every choice comes with **why we picked it** and **why we did not
pick the alternatives**, because that is what a reviewer will ask. Where something is a limitation, it says so.

> **Live links (the deliverable)**
> - **Editor (open this):** https://4ofryng45bbr7en765off7otja0yuamo.lambda-url.ap-south-1.on.aws
> - **Same editor, second address (Amplify):** https://master.dnb761en5gcll.amplifyapp.com — auto-builds from GitHub `master`, and points at the same API
> - **API health check:** https://pra22j2hgp.ap-south-1.awsapprunner.com/health → `{"ok":true}`
> - **Instant demo project** (no upload needed): https://4ofryng45bbr7en765off7otja0yuamo.lambda-url.ap-south-1.on.aws/editor?id=6f2ea8bfd891
>   (a real 23-second Hinglish reel with captions, a "the birthday paradox" title layer and an emoji; some edits on it were made while testing)
> - Region: **ap-south-1 (Mumbai)**. Use **Chrome or Edge** for the microphone.

**Contents**
1. [The 60-second version](#1-the-60-second-version)
2. [Words you need (glossary)](#2-words-you-need-glossary)
3. [The big picture](#3-the-big-picture)
4. [What happens when you use the app (three walkthroughs)](#4-what-happens-when-you-use-the-app)
5. [Every part in detail — what, why, why not the alternatives](#5-every-part-in-detail)
6. [Network and security](#6-network-and-security)
7. [How we deploy it (Terraform)](#7-how-we-deploy-it)
8. [Scalability — what scales today, what does not, and the path](#8-scalability)
9. [Cost](#9-cost)
10. [Questions an architect will ask](#10-questions-an-architect-will-ask)
11. [Honest limitations](#11-honest-limitations)
12. [History: the old stack was retired](#12-history-the-old-stack-was-retired)
13. [Judge's checklist and demo script](#13-judges-checklist-and-demo-script)
14. [Operating it: logs, redeploy, shut down](#14-operating-it)

---

## 1. The 60-second version

Expressive Captions takes a short Hinglish video, writes captions that **react to how you speak** (bigger and
stretched words when you are excited, a shake when you are angry), and lets you **edit the captions by talking**
("make that line angry"). It can then **export an MP4** with the captions burned in.

To do that on AWS we run **four small programs** plus some managed services:

| # | Program | What it does | Where it runs |
|---|---|---|---|
| 1 | **Editor** (website) | What you see and click | AWS Lambda (serves the files) |
| 2 | **API** (FastAPI, Python) | The brain: stores projects, runs the caption pipeline, talks to AI, starts exports | AWS App Runner |
| 3 | **Render server** (Node + Chrome) | Draws captions onto the video and makes the MP4 | AWS Fargate (private) |
| 4 | **Voice worker** (Python) | Turns your microphone audio into text | AWS Fargate |

Data lives in **S3** (videos) and **DynamoDB** (project data). AI comes from **Amazon Bedrock** (Claude),
**Amazon Transcribe** (speech to text) and **Amazon Rekognition** (faces in a frame). Live audio travels through
**LiveKit Cloud**.

Everything is created by **Terraform** (code), not by clicking in the console, so it is reproducible.

## 2. Words you need (glossary)

| Word | Plain meaning |
|---|---|
| **Container / Docker image** | A program packed together with everything it needs (Python, libraries, fonts), so it runs the same on any machine. An *image* is the sealed package; a *container* is one running copy. |
| **ECR** | AWS's storage shelf for Docker images. We push images there; AWS pulls them to run them. |
| **Serverless** | You give AWS your code; AWS decides which machine runs it and you don't manage servers. Lambda, App Runner and Fargate are all forms of this. |
| **App Runner** | "Give me a container image, give me a public HTTPS URL." Handles HTTPS and scaling for a web API. |
| **Fargate / ECS** | Runs containers that are *not* web servers (long-running workers) without you managing machines. ECS is the scheduler; Fargate supplies the compute. |
| **Lambda** | Runs a small function only when a request arrives. We use it just to serve the website files. |
| **VPC / subnet** | Your own private network inside AWS. A *public* subnet can talk to the internet directly; a *private* one cannot be reached from the internet. |
| **NAT gateway** | A one-way door: things in a private subnet can call *out* to the internet (to reach AI services) but nobody can call *in*. |
| **Load balancer (ALB)** | A receptionist that forwards requests to the right running container. Ours is **internal**: only our API can reach it. |
| **Security group** | A firewall rule for one resource: "only this other resource may connect on this port." |
| **IAM role** | A set of permissions attached to a program ("this API may read/write *this* bucket and *this* table, nothing else"). No passwords are stored in the code. |
| **Presigned URL** | A temporary link (valid ~1 hour) that lets a browser upload or download one specific file in S3 without having AWS credentials. |
| **CORS** | A browser safety rule: a website may only call an API that has said "yes, this website may call me." |
| **Terraform** | Describes infrastructure as text files. `plan` shows what will change, `apply` does it. Its *state file* remembers what it built. |
| **Stateless** | A program that keeps no important data in its own memory, so you can run 1 or 20 copies interchangeably. Scaling is easy when things are stateless. |

## 3. The big picture

```
                          ┌───────────────────────── your browser (Chrome) ─────────────────────────┐
                          │                                                                          │
              HTTPS       │                 HTTPS                                   WebSocket (audio) │
   ┌──────────────────────▼────────┐   ┌──────────────────────────┐            ┌────────────────────▼──┐
   │ EDITOR   AWS Lambda           │   │ API   AWS App Runner      │            │ LiveKit Cloud (managed)│
   │ serves the website files      │   │ FastAPI, 1–25 instances   │            └────────────▲──────────┘
   └───────────────────────────────┘   └──┬──────┬──────┬─────────┘                         │ audio
                                          │      │      │ private network (VPC)              │
              ┌───────────────────────────┘      │      └────────────┐                       │
              ▼                                  ▼                   ▼            ┌──────────┴─────────┐
   ┌────────────────────┐          ┌──────────────────────┐   ┌─────────────────┐ │ VOICE WORKER        │
   │ S3   videos, media │          │ DynamoDB  projects,  │   │ internal ALB    │ │ AWS Fargate         │
   │ (browser uploads   │          │ jobs, costs          │   │   │             │ │ speech → text       │
   │  straight to it)   │          │ (pay-per-request)    │   │   ▼             │ └──────────┬─────────┘
   └────────────────────┘          └──────────────────────┘   │ RENDER SERVER   │            │
                                                              │ AWS Fargate     │            ▼
              AI, called by the API through a NAT gateway:    │ Node + Chrome   │     Amazon Transcribe
              Bedrock (Claude) · Transcribe · Rekognition     │ makes the MP4   │       (streaming)
                                                              └─────────────────┘
```

Two ideas run through the whole design:

1. **One shared "project JSON".** Every feature reads and writes the same data structure (words, timings,
   styles, layers). The AI never edits pixels; it returns small validated changes ("patches") to that JSON. The
   editor preview and the exported MP4 are both drawn *from that same JSON by the same caption code*, so what
   you see is what you export.
2. **Keep heavy work off the web server.** Big uploads go straight from the browser to S3 (the API is not in the
   path). Video rendering runs in its own container. Speech-to-text runs in its own worker.

## 4. What happens when you use the app

### Walkthrough A — upload a reel and get captions (about 40 seconds for a 23-second clip)
1. The editor asks the API to create a project (`POST /projects`). The API returns a **presigned upload form**.
2. The browser uploads the video **directly to S3** using that form. (The API never carries the video bytes.)
3. The editor tells the API to process it (`POST /projects/{id}/process`). The API starts a background job:
   `ffmpeg` extracts the audio → **Transcribe** (Hindi, word timings) → **Bedrock/Claude** writes each word in Roman
   letters and tags its tone (excited, angry, emphasis) → **librosa** measures loudness and stretch → all saved as the
   project JSON in DynamoDB.
4. The editor polls `GET /projects/{id}/status` until ready, then loads the project and plays the video (from a
   fresh presigned S3 link) with captions drawn on top.

### Walkthrough B — edit by voice ("make the captions bigger")
1. You click the mic. The editor asks the API for a **LiveKit token** and joins a room on **LiveKit Cloud**.
2. The **voice worker** (on Fargate) is waiting for jobs from LiveKit. It receives your audio, streams it to
   **Amazon Transcribe**, and sends the text back.
3. The editor sends the text to `POST /agent/voice-command`. The API asks **Claude on Bedrock** which *tools* to call
   (e.g. `set_preset_override`). The API **validates** the result against the schema and returns patches.
4. The editor applies the patches (one undo step) and saves them (`PATCH /projects/{id}`).
   *The transcript is passed to the AI as data in tags, never as instructions,* so a video that says "ignore your
   rules" cannot take over the agent.

### Walkthrough C — export an MP4 (about 2.5–3 minutes for a 23-second clip)
1. **Export** → `POST /projects/{id}/render`. The API takes the **saved** project plus a fresh presigned link to the
   video and sends them to the render server **through the private load balancer**.
2. The render server opens the composition in headless **Chrome** (Remotion), renders every frame, and encodes H.264
   video with the original sound. The editor polls for progress (0–100%).
3. When done, the API copies the MP4 into S3 and returns a presigned **download link** that forces "save as".

## 5. Every part in detail

For each part: **what it is → why we chose it → why not the alternatives → limits.**

### 5.1 The API — AWS App Runner
- **What:** one Python FastAPI container (1 vCPU, 2 GB). Endpoints for projects, the caption pipeline, the agent,
  media and export. Health check at `/health`.
- **Why App Runner:** it is the smallest thing that gives us *a container behind a public HTTPS URL that
  autoscales*. No load balancer, certificates or servers to manage. It was also the target named in `CLAUDE.md`
  from day one. Configured autoscaling (AWS defaults, read back from the account): **1 to 25 instances, 100
  concurrent requests per instance.**
- **Why not the alternatives:**
  - *Lambda + API Gateway:* our pipeline job runs 20–40 s and uses `ffmpeg` and `librosa` (large libraries); it fits a
    container far better than Lambda's packaging and cold-start model.
  - *EC2:* we would manage patches, scaling, certificates and restarts ourselves for no benefit.
  - *ECS/Fargate behind an ALB:* fully valid and the likely long-term home (see §8), but needs more moving parts
    (ALB, target groups, HTTPS certificate + domain). Not worth it for an MVP.
  - *EKS (Kubernetes):* far too much machinery for four small services.
- **Caveats an architect will raise:** AWS's own docs (quoted in [`export-deployment.md`](export-deployment.md)) say App Runner is **closed to new
  customers**; our account could already create it, so it works today, but the migration path is ECS on Fargate /
  ECS Express Mode. Also this account is **limited to two App Runner services per region** (see §5.2), which is why the editor is not a third one.

### 5.2 The editor — AWS Lambda Function URL
- **What:** the React website, built into ~10 static files, served by a tiny Python Lambda (`infra/aws/editor_site/handler.py`)
  reachable at a public HTTPS **Function URL**.
- **Why (this one needs a real explanation — it is not the textbook answer):** the textbook answer is **S3 + CloudFront**.
  On this AWS account **CloudFront is refused** ("Your account must be verified before you can add new CloudFront
  resources" — it needs an AWS Support case, not something we can fix in a hackathon). We also need **HTTPS**, because
  browsers **block the microphone on plain-HTTP pages**, which would kill the voice feature. That rules out S3's own website
  hosting (HTTP only). A third App Runner service is refused too (two-per-region cap), and Amplify allows one app (already
  in use). A Lambda Function URL gives an AWS-owned HTTPS address with a valid certificate and no domain.
- **The handler is deliberately dumb and safe:** GET/HEAD only, gzips text, caches hashed files for a year, refuses to read
  anything outside its own folder (tested with `../` attempts), and falls back to `index.html` for client-side routes like
  `/editor?id=…`.
- **Limit:** the account's Lambda concurrency is **10** (new-account restriction). Plenty for a demo; for real traffic the
  right fix is CloudFront in front (§8).

### 5.3 The render server — AWS Fargate, private
- **What:** Shubh's `remotion/Dockerfile`, unmodified. Node + headless Chrome + Remotion. Runs on Fargate with 2 vCPU / 4 GB.
  It draws each frame by running **the same `CaptionRenderer` React code the editor uses**, so export always matches preview.
  Fonts include Devanagari and emoji (without them Hindi captions would export as empty boxes).
- **Why a container on Fargate:** Chrome needs 1–2 GB of memory and up to minutes of CPU; that does not fit in the API
  container or in a normal Lambda. Fargate runs a container of any size without servers.
- **Why not Remotion Lambda** (Remotion's own recommendation, and Shubh's [`export-deployment.md`](export-deployment.md) recommends it): it would
  render in parallel and be much faster, but it needs IAM users/roles/policies created in the account and ~2–4 hours to rewire
  the API. With a 10-hour window we chose the option that works with what is already in the repo. It is the right
  **upgrade** (§8).
- **Why it is private:** the render server has **no login** and fetches *any URL it is given*. Exposed to the internet that
  would be a free video-processing service and an SSRF hole. So it sits in a private subnet behind an **internal** load
  balancer, and the only thing allowed to talk to it is the API (security-group rule).
- **Limit:** **one render at a time**, state held in memory (see §8).

### 5.4 The voice worker — AWS Fargate
- **What:** a LiveKit Agents worker. It registers with LiveKit Cloud, waits for someone to join a room, and streams that
  person's audio to Amazon Transcribe. 0.5 vCPU / 1 GB, outbound connections only.
- **Why Fargate, not App Runner:** it is a *long-running process that dials out*, not a web server that answers requests.
  App Runner is only for HTTP services.
- **Why LiveKit Cloud (and not our own LiveKit server):** real-time audio (WebRTC) needs public UDP/TCP ports, TURN and
  careful tuning. LiveKit Cloud is that, managed. We only run the small worker.
- **Why not the browser's built-in speech recognition:** it works as a fallback (the editor switches to it if LiveKit is
  unreachable) but is Chrome-only and much weaker on Hinglish.

### 5.5 Data — S3 and DynamoDB
- **S3 (videos, audio, exports, emoji/media):** private bucket, encrypted (AES-256). The browser uploads and downloads with
  **presigned URLs**, so the API is never the bottleneck for big files. Objects are grouped under a `p1/` prefix per developer slot.
- **DynamoDB (projects, pipeline jobs, cost records):** one table, **pay-per-request** (no capacity to size), one index for
  cost-by-day. A project is stored as one JSON document with a version number, so two edits cannot silently overwrite each other.
- **Why not a SQL database (RDS/Aurora):** the "project" is naturally one JSON document read and written whole; we never do
  joins. DynamoDB needs no servers, no patching and scales by itself. SQL would add cost and operations for no gain.
- The bucket, table and `p1/` prefix were created by hand (not by Terraform) and are **not** deleted by `terraform destroy`; a teammate's Transcribe read permission is scoped to that exact bucket path, so they stay fixed (§12).

### 5.6 AI services
| Service | Used for | Notes |
|---|---|---|
| **Amazon Bedrock** (Claude Sonnet 4.6) | The voice/typed agent (tool calling) and tone tagging in the pipeline | Talks to the model through the Converse API |
| **Amazon Transcribe** | Batch Hindi transcription of uploads; streaming transcription in the voice worker | Word-level timings |
| **Amazon Rekognition** | Finds faces so the agent can put an emoji "on her face" | `DetectLabels` + `DetectFaces` |
| **Sarvam** (optional) | Alternative Indian-language speech engine | Not configured on this deployment |

**Important honesty note:** Bedrock and Transcribe (batch) are **not yet enabled on the owner's own AWS account**
(AWS says "Operation not allowed"). So the API borrows a teammate's credentials (`FALLBACK_AWS_*`, code in
`services/api/app/aws_fallback.py`) *for those two services only*. Streaming Transcribe (voice) and Rekognition use the
owner's own account. This is temporary; delete the two variables once the account is enabled.

## 6. Network and security

**Why a private network at all.** Only because of the render server (it must not be public). App Runner can reach a private
service only through a **VPC connector**, and a VPC connector sends *all* of the API's outbound traffic through the VPC. That is
why we also need a **NAT gateway**: without it the API could no longer reach S3, DynamoDB or the AI services.

```
Internet
   │
   ├── Lambda (editor)                         public, static files only
   ├── App Runner (API)  ── VPC connector ──┐  public HTTPS in; all outbound goes through the VPC
   │                                         ▼
   │                   ┌──────────── VPC 10.20.0.0/16 ─────────────────────────────────┐
   │                   │ public subnets  (2 AZs):  NAT gateway ── Internet gateway      │
   │                   │ private subnets (2 AZs):  internal ALB ─► render task :3100     │
   │                   │                            voice task (outbound only)          │
   │                   └────────────────────────────────────────────────────────────────┘
   └── LiveKit Cloud  ◄── voice task dials out
```
Security-group chain: **API connector → ALB (port 80) → render task (port 3100).** Nothing else can connect to the renderer.

| Topic | What we do |
|---|---|
| **Permissions** | Each program has its own IAM role. The API role can only read/write this bucket's `p1/*`, this one DynamoDB table, and call Rekognition. No access keys are baked into images. |
| **Secrets** | LiveKit keys and the borrowed AWS keys are passed as environment variables at deploy time from the developer's shell (never a committed file). They also sit in the local Terraform state (git-ignored). Better later: AWS Secrets Manager. |
| **Browser access (CORS)** | The API allows only `localhost:5173` and the deployed editor's origin. Checked: an unknown origin gets 400. |
| **Files** | Presigned links only. Checked: the bucket has no public policy and no public ACL grants, so objects are private even though "Block Public Access" is off. |
| **AI safety** | The agent's tool calls are validated against the schema before being applied; the transcript is data, not instructions. |
| **Not done (be upfront)** | The API has **no user login**; `POST /agent/livekit-token` is open; the bucket's "Block Public Access" is off (objects are still private); no AWS budget alert; no WAF. See §11. |

## 7. How we deploy it

**Terraform** turns text files into AWS resources. Ours live in `infra/aws/`:

| File | Creates |
|---|---|
| `network.tf` | VPC, subnets, internet gateway, NAT gateway, security groups |
| `ecr.tf` | Three image repositories (api, voice, render) |
| `iam.tf` | The roles and permissions |
| `api.tf` | The App Runner service + the VPC connector |
| `render.tf` | Internal load balancer, ECS cluster, the render service |
| `voice.tf` | The voice worker service |
| `editor.tf` + `editor_site/` + `package_editor.py` | The Lambda that serves the website |
| `variables.tf`, `outputs.tf`, `versions.tf` | Settings, results, provider versions |

**Why Terraform (and not clicking in the console, or CloudFormation/CDK):** it is written down, reviewable in git,
repeatable, and destroys cleanly (`terraform destroy`). `terraform plan` gave "No changes" at the end of the deploy, proving
the running system matches the code. *Not done:* Terraform's memory (state file) is **local to one laptop** — for a team it
should live in an S3 bucket with locking.

**Why the deploy has stages** (a chicken-and-egg problem):
1. *Stage A* creates the network, image repositories, roles, load balancer and the editor Lambda (with `deploy_services=false`).
2. We **build and push** the three Docker images to ECR (services cannot start without an image).
3. *Stage B* creates the API, render and voice services.
4. The editor is built **after** the API exists, because the API's URL is baked into the website files at build time; then it is
   zipped (`package_editor.py`) and applied.
5. The new editor's address is added to the media bucket's CORS list (additively).

The exact commands are in `.claude/audits/deploy/phase-03-new-deploy.md` (section "Runbook").

## 8. Scalability

**Read this as three columns: what we configured, what we measured, and what we did not test.** We did *not* load-test.

| Part | Scales how, today | Real numbers | Bottleneck / what breaks first | Path forward |
|---|---|---|---|---|
| **Editor** (Lambda) | Lambda adds copies per request | account concurrency limit **10** | The account limit, then Lambda's per-request cost model | **CloudFront + S3** (after AWS verifies the account); custom domain; WAF |
| **API** (App Runner) | Adds instances as concurrent requests rise | **1–25 instances, 100 concurrent requests each** (defaults) | The caption pipeline runs **inside the API process** as a background thread (§ below) | Move the pipeline to a **queue + worker** (SQS + ECS) |
| **Pipeline jobs** | Run in threads inside whichever API instance got the request | ~35–40 s for a 23 s clip (one measured run) | A scale-in or restart kills a running job; DynamoDB heartbeats notice it and report "worker lost" after 120 s (user re-processes). No queue, no retry | SQS + dedicated workers with retries |
| **Render server** | **Does not scale out yet** | **One** render at a time; ~2.5–3 min per 23 s clip (measured twice); 2 vCPU / 4 GB task | 10 people pressing Export ≈ 10 × ~2.7 min ≈ **27 min** for the last (arithmetic, not measured). Render state is in the task's memory, so simply running two tasks would break status polling | Shared job state (DynamoDB) + queue, *or* **Remotion Lambda** (parallel chunks; Shubh's recommended option) |
| **Voice worker** | Add tasks; LiveKit hands each room to an available worker | 1 task, 0.5 vCPU | Fargate vCPU quota (**8** in this account) | Raise `desired_count` / autoscale on load |
| **DynamoDB** | Pay-per-request, no capacity planning | ~73 items now | Hot partitions only at far larger scale | Fine as is |
| **S3** | Effectively unlimited | uploads capped at **200 MB**, clips at **90 s** | — | Multipart uploads for larger files |
| **AI (Bedrock/Transcribe)** | Limited by **account quotas** | Not checked | **This is the real ceiling**: the borrowed account's rate limits apply to every user at once | Enable Bedrock on the owner's account, request quota increases |
| **LiveKit Cloud** | Managed | — | The plan's limits (not checked) | Paid plan |

**Availability caveats we already know:** one NAT gateway (one AZ) is a single point of failure for outbound traffic; the API
keeps only *one to a few* instances; there are no CloudWatch alarms.

**A sensible upgrade order** (each step is independent):
1. Fix the ceiling nobody sees: enable Bedrock/Transcribe on the owner's account and check quotas.
2. Export: queue + shared job state, or Remotion Lambda.
3. Pipeline: SQS + worker service, so uploads survive restarts and scale separately from the web tier.
4. Front door: CloudFront + custom domain + WAF; add login (Cognito) and protect `/agent/livekit-token`.
5. Operations: Secrets Manager, Terraform state in S3, alarms + a budget alert, one NAT per AZ, CI/CD.

## 9. Cost

**These are estimates from AWS list prices, not a measured bill.** Running everything costs roughly **$0.25 per hour (about
$6 per day)**; the account has about $99 of credit.

| Item | Rough rate | Note |
|---|---|---|
| NAT gateway | ~$0.045/h + data | The price of keeping the renderer private |
| Render task (2 vCPU / 4 GB) | ~$0.10/h | Runs 24/7 even when nobody exports |
| Voice task (0.5 vCPU / 1 GB) | ~$0.025/h | |
| Internal load balancer | ~$0.023/h | |
| App Runner, Lambda, DynamoDB, S3 | small | Pay for use |
| Bedrock, Transcribe | per use | Billed to the **borrowed** account |

**Turn it all off:** `terraform destroy` in `infra/aws` (leaves your bucket and table alone).

## 10. Questions an architect will ask

**Why so many pieces? Isn't this over-engineered?**
Each piece exists because of a hard requirement: a browser preview *and* a video export (Chrome-based renderer), real-time voice
(a worker plus LiveKit), long-running AI work (containers), private rendering (VPC). We deliberately **cut** Step Functions,
authentication, object tracking and general video editing from the MVP (`CLAUDE.md`).

**Why not one big server (a single EC2)?** It would run all four programs but scale, patch and fail as one unit; the
renderer's memory spikes would starve the API. Separate services fail and scale independently.

**Why is the API on App Runner and not Lambda/ECS/EKS?** See §5.1. Short: least effort for "container + HTTPS + autoscale".

**Why a NAT gateway? It costs money and is one AZ.** Because of the private renderer (§6). The alternative — a public renderer —
is unsafe without auth. Cheaper future option: VPC endpoints for S3/DynamoDB plus NAT only for the AI calls.

**Why is the render server not on Lambda?** It could be (Remotion Lambda), and that is our recommended upgrade. It was
skipped because it needs IAM user/role creation and API rewiring that did not fit the window.

**Why DynamoDB and not Postgres?** The project is one JSON document read/written whole; no joins. No servers to run.

**Why LiveKit and not raw WebRTC / API Gateway WebSockets?** Real-time audio is hard to run reliably; LiveKit Cloud is that
service. We only host the small worker.

**How do you stop a malicious video controlling the AI?** The transcript is passed as data inside tags, and every tool call is
validated against a schema before it is applied. The agent returns patches; it cannot run code.

**How do you avoid secrets in git?** They never enter a file: `.env` and Terraform state are git-ignored, and deploy-time secrets
are exported into the shell only. (Weakness: they are plain environment variables and sit in the local state — see §11.)

**Why did an older deployment exist?** §12 — it was the first attempt, before Export existed; it has been retired.

**What if AWS Support unblocks CloudFront?** Add an S3 bucket + CloudFront distribution, point the editor there, and delete the
editor Lambda. The rest of the system does not change.

**Is it multi-region / highly available?** No. One region, one NAT. Acceptable for an MVP; the fixes are listed in §8.

**What is your rollback?** Images are tagged and ECR keeps the last five; `terraform apply -var api_image_tag=<earlier tag>` returns to that image. The editor
is re-packaged from a previous build and re-applied.

## 11. Honest limitations

1. **No authentication.** Anyone with the API URL can create projects and spend AI money on the borrowed account. `POST /agent/livekit-token` is open. (MVP rule in `CLAUDE.md`; fix: Cognito or a signed-token check.)
2. **Borrowed AI credentials** (Bedrock/Transcribe run on a teammate's account). Temporary.
3. **Render server:** one at a time, in-memory state, and the hardening listed in [`export-deployment.md`](export-deployment.md) (queue cap, allow-list of video URLs, size bounds, pruning failed renders) is **not done**. Its only protection is network isolation.
4. **Single NAT gateway / single region;** no alarms; no budget alert.
5. **No CloudFront** (blocked by AWS account verification) — the editor is served by a small Lambda instead.
6. **Local Terraform state** on one laptop; secrets are plain environment variables.
7. **Not load-tested.** All capacity statements are configuration or single measurements.
8. **Not tested:** a human's real microphone and accents, Safari/Firefox/mobile, clips near 90 s, several exports back-to-back.
9. **The media bucket's "Block Public Access" is off** (objects are private; access is by presigned links). Turning it on is recommended.
10. **Remotion licence:** free for individuals/up to 3 employees ([`export-deployment.md`](export-deployment.md)); revisit if incorporated as 4+.

## 12. History: the old stack was retired

There used to be **two** independent AWS deployments. The **first** (`infra/terraform`) was built before Export existed: an
App Runner API, a Fargate voice worker and the Amplify website, all in the default network. It had **no working Export** (the API
answered 501; there was no render server). The **second** (`infra/aws`, this page) was built from current `master` with a
private render server.

Because reviewers dislike unnecessary deployments, the first was **destroyed on 2026-09-20** (`terraform destroy`, 18 resources:
old API, old voice worker, their image repositories and IAM roles). What that means for you:

| | Before | Now |
|---|---|---|
| App Runner services | 2 (old API + new API) | **1** (the new API) — one slot free again |
| Amplify website (`master.dnb761en5gcll.amplifyapp.com`) | Pointed at the old API | **Repointed to the new API**, so it is a second working address for the same editor |
| Your data (S3 bucket, DynamoDB table, projects) | Shared by both | **Untouched** — every project is still listed and loads |
| `infra/terraform/` (old Terraform code) | Live | **Removed from the working tree.** Its state was empty; the code is still in git history (commit `2a81d81`) |

The Amplify site was hard to reach on client routes (`/editor` returned 301 then 404). We added one rewrite rule to the Amplify app
(kept the pre-existing `404 → index.html` rule as well) so `/editor?id=…` works there.

## 13. Judge's checklist and demo script

**Deliverables**
- [x] Deployed, working link (§ top of this page)
- [x] Source code: GitHub repository (`master` has the application, including Export)
- [x] Infrastructure code: `infra/aws/` (the Terraform for this deployment; it was called `infra/new-deploy` until the rename)
- [x] Deployment documentation: this file; audit with measured evidence: `.claude/audits/deploy/phase-03-new-deploy.md`
- [x] Architecture and rules: `CLAUDE.md`; local setup: [`getting-started.md`](getting-started.md); export notes: [`export-deployment.md`](export-deployment.md)

**Two-minute demo**
1. Open the **instant demo project** link. You see a vertical reel with animated captions and a title layer.
2. Click a caption word → change its style (font, colour, emphasis). Ctrl+Z undoes.
3. Click the **mic**, allow the microphone, say **"make the captions bigger"**. The status line reads *Listening (LiveKit)* and the
   Activity tab shows what you said and what the agent did.
4. Type in the bar: **"put a fire emoji on her face"**. The agent finds the face and adds the sticker.
5. Click **Export**. Progress runs to 100% (~3 min for this clip), then **Download MP4** — captions are burned into the video.
6. (Optional) Go to `/editor`, upload your own reel (≤ 90 s, ≤ 200 MB) and watch it get captioned.

**What was actually verified** (details and evidence in the audit): upload → pipeline → captions → export → downloaded MP4
checked frame-by-frame with `ffprobe`; voice through a real Chrome with a fake microphone playing spoken audio (LiveKit → the new
worker → transcript → agent → saved change); test suites: web type-check and checks pass, API tests **130 passed**.

## 14. Operating it

```bash
# Is it alive?
curl https://pra22j2hgp.ap-south-1.awsapprunner.com/health

# Logs (CloudWatch)
aws logs tail /ecs/captions-v2-voice   --region ap-south-1 --since 10m    # expect "registered worker"
aws logs tail /ecs/captions-v2-render  --region ap-south-1 --since 10m    # expect "composition bundled … ready"
# API logs: log group /aws/apprunner/captions-v2-api/<service-id>/application

# Update only the editor: rebuild apps/web with the API URL, package, apply
cd apps/web && VITE_API_URL=https://pra22j2hgp.ap-south-1.awsapprunner.com VITE_USE_FIXTURE=false npm run build
cd ../../infra/aws && python3 package_editor.py && terraform apply

# Roll out a new API image: build, push as :v2, then
terraform apply -var api_image_tag=v2

# Shut everything down (keeps the bucket and table)
terraform destroy
```
Terraform needs the borrowed keys and LiveKit keys exported into the shell first (`TF_VAR_*`); the exact commands, the from-scratch
order, and the list of problems we hit and fixed are in `.claude/audits/deploy/phase-03-new-deploy.md`.

**Two things that can bite when you run Terraform from a laptop**

1. **The state is local.** It is `infra/aws/terraform.tfstate`: git-ignored, no remote backend, holding secrets, and the only
   record of what Terraform manages. Lose it and Terraform no longer knows the live stack. Keep a copy somewhere safe, and keep
   it with the folder if you ever move or rename it (`git mv` will not carry ignored files).
2. **The LiveKit values must be the real LiveKit Cloud ones.** The runbook loads them from the repo-root `.env`. If your `.env`
   holds the local dev values (`devkey` / `secret`, which is right for `docker compose` on a laptop), exporting those and running
   `terraform apply` would replace the deployed voice worker's credentials with the public placeholders and break live voice.
   Run `terraform plan` first and read what it wants to change.
