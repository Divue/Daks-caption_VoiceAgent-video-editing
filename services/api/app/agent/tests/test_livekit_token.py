#!/usr/bin/env python3
"""Verification: LiveKit join-token minting (livekit_token.py).

Run:
    cd services/api && python -m app.agent.tests.test_livekit_token

No real LiveKit account or network call — JWT signing is local crypto, so
dummy LIVEKIT_API_KEY/LIVEKIT_API_SECRET/LIVEKIT_URL values are sufficient.
Matches the plain-assertion style already used across app/agent/tests/*.py.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # services/api, for `app.*` imports

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agent.livekit_token import LiveKitConfigurationError, livekit_router, mint_join_token  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        FAILURES.append(name)


def raises(exc_type: type[Exception], fn) -> bool:
    try:
        fn()
    except exc_type:
        return True
    except Exception:
        return False
    return False


def decode_jwt_payload(token: str) -> dict:
    """Decode a JWT's payload without verifying the signature — sufficient
    for asserting claims in a test; we're checking what mint_join_token put
    in, not re-implementing LiveKit's own verification."""
    payload_b64 = token.split(".")[1]
    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


def with_dummy_livekit_env(fn):
    saved = {k: os.environ.get(k) for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")}
    os.environ["LIVEKIT_URL"] = "wss://example.livekit.cloud"
    os.environ["LIVEKIT_API_KEY"] = "test-key"
    os.environ["LIVEKIT_API_SECRET"] = "test-secret-at-least-32-bytes-long!!"
    try:
        return fn()
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_missing_config_raises() -> None:
    saved = {k: os.environ.pop(k, None) for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")}
    try:
        check(
            "mint_join_token raises LiveKitConfigurationError when unconfigured",
            raises(LiveKitConfigurationError, lambda: mint_join_token("room-1", "user-1")),
        )
    finally:
        for key, value in saved.items():
            if value is not None:
                os.environ[key] = value


def test_mint_join_token_produces_expected_claims() -> None:
    def run():
        result = mint_join_token("editing-room-42", "user-abc")
        claims = decode_jwt_payload(result.token)
        check("mint_join_token returns the configured LIVEKIT_URL unchanged", result.url == "wss://example.livekit.cloud")
        check("the JWT identity (sub) matches the requested identity", claims.get("sub") == "user-abc")
        video_grant = claims.get("video", {})
        check("the video grant allows joining the requested room", video_grant.get("room") == "editing-room-42")
        check("the video grant allows room_join", video_grant.get("roomJoin") is True)
        check("the video grant allows publishing (mic audio)", video_grant.get("canPublish") is True)
        check("the JWT has an expiry (exp) claim", "exp" in claims)

    with_dummy_livekit_env(run)


def test_route_returns_a_token_over_http() -> None:
    def run():
        app = FastAPI()
        app.include_router(livekit_router, prefix="/agent")
        client = TestClient(app)

        response = client.post("/agent/livekit-token", json={"room": "editing-room-42", "identity": "user-abc"})
        check("POST /agent/livekit-token returns 200", response.status_code == 200)
        body = response.json()
        check("the response has a non-empty token", bool(body.get("token")))
        check("the response echoes the configured LiveKit url", body.get("url") == "wss://example.livekit.cloud")

    with_dummy_livekit_env(run)


def main() -> int:
    test_missing_config_raises()
    test_mint_join_token_produces_expected_claims()
    test_route_returns_a_token_over_http()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED: {FAILURES}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
