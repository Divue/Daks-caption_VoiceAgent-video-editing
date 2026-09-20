# Redeploy of current master (v2 images) — Phase 04 Audit

Branch `divue/redeploy-v2`, off `master` at `68fa97e`. Owner: Divue. Written and run on the evening of 2026-09-20 (local time).

## Status
**REDEPLOYED AND VERIFIED** on the `captions-v2` stack (account `<account-id>`, `ap-south-1`). The API, the render server
and the editor now run current `master`. The voice worker was not rebuilt (nothing under `services/voice-agent` changed).
Checked against the real deployed services in a real Chrome; nothing on the deploy path is mocked. What was **not** re-tested is
listed under "Unverified".

## Objective
Master had moved on since the last deploy (`fddf4c4`): preset segments (schema, API, agent tool, export), word text and timing
editing, a preset lane in the timeline, and a landing page refresh (PR #25). Ship it, keep the URLs unchanged.

## Implementation
What changed on master since the last deploy decided what to rebuild:

| Part | Changed? | Action |
|---|---|---|
| API (`services/api`) | yes: `presetSegments` in the schema and PATCH route, the `apply_preset` agent tool, planner | new image `captions-v2-api:v2` |
| Render server (`remotion/` plus the caption code it imports from `apps/web` and `packages/shared`) | yes: `CaptionVideo.tsx` picks each block's preset by segment | new image `captions-v2-render:v2` |
| Editor (`apps/web`) | yes: preset lane, word editing, landing page | rebuilt against the live API URL, repackaged, Lambda updated |
| Voice worker | no | left on `v1` |

Runbook followed, from `phase-03-new-deploy.md`, with these specifics:
1. Built and pushed both images (the API build reused cached layers; the render build was seconds for the same reason).
2. Built the editor with `VITE_API_URL=<live api>` and `VITE_USE_FIXTURE=false`; confirmed the live URL is in the bundle and `localhost:8010` is not.
3. `python3 infra/aws/package_editor.py`.
4. `terraform plan -out=… -var api_image_tag=v2 -var render_image_tag=v2` with a **saved plan**, reviewed from `terraform show -json`
   (attribute names only, no values), then `terraform apply` of that saved plan.

The plan was exactly: **1 to add, 3 to change, 1 to destroy.**

| Change | Attribute |
|---|---|
| update `aws_apprunner_service.api` | `image_identifier` only (env vars unchanged) |
| replace `aws_ecs_task_definition.render` | `container_definitions`: the image tag. Other keys that differ are AWS default-value noise (empty `mountPoints`/`volumesFrom`/`systemControls`, Fargate's `hostPort`). |
| update `aws_ecs_service.render` | `task_definition` (new revision) |
| update `aws_lambda_function.editor` | `source_code_hash` |

Nothing in the network, IAM, load balancer, voice service or ECR changed. Apply: `1 added, 3 changed, 1 destroyed`, App Runner took ~4 min.

## Files Created
- `.claude/audits/deploy/phase-04-redeploy.md` (this file)

## Files Modified
- `infra/aws/variables.tf`: the defaults of `api_image_tag` and `render_image_tag` are now `"v2"` (were `"v1"`). See "Deviations".
- `.claude/INDEX.md`: one row for the deploy audits.

## Files Intentionally Untouched
- Application code. This phase deploys existing `master`; it changes no source.
- `services/voice-agent` and the voice image (`v1`).
- Old `v1` images stay in ECR: they are the rollback path.

## Architecture
Unchanged. See `docs/architecture.md`.

## Interfaces / Contracts
No contract changed. `Project.presetSegments` is optional and additive, so stored projects parse unchanged.

## Ownership
Deploy work in `infra/aws` (P1). No other owner's folder was edited. The images were built from the working tree of `master`
without local changes.

## Validation
- After the apply: `terraform plan` with **no** `-var` flags reports **"No changes. Your infrastructure matches the configuration."**
  (after the default bump below), so the repo now describes the live stack exactly.
- ECS: `captions-v2-render` on task definition revision 2 and `captions-v2-voice` on revision 1, both `ACTIVE`, 1/1 running,
  rollout `COMPLETED`.
- App Runner `RUNNING`, image `captions-v2-api:v2`.

## Security
- Secrets (the borrowed `FALLBACK_AWS_*` keys and the LiveKit Cloud values) were loaded into the shell as `TF_VAR_*` only, from
  the repo `.env`, and never printed. Their lengths were checked, and the LiveKit URL scheme (`wss`).
- **The repo `.env` currently holds the local LiveKit dev values** (`devkey`/`secret`); the LiveKit Cloud values sit in `# cloud:`
  comment lines. The loader took the Cloud ones. The plan showed **no** change to the API's or voice worker's environment, which
  confirms the values matched what was already live. Loading the dev values instead would have broken deployed voice.
- The saved plan file and the JSON plan summary were deleted after use (they can contain secret values). The Terraform state
  (also secret-bearing, git-ignored, local only) was backed up outside the repo, mode 600.
- Unchanged and still open: the API has **no authentication**.

## Testing
No code changed in this phase. The API and web suites (API pytest, the 15 agent suites, web typecheck and check scripts, the
remotion export pixel checks) were run earlier the same day on the code that became this deploy. Since then master gained only the
landing page refresh (PR #25, frontend). For the exact tree that was deployed, only the editor build (`tsc -b` then `vite build`)
was re-run, and it passed. The backend suites were **not** re-run after that commit; the backend did not change in it.

## Live Verification
All against the deployed URLs, in headless Chrome, using a test project that carries two preset segments.
- API `/health` `{"ok":true}`; its OpenAPI now contains `PresetSegment` and `SetPresetSegmentsAction`.
- Render server log: "composition bundled … ready" after the restart.
- Landing page renders (new frontend), no console errors.
- Editor opens the project; words and **both** preset segments (Minimal, Chamak) appear in the timeline; video plays.
- A typed command ("make the word trick green") went through the deployed agent and Bedrock and was **saved on the deployed
  server** (`#00FF00`). Undone afterwards, so the test project is back as it was.
- **Export through the redeployed render server:** ~44 s for a 7 s clip. Frames from the MP4 show three different presets in one
  video: the project's base look, Minimal inside its segment, Chamak inside its segment.
- UI: Export, then the "Download MP4" link, saved a valid H.264/AAC file.

A first run of the browser script reported 6 of 7: its download step failed because the script looked for a *button* and "Download
MP4" is a link. The same step with the right selector passed. No product defect.

## Unverified / Untestable
- **Voice on the deployed stack was not re-tested.** The worker was not rebuilt or restarted. A check of its recent logs found no
  fresh "registered worker" line, which is expected for a task that has been up since the last deploy, so it is not evidence either way.
- A **fresh upload through the deployed pipeline** was not re-run (the pipeline code did not change between the last verified
  deploy and this one, but that is an inference).
- Real microphone and accents; load and soak (several exports in a row, a 90 s clip), as before.
- The Amplify address was not re-checked after this deploy; it serves a separate build of `master`.

## Integration Status
Live at the same URLs as before:
- Editor: `https://4ofryng45bbr7en765off7otja0yuamo.lambda-url.ap-south-1.on.aws`
- API: `https://pra22j2hgp.ap-south-1.awsapprunner.com`

## Dependencies / Blockers
None hit. The account limits found in phase 03 still apply (CloudFront refused; two App Runner services per region).

## Deviations
- **Default image tags bumped to `v2` in `variables.tf`.** The runbook passes `-var api_image_tag=v2`, but a later plain
  `terraform apply` would then silently roll the API and renderer back to `v1`. With the defaults at `v2` a plain plan shows no
  changes. Next release: build `:v3`, push, and change the defaults in the same commit.
- Time: the whole redeploy, builds included, took well under an hour on today's network.

## Git / Change Scope
Branch `divue/redeploy-v2` off `master` `68fa97e`: `infra/aws/variables.tf`, this audit, one row in `.claude/INDEX.md`.
Not pushed, no PR opened. Nothing else in the repo changed (`editor.zip` and `dist` are git-ignored build outputs).

## Next Steps
1. Owner: review and push this branch.
2. The README on the unmerged `divue/new-deploy` branch says two newer features "reach the live site on the next deploy". That is
   now false; drop the sentence before that PR merges.
3. Re-test voice on the deployed stack and run one fresh upload, the two items above.
4. Soak test, and the hardening list in `docs/export-deployment.md`, as before.
5. Rollback if needed: `terraform apply -var api_image_tag=v1 -var render_image_tag=v1`, plus re-packaging an editor built from
   `fddf4c4`.
