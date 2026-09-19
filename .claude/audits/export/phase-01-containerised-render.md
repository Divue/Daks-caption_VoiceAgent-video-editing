# Export Phase 1 — Export could not work on Linux, and could not be deployed at all

## Status
Fixed and verified by rendering a real project end to end on Linux through the container: a
10.6 MB H.264 + AAC MP4 at the source's size, frame rate and duration. **Not verified:** any actual
cloud deployment — no ECS/Fargate service exists, and nothing here has run outside a laptop.

## Objective
The repo owner asked for the export defects from the PR #15 review fixed, and for Export to work
"on deployment too". Two separate problems: it was broken on Linux today, and it had no deployment
story at all.

## Implementation

### Problem 1 — Export was dead on Linux, silently
The render server binds `127.0.0.1`; the API reaches it at `host.docker.internal`, which on Linux
resolves to the **bridge gateway** (`172.17.0.1`), not loopback. Measured in the API container
before the fix:

```
host.docker.internal -> 172.17.0.1
GET http://host.docker.internal:3100/health -> UNREACHABLE (ConnectionError)
```

Every export returns the 503 "the render server isn't running" — while it *is* running. The obvious
workaround is `RENDER_HOST=0.0.0.0`, which is the one thing nobody should do: the endpoint has no
auth, fetches whatever URL it is handed, and burns a CPU core per render.

**Fix: the render server is now a container on the compose network.** The host leaves the path
entirely — no `host.docker.internal`, no `RENDER_HOST` decision, nothing to get wrong per-OS. It is
an opt-in profile (`--profile export`) because the image carries a headless Chrome and nobody
working on captions needs it; without it the API still answers Export with the same honest 503.

### Problem 2 — the image is also the deployable artifact
`remotion/Dockerfile` is built from Remotion's own recipe (https://www.remotion.dev/docs/docker),
which is explicit that Alpine is unsupported. Two additions that recipe does not have:

- **`fonts-noto-core` + `fonts-noto-color-emoji`.** The base image ships **no Devanagari face**.
  This product captions *Hinglish*: without these, every Hindi-script word exports as tofu boxes and
  "put a fire emoji on that word" exports nothing. Verified present in the built image:
  `NotoSansDevanagari-{Regular,Bold}.ttf`, `NotoSerifDevanagari-*`, `NotoColorEmoji.ttf`.
  Nothing in a Latin-only test would have caught this.
- **`shm_size: 1gb`.** `/dev/shm` defaults to 64 MB in a container and headless Chrome crashes on it.

### Problem 3 — the first containerised render failed, and the failure was real
```
render 17d32a2b3210 FAILED: Timeout (30000ms) exceeded rendering the component at frame 102.
Open delayRender() handles: "1. Fetching http://localhost:3000/proxy?src=…"
```
Not the network — the container pulls the same source at 4.35 MB/s. It is the Docker case Remotion
documents: `chromiumOptions.enableMultiProcessOnLinux`. Both that option and
`timeoutInMilliseconds` were confirmed against the installed `@remotion/renderer` types before use,
not assumed. The per-frame `delayRender` budget defaults to 30 s, which is tight when every frame is
pulled from a presigned URL; it is now 120 s and env-overridable. After the fix the same project
renders in ~45 s.

### Problem 4 — a render with no project could be claimed by any project
`render.py` accepted `projectId: null` as "mine". The render server does not require a `projectId`,
so a render created directly against it could be claimed through **any** project id, and `_deliver`
would copy its MP4 into that project's S3 prefix. Now an exact match, with a test.

## Files Created
- `remotion/Dockerfile`, `remotion/.dockerignore`
- This audit.

## Files Modified
- `docker-compose.yml` — the `render` service (profile `export`, published on `127.0.0.1` only),
  and `RENDER_SERVICE_URL` defaulted to it for the API.
- `remotion/server/index.mjs` — `enableMultiProcessOnLinux`, `RENDER_FRAME_TIMEOUT_MS`.
- `services/api/app/routers/render.py` — exact `projectId` match.
- `services/api/tests/test_render.py` — +1 test for that.

## Files Intentionally Untouched
- The render server's missing auth, CSRF guard, `videoUrl` allowlist, queue cap and dimension
  bounds. All real, all **deployment blockers rather than local ones**, and all changes to P2's
  folder that should be made together by whoever actually deploys it. Listed under Next Steps.
- `services/api/requirements.txt` — unchanged, and confirmed unchanged. Nothing here adds a
  production Python dependency.

## Architecture
```
BEFORE                                   AFTER
browser → API(container) ──✗──►          browser → API(container) ──► render(container)
                host.docker.internal                  compose network, no host in the path
                → 172.17.0.1 → refused                127.0.0.1:3100 published for host tooling only
```

## Interfaces / Contracts
- `RENDER_SERVICE_URL` now defaults to `http://render:3100` **in compose** (the code default is
  unchanged, so a natively-run server still works if you also set `RENDER_HOST`).
- New env: `RENDER_FRAME_TIMEOUT_MS` (default 120000).
- `GET /projects/{id}/render/{rid}` now 404s a render whose `projectId` is absent. Stricter, not looser.

## Ownership
- `remotion/**` — **P2**. Dockerfile, the render-server options. Needs P2 sign-off.
- `services/api/**`, `docker-compose.yml` — **P1**. The `projectId` fix and the compose service.
  Needs P1 sign-off.
- Both were made at the repo owner's explicit instruction, and are flagged here rather than assumed.

## Validation
- The API reaches the render server on Linux without any per-developer configuration.
- Port 3100 is published on loopback only; `ss -ltn` confirms no `0.0.0.0` listener.
- Without the profile, Export fails with the existing 503 that says how to start it.

## Security
- **Improved:** the render server is no longer reachable from the LAN by anyone who followed the
  obvious `RENDER_HOST=0.0.0.0` workaround, because there is no longer a reason to reach for it.
  Inside the container, `0.0.0.0` is bounded by the container's own network.
- **Fixed:** the `projectId: null` claim, which allowed writing an MP4 into another project's prefix.
- **Still open, and out of scope here:** no auth, no CSRF guard, no `videoUrl` allowlist, no queue
  cap, no `width`/`height`/`durationMs` bounds, and failed renders leak partial files that
  `pruneOldFiles` never considers (it only prunes renders with a `file` set, which only success
  sets). None of these matter on loopback; all of them block deployment.

## Testing
- `docker compose config` valid; image builds clean (2.57 GB).
- API pytest **128 passed** (was 127; +1 for the `projectId` fix).
- Agent suite 12 modules pass; remotion drift guard passes; web `tsc -b`, `check:agent`,
  `check:captions`, `build` all clean.

## Live Verification
On Linux, against the real stack, real S3, real project `f2fd925fbcfe`:
- Before: `host.docker.internal:3100` **UNREACHABLE** from the API container.
- After: `RENDER_SERVICE_URL=http://render:3100` → **REACHABLE 200**.
- `POST /projects/…/render` → `rendering` → `progress 0.3 → 0.68` → **`done`** in ~45 s for a
  23.5 s 720×1280 clip.
- Downloaded the presigned result and probed it: **h264 720×1280 @ 30/1, 23.500 s, aac 23.445 s**,
  10,593,865 bytes. Matches the source.
- The first attempt (before `enableMultiProcessOnLinux`) failed at frame 102 — that is the control:
  the flag is load-bearing, not cargo cult.

## Unverified / Untestable
1. **Any cloud deployment.** No ECS service, no ECR image, no ALB. The image is *deployable*; it has
   not been *deployed*.
2. Devanagari and emoji are verified **present as font files**, not verified as rendered glyphs — no
   project in the account has Devanagari text to export.
3. macOS and Windows: the change should be neutral (they had a working `host.docker.internal`), but
   only Linux was tested.
4. Concurrent exports, 60 s clips, odd-sized sources — all still untested, as PR #15 said.
5. The 2.57 GB image has not been pushed anywhere; ECR limits and pull times are unmeasured.

## Integration Status
Export works end to end, locally, on Linux, through the container. Deployment: artifact ready,
nothing provisioned.

## Dependencies / Blockers
- P2 sign-off (`remotion/`), P1 sign-off (`services/api`, compose).
- **AWS App Runner is closed to new customers** — confirmed verbatim from AWS's own documentation:
  *"we decided to close AWS App Runner to new customers. Existing AWS App Runner customers can
  continue to use the service as normal."* `CLAUDE.md` names App Runner as the API's target. Unless
  the shared account is already an App Runner customer, **that plan is dead for the API as well as
  the renderer**, and AWS's named replacement is ECS Express Mode. This is a lead decision.
- Remotion licence: the team is free-licence eligible today (see `DEPLOYING-EXPORT.md`); that
  changes if this becomes a registered 4+ person company.

## Deviations
- The review recommended documenting `RENDER_HOST=172.17.0.1` as the Linux fix. I verified that it
  works, then did not ship it: it is a per-OS magic number that breaks `curl localhost:3100` and
  still leaves the service undeployable. Containerising solves both.
- I did not implement Remotion Lambda, which is the better production answer (see
  `DEPLOYING-EXPORT.md`). It needs IAM role/user creation in the shared account, and that account
  already denies this identity Rekognition, Polly and Transcribe-streaming — so it is a permissions
  decision before it is a code task.

## Git / Change Scope
Branch `p3-agent-talk-edit`, on top of `92ef3fb`. `git status` reviewed: the files above plus the
phase-07 audit's files. No `.env`, no credentials, no lockfile change.

## Next Steps
1. Decide App Runner vs ECS Express Mode for the API (owner: lead). It gates the renderer too.
2. Before anything is deployed, harden `remotion/server/index.mjs`: shared-secret header, reject
   requests carrying an `Origin`, allowlist `videoUrl` to the project's bucket, cap the queue, bound
   `width`/`height`/`durationMs`, and prune failed renders (owner: P2).
3. Run `npx remotion lambda quotas` — if concurrency is capped at 10, request an increase now
   (owner: whoever holds IAM).
4. Export a project containing Devanagari text and look at it (owner: P2/whoever demos).
