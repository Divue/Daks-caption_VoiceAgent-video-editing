"""Tests run against moto, never the real account. Env is fixed here, before app imports."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

os.environ.update({
    "AWS_REGION": "ap-south-1", "AWS_DEFAULT_REGION": "ap-south-1",
    "AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing",
    "S3_BUCKET": "test-bucket", "DYNAMO_TABLE": "test-table", "DEV_PREFIX": "t1",
    "BEDROCK_MODEL_ID": "global.anthropic.claude-sonnet-4-6", "SARVAM_API_KEY": "",
    "CORS_ORIGINS": "http://localhost:5173",
})
os.environ.pop("AWS_SESSION_TOKEN", None)
os.environ.pop("AWS_PROFILE", None)

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

from app.store import dynamo  # noqa: E402

_HERE = Path(__file__).resolve()
FIXTURES = next(p for p in (Path("/srv/fixtures"), *(d / "packages/shared/fixtures" for d in _HERE.parents))
                if p.exists())


@pytest.fixture
def aws():
    with mock_aws():
        dynamo.reset_client()
        boto3.client("dynamodb", region_name="ap-south-1").create_table(
            TableName="test-table", **dynamo.TABLE_SPEC)
        boto3.client("s3", region_name="ap-south-1").create_bucket(
            Bucket="test-bucket", CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
        yield
        dynamo.reset_client()


@pytest.fixture
def demo_doc() -> dict:
    return json.loads((FIXTURES / "demo-project.json").read_text())
