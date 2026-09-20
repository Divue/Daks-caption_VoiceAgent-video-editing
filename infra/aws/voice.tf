# The LiveKit STT worker (services/voice-agent) on Fargate, in the private subnets (outbound via NAT only).

resource "aws_cloudwatch_log_group" "voice" {
  name              = "/ecs/${var.name}-voice"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "voice" {
  count                    = var.deploy_services ? 1 : 0
  family                   = "${var.name}-voice"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.voice_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "voice"
    image     = "${aws_ecr_repository.repo["voice"].repository_url}:${var.voice_image_tag}"
    essential = true
    environment = [
      { name = "LIVEKIT_URL", value = var.livekit_url },
      { name = "LIVEKIT_API_KEY", value = var.livekit_api_key },
      { name = "LIVEKIT_API_SECRET", value = var.livekit_api_secret },
      { name = "VOICE_STT_LANGUAGE", value = var.voice_stt_language },
      { name = "AWS_REGION", value = var.aws_region },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.voice.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "voice"
      }
    }
  }])
}

resource "aws_ecs_service" "voice" {
  count           = var.deploy_services ? 1 : 0
  name            = "${var.name}-voice"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.voice[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.voice_task.id]
    assign_public_ip = false
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_execution, aws_route.private_nat]
}
