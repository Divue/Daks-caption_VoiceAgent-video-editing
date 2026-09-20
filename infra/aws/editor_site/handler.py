"""Serves the built editor (apps/web/dist) from a Lambda Function URL.

Why this exists: the editor needs an HTTPS URL (browsers block the microphone on plain HTTP), and every usual
static-hosting route was closed on this account - CloudFront ("account must be verified"), a third App Runner
service (the account is limited to two per region), Amplify (one app, already used). A Function URL gives an
AWS-owned HTTPS address with no domain and no certificate to manage.

It is a dumb static file server: GET/HEAD only, files from ./site, unknown paths fall back to index.html because
/editor and /editor?id=... are client-side routes. Hashed files under /assets/ are cached forever; the shell is not.
"""
import base64
import gzip
import mimetypes
import os
from urllib.parse import unquote

SITE = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "site"))
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}
COMPRESSIBLE = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt"}
_files: dict[str, bytes] = {}      # raw bytes, kept for the life of the warm container
_gzipped: dict[str, bytes] = {}


def _resolve(path: str) -> str | None:
    """The file for a URL path, or None. realpath + prefix check, so `..` and symlinks cannot leave ./site."""
    target = os.path.realpath(os.path.join(SITE, unquote(path).lstrip("/")))
    if target != SITE and not target.startswith(SITE + os.sep):
        return None
    return target if os.path.isfile(target) else None


def _reply(status: int, body: bytes = b"", headers: dict | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"x-content-type-options": "nosniff", **(headers or {})},
        "isBase64Encoded": True,
        "body": base64.b64encode(body).decode(),
    }


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    if method not in ("GET", "HEAD"):
        return _reply(405, b"method not allowed", {"allow": "GET, HEAD", "content-type": "text/plain"})

    path = event.get("rawPath") or "/"
    file = _resolve(path)
    if file is None:
        if path.startswith("/assets/"):  # a missing hashed asset is a real 404, never the app shell
            return _reply(404, b"not found", {"content-type": "text/plain"})
        file = os.path.join(SITE, "index.html")

    ext = os.path.splitext(file)[1].lower()
    if file not in _files:
        with open(file, "rb") as f:
            _files[file] = f.read()
    body = _files[file]

    headers = {
        "content-type": TYPES.get(ext) or mimetypes.guess_type(file)[0] or "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable" if path.startswith("/assets/") else "no-cache",
    }
    accepts = (event.get("headers") or {}).get("accept-encoding", "")
    if ext in COMPRESSIBLE and "gzip" in accepts:
        if file not in _gzipped:
            _gzipped[file] = gzip.compress(body, 6)
        body = _gzipped[file]
        headers["content-encoding"] = "gzip"
        headers["vary"] = "Accept-Encoding"

    return _reply(200, b"" if method == "HEAD" else body, headers)
