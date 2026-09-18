"""Where the shared fixtures live, wherever these tests are run from.

The path used to be hardcoded as `parents[5]/packages/shared/fixtures`, which only resolves in a
host checkout — but the API's dependencies live only in the Docker image (root CLAUDE.md forbids
pip-installing them on the host), and the image mounts the fixtures at /srv/fixtures. So the one
environment able to run these tests was the one environment the path did not work in, and every
file failed with `IndexError: 5` before reaching a single assertion.
"""
from __future__ import annotations

from pathlib import Path

_CONTAINER = Path("/srv/fixtures")


def fixtures_dir() -> Path:
    """The fixtures directory: the repo layout when present, else the container mount."""
    here = Path(__file__).resolve()
    if len(here.parents) > 5:
        repo = here.parents[5] / "packages" / "shared" / "fixtures"
        if repo.is_dir():
            return repo
    if _CONTAINER.is_dir():
        return _CONTAINER
    raise RuntimeError(
        "Could not locate packages/shared/fixtures. Run from a repo checkout, "
        "or in the API container where it is mounted at /srv/fixtures."
    )


def repo_root() -> Path | None:
    """The repo root, or None when running from the container mount (where there isn't one)."""
    here = Path(__file__).resolve()
    if len(here.parents) > 5:
        root = here.parents[5]
        if (root / "packages").is_dir():
            return root
    return None
