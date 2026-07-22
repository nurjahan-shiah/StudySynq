"""
shared/shared_time.py
UTC-safe datetime serialization for API responses.

Why this exists
---------------
Datetime columns in this schema are plain `DateTime` (not `DateTime(timezone=True)`),
so Postgres stores them **naive**, in UTC by convention. Calling `.isoformat()` on a
naive datetime produces a string with no timezone designator:

    2026-07-25T15:00:00

JavaScript's `new Date("2026-07-25T15:00:00")` interprets a bare date-time like that
as **local time**, not UTC. For a browser in Toronto (UTC-4) that silently shifts
every timestamp by four hours in the wrong direction.

`iso_utc()` marks the value as UTC explicitly:

    2026-07-25T15:00:00+00:00

which `new Date(...)` parses correctly and then renders in the viewer's own
timezone via `toLocaleString`. Use it everywhere a datetime crosses the API
boundary.
"""

from datetime import datetime, timezone
from typing import Optional


def iso_utc(value: Optional[datetime]) -> Optional[str]:
    """
    Serialize a datetime as an ISO-8601 string that is explicitly UTC.

    Naive values are assumed to already be UTC (the storage convention here)
    and are tagged as such rather than converted. Aware values are converted
    to UTC so the output is always comparable.

    Returns None for None, so it's safe to call on nullable columns.
    """
    if value is None:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    return value.isoformat()


def utcnow() -> datetime:
    """
    Timezone-aware current UTC time.

    Prefer this over `datetime.utcnow()`, which returns a *naive* value and is
    deprecated in Python 3.12+. When comparing against a naive column value,
    pair it with `as_utc()`.
    """
    return datetime.now(timezone.utc)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Tag a naive datetime as UTC so it can be compared with aware values."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
