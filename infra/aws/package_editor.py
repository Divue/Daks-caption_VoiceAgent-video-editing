#!/usr/bin/env python3
"""Packages the built editor for the Lambda: infra/new-deploy/editor.zip = handler.py + site/ (a copy of apps/web/dist).

Run AFTER building the editor with the API's URL baked in (Vite inlines VITE_API_URL at build time), and BEFORE
`terraform plan` (the zip's hash is part of the plan):

    VITE_API_URL=$(terraform output -raw api_url) VITE_USE_FIXTURE=false npm run build -w web
    python3 infra/new-deploy/package_editor.py
"""
import pathlib
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
DIST = HERE.parents[1] / "apps" / "web" / "dist"
OUT = HERE / "editor.zip"

if not (DIST / "index.html").is_file():
    sys.exit(f"{DIST} has no index.html - build the editor first (see the docstring)")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    # Fixed timestamps: the zip (and so the Terraform plan) only changes when the CONTENT changes.
    def add(src: pathlib.Path, name: str) -> None:
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, src.read_bytes())

    add(HERE / "editor_site" / "handler.py", "handler.py")
    for f in sorted(DIST.rglob("*")):
        if f.is_file():
            add(f, f"site/{f.relative_to(DIST).as_posix()}")

print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(zipfile.ZipFile(OUT).namelist()) - 1} site files)")
