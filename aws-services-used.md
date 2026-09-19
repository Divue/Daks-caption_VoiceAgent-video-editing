# AWS services used

Which AWS services Expressive Captions uses, what each one does, where it lives in the repo, and which
hackathon track it belongs to (AWS First Commit, **Ship It** track: "Deployed, with a URL").

Written from the source, `infra/terraform/` and `.claude/audits/deploy/phase-01-terraform-aws-deploy.md`.
Region: `ap-south-1` (Mumbai).

## Ship It track services (deployed)

| Service | Track category | Why it's used | Where |
| --- | --- | --- | --- |
| **App Runner** | Servers and runtimes | Hosts the FastAPI backend as a container and gives it a public HTTPS URL | `infra/terraform/apprunner.tf`, `services/api/Dockerfile` |
| **Amplify Hosting** | Servers and runtimes | Hosts the React editor (`apps/web`). It reuses the existing Amplify app, built from the `master` branch | Existing app `dnb761en5gcll`. Not managed by Terraform; the API's `CORS_ORIGINS` points at it (`editor_url` variable) |
| **ECS on Fargate** | Containers and Kubernetes | Runs the always-on LiveKit voice worker (streaming speech-to-text for the voice agent) as one serverless container task | `infra/terraform/voice.tf`, `services/voice-agent/` |
| **S3** | Data and search | Stores uploaded videos, extracted audio and pipeline artifacts under a per-developer prefix | `services/api/app/store/`, `services/api/scripts/setup_aws.py` |
| **DynamoDB** | Data and search | Stores the project JSON (the single source of truth the editor and agent read and write), pipeline jobs and per-call cost events | `services/api/app/store/dynamo.py`, `services/api/app/costs.py` |
| **CloudWatch** | The plumbing | Log group for the voice worker task and App Runner application logs, used for debugging deployed incidents | `infra/terraform/voice.tf` |

## AI services (used by the app, not on the Ship It track list)

These are the features of the product: captioning and the voice agent. They are not in the track's service
list, so they count as the AI layer rather than the "shipped" infrastructure.

| Service | Why it's used | Where |
| --- | --- | --- |
| **Amazon Bedrock** (Claude, `global.anthropic.claude-sonnet-4-6`, Converse API with tool use) | Powers the voice agent (turns spoken commands into validated JSON patches via tool calls) and the pipeline steps that transliterate Hinglish word by word and tag tone and emphasis | `services/api/app/agent/bedrock_client.py`, `services/api/app/agent/planner.py`, `services/api/app/pipeline/` |
| **Amazon Transcribe** | Batch `hi-IN` transcription with word timings for the captioning pipeline. Streaming transcription in the voice worker for live voice commands | `services/api/app/pipeline/stt.py`, `services/voice-agent/worker.py`, `services/voice-agent/stt_provider.py` |
| **Amazon Rekognition** (`DetectLabels`) | Backs the agent's `analyze_frame` tool: ffmpeg grabs one frame from the video (read through a presigned S3 URL) and Rekognition returns labels for what's in it. The Claude-vision-on-Bedrock fallback is not implemented | `services/api/app/agent/tools/vision_tools.py` |

## Supporting services (needed to deploy, not features)

| Service | Why it's used | Where |
| --- | --- | --- |
| **ECR** | Holds the API and voice-worker Docker images that App Runner and Fargate pull from | `infra/terraform/ecr.tf` |
| **IAM** | Four roles (App Runner instance and access roles, Fargate task and execution roles) with least-privilege policies for S3, DynamoDB, Bedrock, Transcribe and Rekognition | `infra/terraform/iam.tf` |
| **VPC and security group** | The default VPC's subnets and one security group for the Fargate voice task | `infra/terraform/voice.tf` |

## Not used

- **Polly**: appears only in `services/voice-agent/scripts/check_voice_e2e.py`, a test script that synthesizes speech
  to check the voice pipeline. It isn't part of the product.
- **Remotion Lambda**: planned for video export, but `remotion/` currently contains only a README, so there is no Lambda code yet.
- **CloudFront**: tried and dropped. The account was blocked by "account must be verified", so the editor is on Amplify instead.
- **Cognito, Step Functions, SQS, SNS, EventBridge, Route 53, API Gateway, Lambda, SageMaker, EKS**: not used.
  Auth and Step Functions were cut from the MVP scope.

## Known gaps

- A full upload → pipeline → edit → reload run through the deployed stack has not been done yet, and nobody has opened
  the deployed editor in a browser (deploy audit, 2026-09-19).
- Bedrock returned `Operation not allowed` on the owner's own account, so the API borrows another account's credentials
  for Bedrock and Transcribe through `FALLBACK_AWS_*` (`services/api/app/aws_fallback.py`). The voice worker's streaming
  Transcribe and the Rekognition tool use the default credentials.
