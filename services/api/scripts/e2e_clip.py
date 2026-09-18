"""Drive one clip through the running API the way the editor would: create -> presigned POST ->
process -> poll status. Prints per-stage timings and cost, saves the Project JSON.

    python services/api/scripts/e2e_clip.py services/api/scripts/stt_bakeoff/clips/Angry.mp4 [--api http://localhost:8000] [--out project.json]

Stdlib only (runs on the host, no venv needed); uses curl for the multipart upload.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request


def call(api: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(api + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--out")
    ap.add_argument("--no-wait", action="store_true", help="start processing and exit")
    args = ap.parse_args()

    status, created = call(args.api, "POST", "/projects",
                           {"filename": args.clip.rsplit("/", 1)[-1], "contentType": "video/mp4"})
    assert status == 201, created
    pid, up = created["projectId"], created["upload"]
    form = [x for k, v in up["fields"].items() for x in ("-F", f"{k}={v}")]
    code = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", *form,
                           "-F", f"file=@{args.clip}", up["url"]], capture_output=True, text=True).stdout
    assert code == "204", f"upload returned {code}"
    t0 = time.time()
    status, job = call(args.api, "POST", f"/projects/{pid}/process")
    assert status == 202, job
    print(f"project {pid}: processing")
    if args.no_wait:
        return
    while True:
        _, job = call(args.api, "GET", f"/projects/{pid}/status")
        if job["state"] in ("done", "failed"):
            break
        time.sleep(1)
    print(f"{job['state']} in {time.time() - t0:.1f}s (server elapsed {job['elapsedMs'] / 1000:.1f}s) {job.get('error') or ''}")
    for name, stage in job["stages"].items():
        print(f"  {name:<11} {stage['state']:<8} {stage['ms'] if stage['ms'] is not None else '-':>6}ms  "
              f"{stage.get('detail') or stage.get('error') or ''}")
    _, cost = call(args.api, "GET", f"/projects/{pid}/cost")
    print(f"cost ${cost['totalUsd']:.4f} {cost['byService']} unverified={cost['unverifiedRates']}")
    if job["state"] == "done" and args.out:
        _, project = call(args.api, "GET", f"/projects/{pid}")
        with open(args.out, "w") as fh:
            json.dump(project, fh, ensure_ascii=False, indent=1)
        print(f"saved {args.out}")


if __name__ == "__main__":
    main()
