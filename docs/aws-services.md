# AWS services used

Which AWS services Expressive Captions uses, what each one does, and where it shows up in the repo. Built for
the AWS First Commit hackathon, **Ship It** track ("deployed, with a URL"). Everything runs in `ap-south-1`
(Mumbai) under the name prefix `captions-v2`.

This page was written from the Terraform in [`infra/aws/`](../infra/aws) and the app source. The live account was not
re-inspected while writing it. For the reasoning behind each choice see [`deployment.md`](deployment.md); for the
picture, [`architecture.md`](architecture.md).

## Where the app runs

| Service | Track category | What it does here | Where |
| --- | --- | --- | --- |
| **App Runner** | Servers and runtimes | Hosts the FastAPI backend as a container with a public HTTPS URL. A VPC connector lets it reach the private render server. | `infra/aws/api.tf`, `services/api/Dockerfile` |
| **Lambda** (Function URL) | Servers and runtimes | Serves the built React editor: a small Python handler returns the static files, so the editor has HTTPS without a domain or CloudFront. | `infra/aws/editor.tf`, `infra/aws/editor_site/` |
| **ECS on Fargate** | Containers and Kubernetes | Two always-on services in a private subnet: the **voice worker** (speech to text for voice commands) and the **render server** (Remotion and headless Chrome, for MP4 export). | `infra/aws/voice.tf`, `infra/aws/render.tf`, `services/voice-agent/`, `remotion/` |
| **S3** | Data and search | Uploaded videos, extracted audio, media layers and exported MP4s, under a per-developer prefix. The browser uploads and downloads straight to it on presigned links. | `services/api/app/store/` |
| **DynamoDB** | Data and search | The project JSON (the single document the editor and agent read and write), pipeline jobs and per-call cost events. | `services/api/app/store/dynamo.py`, `services/api/app/costs.py` |
| **CloudWatch Logs** | The plumbing | Log groups for the voice worker, the render server and the editor Lambda. App Runner writes its own. | `infra/aws/voice.tf`, `render.tf`, `editor.tf` |

The S3 bucket and the DynamoDB table were created by hand, not by Terraform, so a `terraform destroy` leaves your data alone.

## AI services

These are the product's features, not infrastructure.

| Service | What it does here | Where |
| --- | --- | --- |
| **Amazon Bedrock** (Claude Sonnet 4.6 through the Converse API, with tool use) | Runs the agent that turns a spoken or typed command into validated JSON patches. Also transliterates Hinglish word by word and tags tone and emphasis in the pipeline. | `services/api/app/agent/bedrock_client.py`, `planner.py`, `services/api/app/pipeline/` |
| **Amazon Transcribe** | Batch `hi-IN` transcription with word timings for uploaded videos. Streaming transcription in the voice worker for live commands. | `services/api/app/pipeline/stt.py`, `services/voice-agent/stt_provider.py` |
| **Amazon Rekognition** | `DetectLabels` and `DetectFaces` behind the agent's vision tools: "put the captions where my hand is", stickers on a face. ffmpeg grabs a frame, Rekognition says what is in it. | `services/api/app/agent/tools/vision_tools.py` |

## Supporting services

| Service | Why it is there | Where |
| --- | --- | --- |
| **Elastic Load Balancing** | An *internal* load balancer in front of the render server. Only the API can reach it. | `infra/aws/render.tf` |
| **VPC** | One VPC, public and private subnets in two zones, an internet gateway, **one NAT gateway** for outbound calls, and four security groups. | `infra/aws/network.tf` |
| **ECR** | Three image repositories (`api`, `voice`, `render`) that App Runner and Fargate pull from. | `infra/aws/ecr.tf` |
| **IAM** | Five roles: App Runner's build access and instance role, the ECS execution role, the voice task role and the editor Lambda role. | `infra/aws/iam.tf`, `editor.tf` |

## Outside AWS

- **LiveKit Cloud**: real-time audio between the browser and the voice worker.
- **Sarvam**: an alternative speech-to-text provider for the voice worker, used when AWS Transcribe streaming is not allowed
  for the identity in use (`VOICE_STT_PROVIDER=sarvam`). It is also used for long clips in the pipeline.

## Not used

- **Polly**: appears only in `services/voice-agent/scripts/check_voice_e2e.py`, a test script that synthesises speech to
  check the voice path. It is not part of the product.
- **CloudFront**: refused on this account ("account must be verified"), which is why the editor is on Lambda.
- **Amplify**: an older Amplify app still serves the editor as a second address. It is not managed by the Terraform here.
- **Remotion Lambda**: export uses a container on Fargate instead. See [`export-deployment.md`](export-deployment.md).
- **Cognito, Step Functions, SQS, SNS, EventBridge, Route 53, API Gateway, SageMaker, EKS**: not used. Auth and Step
  Functions were cut from the MVP scope.

## Known gaps

- The API has no authentication.
- Bedrock and batch Transcribe are not allowed on the owning account yet, so the API borrows another account's credentials
  for those two services (`FALLBACK_AWS_*`, `services/api/app/aws_fallback.py`). The voice worker's streaming Transcribe and
  the Rekognition tools use the deployed roles.
- The account allows two App Runner services per region.
- Terraform state is local to one machine. See [`deployment.md`](deployment.md#14-operating-it).
