variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "name" {
  description = "Prefix for every resource in this stack. Must differ from the old stack's `expressive-captions`."
  type        = string
  default     = "captions-v2"
}

# ---- Shared with the old stack, on purpose. Terraform references these by name and never manages them.
# The bucket + p1 prefix must stay: the teammate's S3 read grant for Transcribe (fallback account) is scoped
# to exactly arn:aws:s3:::<bucket>/p1/*, so a new bucket would silently break transcription.

variable "s3_bucket" {
  description = "Existing media bucket (created by hand). Its CORS list gets the new editor origin added, additively."
  type        = string
  default     = "expressive-captions-divue-k7m2x9"
}

variable "dynamo_table" {
  type    = string
  default = "expressive-captions-dev"
}

variable "dev_prefix" {
  type    = string
  default = "p1"
}

variable "bedrock_model_id" {
  type    = string
  default = "global.anthropic.claude-sonnet-4-6"
}

# ---- Temporary Bedrock/Transcribe borrow (services/api/app/aws_fallback.py). Supply via the shell:
#   export TF_VAR_fallback_aws_access_key_id=...   export TF_VAR_fallback_aws_secret_access_key=...

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

# ---- LiveKit Cloud (the server) + our STT worker. Supply from the shell:
#   export TF_VAR_livekit_url=... TF_VAR_livekit_api_key=... TF_VAR_livekit_api_secret=...

variable "livekit_url" {
  type    = string
  default = ""
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
  type    = string
  default = "en-IN"
}

# ---- Two-stage rollout: the services need images in ECR first.
variable "deploy_services" {
  description = "Create the App Runner API and the two ECS services. Apply once with false (network, ECR, ALB, editor hosting), push the three images, then apply with true. Default true so a plain apply can never destroy running services."
  type        = bool
  default     = true
}

variable "api_image_tag" {
  type    = string
  default = "v1"
}

variable "voice_image_tag" {
  type    = string
  default = "v1"
}

variable "render_image_tag" {
  type    = string
  default = "v1"
}

variable "extra_cors_origins" {
  description = "Extra browser origins the API accepts, besides localhost and the deployed editor. Default: the existing Amplify editor (auto-builds GitHub master), repointed at this API when the old stack was retired."
  type        = list(string)
  default     = ["https://master.dnb761en5gcll.amplifyapp.com"]
}
