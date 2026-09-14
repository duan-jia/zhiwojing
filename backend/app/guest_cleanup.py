import asyncio
import logging
import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


log = logging.getLogger(__name__)
SHANGHAI = ZoneInfo("Asia/Shanghai")


def seconds_until_next_cleanup(now: datetime | None = None) -> float:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    local = current.astimezone(SHANGHAI)
    target = local.replace(hour=4, minute=0, second=0, microsecond=0)
    if target <= local:
        target += timedelta(days=1)
    return (target - local).total_seconds()


def scope_contains_guest(scope: str, guest_ids: set[int]) -> bool:
    private = re.fullmatch(r"avatar:(\d+)", scope)
    if private:
        return int(private.group(1)) in guest_ids
    pair = re.fullmatch(r"pair:(\d+)-(\d+)", scope)
    return bool(pair and ({int(pair.group(1)), int(pair.group(2))} & guest_ids))


def thread_contains_guest(thread_id: str, guest_ids: set[int]) -> bool:
    current = re.fullmatch(r"chat:(\d+):(\d+):.*", thread_id)
    if current:
        return bool({int(current.group(1)), int(current.group(2))} & guest_ids)
    match = re.fullmatch(r"(?:remote:)?(\d+):(\d+)", thread_id)
    return bool(match and ({int(match.group(1)), int(match.group(2))} & guest_ids))


async def run_daily(cleanup: Callable[[], int]) -> None:
    while True:
        await asyncio.sleep(seconds_until_next_cleanup())
        try:
            deleted = await asyncio.to_thread(cleanup)
            log.info("daily guest cleanup completed: deleted_users=%s", deleted)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("daily guest cleanup failed")
