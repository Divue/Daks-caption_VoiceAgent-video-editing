"""Phase 3: errors a tool HANDLER raises at call time.

Distinct from tools/registry.py's ToolNotFoundError/ToolNotImplementedError,
which are about registry lookup (does this tool exist / is it built), not
execution. A ToolExecutionError means the tool exists, is implemented, and
was called with arguments that are individually valid (Pydantic already
checked that) but don't make sense together or reference something absent
from the current Project — e.g. a time window with fromMs after toMs.
"""
from __future__ import annotations


class ToolExecutionError(Exception):
    """Raised by a tool handler for a semantically invalid request."""
