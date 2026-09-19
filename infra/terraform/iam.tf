# Two roles, two different jobs:
#   access role   — used by App Runner itself to PULL the image from ECR.
#   instance role — used by the running API container (this is what boto3 picks up).

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
  name               = "expressive-captions-apprunner-access"
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
  name               = "expressive-captions-api-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_tasks_assume.json
}

# Permissions derived from the real call sites in services/api/app (see the audit doc):
#   s3.py                    head_object, download_file, upload_file, presigned POST/GET signing
#   store/*.py, costs.py     dynamodb get_item / put_item / update_item / query (incl. the byDay GSI)
#   tools/vision_tools.py    rekognition detect_labels
# Bedrock + Transcribe are deliberately NOT here: they go through aws_fallback.py (borrowed keys).
data "aws_iam_policy_document" "api_instance" {
  statement {
    sid       = "MediaObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"] # upload_file goes multipart on big files
    resources = ["arn:aws:s3:::${var.s3_bucket}/${var.dev_prefix}/*"]
  }

  # Without ListBucket, S3 answers 403 (not 404) for a missing key, and s3.exists() would raise.
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
      "dynamodb:Scan", # store/projects.py::list_projects (GET /projects) — missed in the first draft, found by smoke test
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table}",
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamo_table}/index/*",
    ]
  }

  statement {
    sid       = "Vision"
    actions   = ["rekognition:DetectLabels"]
    resources = ["*"] # DetectLabels does not support resource-level permissions
  }
}

resource "aws_iam_role_policy" "api_instance" {
  name   = "api-runtime"
  role   = aws_iam_role.api_instance.id
  policy = data.aws_iam_policy_document.api_instance.json
}
