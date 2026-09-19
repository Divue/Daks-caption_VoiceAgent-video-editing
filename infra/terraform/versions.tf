terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.40"
    }
  }

  # Local state on purpose: one person, ~1.5 days, one account. The state file holds the
  # FALLBACK_AWS_* values in plaintext (App Runner env vars), so it is git-ignored.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "expressive-captions"
      ManagedBy = "terraform"
      Branch    = "divue/deploy"
    }
  }
}

data "aws_caller_identity" "current" {}
