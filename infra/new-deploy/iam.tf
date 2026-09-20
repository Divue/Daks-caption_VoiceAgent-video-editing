# Same permission set as the old stack (derived from the real call sites in services/api/app), under new role
# names so the two stacks never share or overwrite a role.

data "aws_iam_policy_document" "apprunner_build_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_access" {
  name               = "${var.name}-apprunner-access"
  assume_role_policy = data.aws_iam_policy_document.apprunner_build_assume.json
}

resource "aws_iam_role_policy_attachment" "apprunner_access_ecr" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

data "aws_iam_policy_document" "apprunner_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_instance" {
  name               = "${var.name}-api-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_tasks_assume.json
}

data "aws_iam_policy_document" "api_instance" {
  statement {
    sid       = "MediaObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["arn:aws:s3:::${var.s3_bucket}/${var.dev_prefix}/*"] # also covers p1/<id>/renders/ (export output)
  }

  statement {
    sid       = "MediaBucketList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.s3_bucket}"]
  }

  statement {
    sid = "ProjectTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table}",
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table}/index/*",
    ]
  }

  statement {
    sid       = "Vision"
    actions   = ["rekognition:DetectLabels", "rekognition:DetectFaces"] # DetectFaces: the agent stickers-on-faces tool (vision_tools.py)
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "api_instance" {
  name   = "api-runtime"
  role   = aws_iam_role.api_instance.id
  policy = data.aws_iam_policy_document.api_instance.json
}

# ---- ECS: one execution role (pull image, write logs) shared by both services.
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The voice worker's runtime role: streaming Transcribe on THIS account. The render task needs no AWS
# permissions at all (it only fetches a presigned URL), so it gets no task role.
resource "aws_iam_role" "voice_task" {
  name               = "${var.name}-voice-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "voice_task" {
  statement {
    sid       = "StreamingTranscribe"
    actions   = ["transcribe:StartStreamTranscription", "transcribe:StartStreamTranscriptionWebSocket"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "voice_task" {
  name   = "voice-runtime"
  role   = aws_iam_role.voice_task.id
  policy = data.aws_iam_policy_document.voice_task.json
}
