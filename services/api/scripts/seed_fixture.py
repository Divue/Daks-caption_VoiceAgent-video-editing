"""Dev only: put a fixture Project into the table so the editor can GET it before the pipeline runs.

    docker compose run --rm api python scripts/seed_fixture.py            # demo-project.json
    docker compose run --rm api python scripts/seed_fixture.py angry-project.json

Creates-or-replaces the project under your DEV_PREFIX with id = the fixture's `id`. The fixture's
videoUrl is kept as-is (there is no s3Key), so the editor serves it however it already does.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.schema import Project  # noqa: E402
from app.store import projects  # noqa: E402

FIXTURE_DIRS = [Path("/srv/fixtures"), *(d / "packages/shared/fixtures" for d in Path(__file__).resolve().parents)]


def main(name: str = "demo-project.json") -> None:
    path = next((d / name for d in FIXTURE_DIRS if (d / name).exists()), None)
    if path is None:
        sys.exit(f"fixture {name} not found in {FIXTURE_DIRS}")
    project = Project.model_validate(json.loads(path.read_text()))
    version = projects.put_project(project.id, project, expected_version=None, manual_edit=False, seed=True)
    print(f"seeded {project.id} ({len(project.words)} words) at version {version}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
