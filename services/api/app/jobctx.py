"""The ambient job context: which project a pipeline call belongs to, and where stage progress goes.

The runner sets it; pipeline modules read it. Without a context (a script, a test) every function
here is a no-op, so `app/pipeline` stays callable on its own (plan §13.5, deviation D3).

contextvars are NOT inherited by ThreadPoolExecutor workers. Anything that submits pipeline work
to a pool must use `submit(pool, fn, ...)` below, which runs fn inside a copy of the caller's
context. Forgetting this silently drops project attribution for every cost row in that thread.
"""
from __future__ import annotations

import contextvars
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable, Iterator, Optional

StageCallback = Callable[..., None]          # (stage, state, *, error=None, detail=None)


@dataclass
class JobContext:
    project_id: str
    on_stage: Optional[StageCallback] = None
    on_heartbeat: Optional[Callable[[], None]] = None
    extra: dict = field(default_factory=dict)


_current: contextvars.ContextVar[Optional[JobContext]] = contextvars.ContextVar("job", default=None)


def current() -> Optional[JobContext]:
    return _current.get()


def project_id() -> Optional[str]:
    ctx = _current.get()
    return ctx.project_id if ctx else None


@contextmanager
def use(ctx: JobContext) -> Iterator[JobContext]:
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


def report(stage: str, state: str, *, error: str | None = None, detail: str | None = None) -> None:
    """state: running | done | failed | skipped. Never raises: progress must not break a run."""
    ctx = _current.get()
    if ctx and ctx.on_stage:
        try:
            ctx.on_stage(stage, state, error=error, detail=detail)
        except Exception as exc:  # noqa: BLE001
            print(f"jobctx: stage callback failed: {exc!r}")


def heartbeat() -> None:
    ctx = _current.get()
    if ctx and ctx.on_heartbeat:
        try:
            ctx.on_heartbeat()
        except Exception as exc:  # noqa: BLE001
            print(f"jobctx: heartbeat failed: {exc!r}")


def submit(pool, fn, *args, **kwargs):
    """pool.submit that carries the caller's contextvars into the worker thread."""
    return pool.submit(contextvars.copy_context().run, fn, *args, **kwargs)
