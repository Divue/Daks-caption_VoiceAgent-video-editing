variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

# ---- Existing resources. Terraform references these by name and never manages them. ----------

variable "s3_bucket" {
  description = "Existing media bucket (created by hand, not by Terraform)."
  type        = string
  default     = "expressive-captions-divue-k7m2x9"
}

variable "dynamo_table" {
  description = "Existing DynamoDB table (created by services/api/scripts/setup_aws.py)."
  type        = string
  default     = "expressive-captions-dev"
}

variable "dev_prefix" {
  description = "Key/row prefix. Keep p1: the teammate's S3 read grant for Transcribe is scoped to p1/*."
  type        = string
  default     = "p1"
}

variable "editor_url" {
  description = <<-EOT
    Public origin of the editor. NOT managed by Terraform: it is the pre-existing Amplify app
    `Daks-caption_VoiceAgent-video-editing` (appId dnb761en5gcll), which auto-deploys GitHub master.
    CloudFront was refused (account not verified) and the account's Amplify app quota is 1 — see
    infra/AUDIT.md, Incidents 1 and 2. Used for the API's CORS_ORIGINS.
  EOT
  type        = string
  default     = "https://master.dnb761en5gcll.amplifyapp.com"
}

variable "bedrock_model_id" {
  type    = string
  default = "global.anthropic.claude-sonnet-4-6"
}

# ---- Temporary Bedrock/Transcribe borrow (services/api/app/aws_fallback.py). ---------------------
# Supply via the shell, never a committed file:
#   export TF_VAR_fallback_aws_access_key_id=...   export TF_VAR_fallback_aws_secret_access_key=...
# Empty means "not set": the API then uses this account's own Bedrock/Transcribe.

variable "fallback_aws_access_key_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "fallback_aws_secret_access_key" {
  type      = string
  default   = ""
  sensitive = true
}

# ---- Deploy switches. -----------------------------------------------------------------------------

variable "deploy_api" {
  description = "false only on a from-scratch first apply (ECR must hold an image before App Runner can start). Default is true so a plain apply can never destroy the running API."
  type        = bool
  default     = true
}

variable "image_tag" {
  description = "ECR image tag App Runner runs. Change it to roll out a new push."
  type        = string
  default     = "v1"
}

# ---- Voice (LiveKit Cloud + the STT worker on ECS Fargate). ---------------------------------------
# LiveKit Cloud IS the LiveKit server; only the worker (services/voice-agent) is deployed here.
# Supply the three LiveKit values from the shell, never a committed file (same as the fallback keys):
#   export TF_VAR_livekit_url=... TF_VAR_livekit_api_key=... TF_VAR_livekit_api_secret=...

variable "livekit_url" {
  description = "LiveKit Cloud websocket URL (wss://<project>.livekit.cloud). Used by the worker AND handed to browsers by the API."
  type        = string
  default     = ""
}

variable "livekit_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "livekit_api_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "voice_stt_language" {
  description = "Language for AWS Transcribe STREAMING. The worker refuses to start without one; en-IN per .env.example."
  type        = string
  default     = "en-IN"
}

variable "deploy_voice" {
  description = "Create the ECS service. Needs the voice image pushed to ECR first; default true so a plain apply can never destroy the running worker."
  type        = bool
  default     = true
}

variable "voice_image_tag" {
  type    = string
  default = "v1"
}

variable "enable_livekit_on_api" {
  description = "Give the API the LIVEKIT_* env vars. Turn on ONLY after the worker is verified running: with keys but no worker, the mic says 'listening' and no transcript ever returns (the browser only falls back when LiveKit fails to connect)."
  type        = bool
  default     = false
}

variable "extra_cors_origins" {
  description = "Extra browser origins the API should accept, besides the CloudFront domain."
  type        = list(string)
  default     = []
}
