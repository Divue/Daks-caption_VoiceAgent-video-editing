# Deploying Export — what it needs, and what it costs

Short version: **the licence costs us nothing today**, and the thing that actually blocks
deployment is not Remotion — it is that **AWS App Runner, the target written into `CLAUDE.md`, is
closed to new customers**. That affects the API, not just the renderer.

---

## 1. The licence question: no, we don't need to pay

Remotion is free for us right now, by two independent routes. From the binding terms
(https://github.com/remotion-dev/remotion/blob/main/LICENSE.md — `remotion.dev/license` redirects
there):

> You are eligible to use Remotion for free if you are:
> - an individual
> - a for-profit organization with up to 3 employees
> - a non-profit or not-for-profit organization
> - evaluating whether Remotion is a good fit, and are not yet using it in a commercial way

We qualify as **individuals** (there is no registered company, so there are no "employees") and
separately as **evaluating**. The threshold is headcount, not revenue. Commercial use is allowed
even on the free licence.

**One honest caveat.** The pricing page (https://www.remotion.pro/license) words the paid tier as
"For collaborations and companies of 4+ people" — and "collaborations" is arguably aimed at exactly
a 4-person team. The binding LICENSE.md says "a for-profit organization with up to 3 employees",
which is on our side. For a hackathon this is not worth a lawyer. **The moment this becomes a
registered 4-person company shipping the product, we owe a Company License.**

What that would cost, if it happens: our product is an automated video tool, so it falls under
**"Remotion for Automators" — $0.01 per render, $100/month minimum**, not the $25/seat Creators
tier. Budget **$100/mo**, not $0, the day we incorporate.

The licence does **not** depend on which package we use — `@remotion/renderer` (what we run) and
`@remotion/lambda` are the same licence. So licensing exerts zero pull on the technical choice below.

⚠️ Forward-looking: LICENSE.md says the terms change in Remotion 5.0, and from 5.0 telemetry
reporting becomes mandatory for render-based licensing. We pin `4.0.526`, so today's terms apply
cleanly. Re-read before upgrading.

---

## 2. The real blocker: App Runner is closed

From AWS's own documentation
(https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html):

> After careful consideration, we decided to close AWS App Runner to new customers. Existing AWS App
> Runner customers can continue to use the service as normal, including creating new resources and
> services. AWS continues to invest in security and availability for AWS App Runner, but we do not
> plan to introduce new features.
>
> We recommend that customers explore Amazon Elastic Container Service (Amazon ECS) Express Mode
> when migrating from AWS App Runner.

`CLAUDE.md` says the FastAPI container targets App Runner. **Unless the shared account is already an
App Runner customer, that is not available to us** — and this is the API's problem before it is the
renderer's. Somebody needs to check the account and decide. ECS Express Mode is AWS's named
replacement: one API call, a container image and two IAM roles
(`ecsTaskExecutionRole`, `ecsInfrastructureRoleForExpressServices`), and it provisions Fargate + an
ALB + autoscaling for you.

---

## 3. Two ways to render in production

### Option A — the container in this repo, on ECS Fargate
`remotion/Dockerfile` already exists and is the deployable artifact. It is built from Remotion's own
Docker recipe, plus Devanagari and emoji fonts (see below). Push it to ECR, run it as an ECS Express
Mode service, point `RENDER_SERVICE_URL` at the ALB.

- **Effort:** half a day if you have done ECS before; a day-plus if not — mostly ECR, VPC and IAM.
- **Cost:** a Fargate task billing 24/7 whether or not anyone exports.
- **Blocker before it can be exposed at all:** the render server has **no auth**, fetches whatever
  URL it is handed, and has no queue cap or dimension bounds. Fine on loopback, unacceptable behind
  a load balancer. See the Next Steps in `.claude/audits/export/phase-01-containerised-render.md`.

### Option B — Remotion Lambda (recommended)
Remotion's own guidance is that Lambda is the right default, and for us it has one decisive
advantage: **the Lambda runtime ships Noto Sans Devanagari**, so Hinglish captions render out of the
box. Renders are split into chunks and run in parallel, so a 30 s reel finishes in seconds — which
matters if we render live on stage.

- **Cost: about $0.017 per one-minute video.** A whole hackathon of demos is a few dollars.
- **Region:** `ap-south-1` (Mumbai) is supported — right for an India-facing demo. Default is `us-east-1`.
- **Effort:** ~30-60 min of setup, plus 2-4 h to rewire the API. There is a documented
  "Rendering from Python" path, which suits our FastAPI backend directly.
- **The real gate: IAM.** It needs to create a policy, a role and a user in the shared account. That
  account **already denies this identity Rekognition, Polly and Transcribe-streaming**, so assume
  this is a conversation, not a command. There is a documented "without an IAM user" path if
  creating users is blocked.

**Recommendation for the hackathon: try Option B first, today.** If IAM is blocked, do *not* fall
back to Option A under time pressure — keep rendering locally for the demo and say so. Option A is
the better answer only once render volume is high, which is not a 3-day problem.

---

## 4. What we need — the shopping list

**Decisions (lead)**
- [ ] Is the shared AWS account an existing App Runner customer? If not, the API's deployment target
      changes to ECS Express Mode and that is a bigger change than the renderer.
- [ ] Option A or Option B for rendering.
- [ ] Nothing on licensing today. Revisit if we incorporate.

**AWS access (whoever holds IAM)**
- [ ] For Option B: create `remotion-lambda-policy`, `remotion-lambda-role`, `remotion-user`. The two
      policy documents are generated — `npx remotion lambda policies user` and
      `… policies role` — and should not be hand-edited.
- [ ] Run `npx remotion lambda quotas`. New accounts are sometimes capped at **10** concurrent Lambda
      executions instead of 1000, which removes most of the speed advantage. If it is 10, request an
      increase now; AWS takes time.
- [ ] For Option A: ECR push, ECS + Fargate, IAM role creation, ALB/VPC, CloudWatch Logs.
- [ ] Unrelated but still open: Rekognition (vision commands), Polly (one test script) and
      Transcribe-streaming are denied for our identity. Sarvam covers voice; vision does not work.

**Money**
- $0 in licence fees today; **$100/mo** only if we incorporate as 4+ and ship.
- Option B: ~$0.02 per render, single-digit dollars for the hackathon.
- Option A: a Fargate task running around the clock.

**Code, before anything is internet-reachable**
- [ ] Auth on the render server (shared-secret header), reject requests carrying an `Origin`,
      allowlist `videoUrl` to our own bucket, cap the queue, bound `width`/`height`/`durationMs`.
- [ ] Prune failed renders — today only successful ones are cleaned up, so failures leak files.
- [ ] The seven pre-existing blockers in [`getting-started.md`](getting-started.md) §4 (unauthenticated
      `/agent/livekit-token`, the public `devkey`/`secret`, `/demo-media`, `VITE_USE_FIXTURE`, CORS,
      `FALLBACK_AWS_*`, `livekit-api` in the production image).

---

## 5. Running it locally (what changed)

Export now runs in a container, so it works the same on Linux, macOS and Windows:

```bash
docker compose --profile export up -d --build   # first build takes a few minutes
```

It is opt-in because the image carries a headless Chrome. Without it, Export answers with a 503 that
tells you how to start it — it never fails silently. You no longer need to run
`npm run render-server` on the host, and on Linux you no longer need `RENDER_HOST` at all (the old
native setup was simply broken there: `host.docker.internal` resolves to the bridge gateway while
the server bound loopback).

**Never set `RENDER_HOST=0.0.0.0` on a laptop.** The endpoint has no auth and will fetch any URL it
is given.
