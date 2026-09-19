# The voice worker (services/voice-agent): a LiveKit Agents process that joins a LiveKit Cloud room,
# transcribes the browser's microphone with AWS Transcribe STREAMING, and sends text back.
# It serves no port and has no inbound traffic — only outbound to LiveKit Cloud and Transcribe — so it
# runs as ONE Fargate task with no load balancer. App Runner does not fit (long-running, not HTTP).

resource "aws_ecr_repository" "voice" {
  name                 = "expressive-captions-voice"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_lifecycle_policy" "voice" {
  repository = aws_ecr_repository.voice.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 5 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

# ---- Network: the account's default VPC, public subnets, public IP (no NAT gateway = no NAT bill).
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_security_group" "voice" {
  name        = "expressive-captions-voice"
  description = "Voice worker: outbound only, no inbound"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "LiveKit Cloud, Transcribe, ECR, CloudWatch"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_cloudwatch_log_group" "voice" {
  name              = "/ecs/expressive-captions-voice"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = "expressive-captions"
}

# ---- IAM: the execution role pulls the image + writes logs; the task role is what the worker's
# boto-style SDK uses at runtime. The worker reads the DEFAULT credential chain (not aws_fallback.py),
# so streaming Transcribe here runs on THIS account.
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "voice_execution" {
  name               = "expressive-captions-voice-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "voice_execution" {
  role       = aws_iam_role.voice_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "voice_task" {
  name               = "expressive-captions-voice-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "voice_task" {
  statement {
    sid       = "StreamingTranscribe"
    actions   = ["transcribe:StartStreamTranscription", "transcribe:StartStreamTranscriptionWebSocket"]
    resources = ["*"] # streaming transcription has no resource-level permissions
  }
}

resource "aws_iam_role_policy" "voice_task" {
  name   = "voice-runtime"
  role   = aws_iam_role.voice_task.id
  policy = data.aws_iam_policy_document.voice_task.json
}

# ---- The task and service. Only created once the image exists in ECR (var.deploy_voice).
resource "aws_ecs_task_definition" "voice" {
  count                    = var.deploy_voice ? 1 : 0
  family                   = "expressive-captions-voice"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.voice_execution.arn
  task_role_arn            = aws_iam_role.voice_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "voice"
    image     = "${aws_ecr_repository.voice.repository_url}:${var.voice_image_tag}"
    essential = true
    # Names match services/voice-agent/.env.example. No AWS_ACCESS_KEY_ID: the task role is used.
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
  count           = var.deploy_voice ? 1 : 0
  name            = "expressive-captions-voice"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.voice[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # One task, no spare capacity: on a redeploy stop the old one first, then start the new one.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.voice.id]
    assign_public_ip = true
  }

  depends_on = [aws_iam_role_policy_attachment.voice_execution]
}
