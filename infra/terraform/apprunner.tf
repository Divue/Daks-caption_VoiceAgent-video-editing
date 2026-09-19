# The API. Created only when var.deploy_api is true — the image must already be pushed to ECR.

locals {
  cors_origins = join(",", concat([var.editor_url], var.extra_cors_origins))

  # Names match services/api/app/config.py (REQUIRED + CORS_ORIGINS) and aws_fallback.py.
  # No AWS_ACCESS_KEY_ID here on purpose: S3/DynamoDB/Rekognition use the instance role.
  api_env = merge(
    {
      AWS_REGION       = var.aws_region
      S3_BUCKET        = var.s3_bucket
      DYNAMO_TABLE     = var.dynamo_table
      DEV_PREFIX       = var.dev_prefix
      BEDROCK_MODEL_ID = var.bedrock_model_id
      CORS_ORIGINS     = local.cors_origins
    },
    var.fallback_aws_access_key_id != "" && var.fallback_aws_secret_access_key != "" ? {
      FALLBACK_AWS_ACCESS_KEY_ID     = var.fallback_aws_access_key_id
      FALLBACK_AWS_SECRET_ACCESS_KEY = var.fallback_aws_secret_access_key
    } : {},
    # Off until the voice worker is verified running — see var.enable_livekit_on_api.
    var.enable_livekit_on_api ? {
      LIVEKIT_URL        = var.livekit_url
      LIVEKIT_API_KEY    = var.livekit_api_key
      LIVEKIT_API_SECRET = var.livekit_api_secret
    } : {},
  )
}

resource "aws_apprunner_service" "api" {
  count        = var.deploy_api ? 1 : 0
  service_name = "expressive-captions-api"

  source_configuration {
    auto_deployments_enabled = false # roll out by changing var.image_tag

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port                          = "8000"
        runtime_environment_variables = local.api_env
      }
    }
  }

  instance_configuration {
    cpu               = "1024" # 1 vCPU
    memory            = "2048" # 2 GB (ffmpeg + librosa on clips of up to 60 s)
    instance_role_arn = aws_iam_role.api_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  depends_on = [aws_iam_role_policy_attachment.apprunner_access_ecr]
}
