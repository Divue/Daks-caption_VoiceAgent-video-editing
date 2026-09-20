# The API on App Runner, with its outbound traffic routed through the VPC so it can reach the private render ALB.

locals {
  # localhost is always allowed (local debugging), plus the deployed editor (the Lambda Function URL, without the
  # trailing slash the URL carries).
  editor_origin = trimsuffix(aws_lambda_function_url.editor.function_url, "/")
  cors_origins  = join(",", concat(["http://localhost:5173", local.editor_origin], var.extra_cors_origins))

  api_env = merge(
    {
      AWS_REGION         = var.aws_region
      S3_BUCKET          = var.s3_bucket
      DYNAMO_TABLE       = var.dynamo_table
      DEV_PREFIX         = var.dev_prefix
      BEDROCK_MODEL_ID   = var.bedrock_model_id
      CORS_ORIGINS       = local.cors_origins
      RENDER_SERVICE_URL = "http://${aws_lb.render.dns_name}" # port 80 on the internal ALB -> render task :3100
    },
    var.fallback_aws_access_key_id != "" && var.fallback_aws_secret_access_key != "" ? {
      FALLBACK_AWS_ACCESS_KEY_ID     = var.fallback_aws_access_key_id
      FALLBACK_AWS_SECRET_ACCESS_KEY = var.fallback_aws_secret_access_key
    } : {},
    var.livekit_url != "" ? {
      LIVEKIT_URL        = var.livekit_url
      LIVEKIT_API_KEY    = var.livekit_api_key
      LIVEKIT_API_SECRET = var.livekit_api_secret
    } : {},
  )
}

resource "aws_apprunner_vpc_connector" "api" {
  vpc_connector_name = "${var.name}-api"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.api_connector.id]
}

resource "aws_apprunner_service" "api" {
  count        = var.deploy_services ? 1 : 0
  service_name = "${var.name}-api"

  source_configuration {
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.repo["api"].repository_url}:${var.api_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port                          = "8000"
        runtime_environment_variables = local.api_env
      }
    }
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.api.arn
    }
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
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

  depends_on = [aws_iam_role_policy_attachment.apprunner_access_ecr, aws_route.private_nat]
}
