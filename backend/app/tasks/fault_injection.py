"""Deterministic fault injection for crash-recovery validation.

This module is test-only. Every hook is a no-op unless the environment
variable ``CARTAVAULT_TASK_CRASH_POINT`` is set to the matching point name, in
which case the process terminates immediately (``os._exit``) to simulate a hard
crash such as ``docker kill`` / SIGKILL. It is disabled by default and must
never be enabled in a real deployment.

Recognized values for CARTAVAULT_TASK_CRASH_POINT:
  before_claim         -> exit before the lease claim (leaves the task pending)
  claimed              -> exit right after the lease claim commits (task running)
  stall                -> sleep CARTAVAULT_TASK_STALL_SECONDS after the claim so a
                          real ``docker kill`` can land mid-processing
  before_output_commit -> exit after the PDF bytes exist, before the output row commits
  after_output_commit  -> exit after the output row commits, before task success
  before_task_success  -> exit after a handler commits its effects, before task success
  storage_after_write  -> exit after a photo blob write, before its DB reference
"""

from __future__ import annotations

import os
import time

CRASH_POINT_ENV = "CARTAVAULT_TASK_CRASH_POINT"


def _target() -> str:
    return os.getenv(CRASH_POINT_ENV, "").strip()


def crash_point(name: str) -> None:
    if _target() == name:
        os._exit(137)


def processing_stall() -> None:
    """Hold the executor after the claim so an external kill lands mid-work."""
    if _target() == "stall":
        time.sleep(float(os.getenv("CARTAVAULT_TASK_STALL_SECONDS", "20")))
