# The v2 stack: a SECOND, fully separate deployment next to the one in ../terraform.
# Own state, own names (prefix var.name), own VPC. Nothing here references or modifies the old stack;
# the only shared things are the media bucket, DynamoDB table and p1 prefix (see variables.tf).
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.40"
    }
  }

  # Local state on purpose (same reasoning as ../terraform): it holds the FALLBACK_AWS_* and LIVEKIT_*
  # values in plaintext, so it is git-ignored. Never commit it.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "expressive-captions"
      Stack     = var.name
      ManagedBy = "terraform"
      Branch    = "divue/new-deploy"
    }
  }
}

data "aws_caller_identity" "current" {}
