"""Create/refresh the AWS resources the API needs. Idempotent: safe to run any number of times.

    docker compose run --rm api python scripts/setup_aws.py

1. The DynamoDB table named by DYNAMO_TABLE (on-demand, with the sparse byDay GSI for costs).
   Shared by p1-p4: every key starts with DEV_PREFIX, so nobody overwrites anyone else.
2. The S3 bucket CORS rule, so a browser can POST a presigned upload. Origins come from
   CORS_ORIGINS (plus EXTRA_S3_ORIGINS, e.g. the Amplify domain). This REPLACES the bucket's
   CORS config; the bucket had none on 2026-09-18.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.store.dynamo import TABLE_SPEC  # noqa: E402


def ensure_table(ddb, name: str) -> str:
    existing = ddb.list_tables()["TableNames"]
    if name in existing:
        return "exists"
    ddb.create_table(TableName=name, **TABLE_SPEC)
    ddb.get_waiter("table_exists").wait(TableName=name)
    return "created"


def cors_rules(origins: list[str]) -> dict:
    return {"CORSRules": [{
        "AllowedOrigins": origins,
        "AllowedMethods": ["POST", "PUT", "GET", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000,
    }]}


def main() -> None:
    s = get_settings()
    ddb = boto3.client("dynamodb", region_name=s.aws_region)
    print(f"table {s.dynamo_table}: {ensure_table(ddb, s.dynamo_table)}")

    extra = [o.strip() for o in os.environ.get("EXTRA_S3_ORIGINS", "").split(",") if o.strip()]
    origins = sorted(set(s.cors_origins) | set(extra))
    boto3.client("s3", region_name=s.aws_region).put_bucket_cors(
        Bucket=s.s3_bucket, CORSConfiguration=cors_rules(origins))
    print(f"bucket {s.s3_bucket}: CORS set for {origins}")


if __name__ == "__main__":
    main()
