"""Temporary credential shim for the AWS-account split during the hackathon.

S3 and DynamoDB run on this project's own AWS account (default credential chain:
~/.aws or AWS_ACCESS_KEY_ID/SECRET in .env — see app/s3.py and app/store/dynamo.py,
neither of which import this module). Bedrock and Transcribe are still pending
activation on that account, so those two services borrow a teammate's keys via
FALLBACK_AWS_ACCESS_KEY_ID / FALLBACK_AWS_SECRET_ACCESS_KEY in .env, which are
never committed (.env is git-ignored).

If those two vars aren't set, `client()` behaves exactly like a plain
`boto3.client(service, region_name=region)` call — safe for anyone who pulls
this branch without them. Remove the two FALLBACK_* lines from .env once this
account's own Bedrock/Transcribe access is enabled; no code change needed to
revert.
"""
from __future__ import annotations

import os

import boto3


def client(service: str, region: str):
    key = os.environ.get("FALLBACK_AWS_ACCESS_KEY_ID")
    secret = os.environ.get("FALLBACK_AWS_SECRET_ACCESS_KEY")
    if key and secret:
        return boto3.client(service, region_name=region, aws_access_key_id=key, aws_secret_access_key=secret)
    return boto3.client(service, region_name=region)
