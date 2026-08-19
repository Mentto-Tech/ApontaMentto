import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import admin_data, admin_punches, ai_chat, announcements, auth, daily_records, geocode, justifications, locations, projects, punch_logs, push, time_entries, users, time_bank, timesheets

logger = logging.getLogger(__name__)


async def _push_scheduler():
    """Background task: fires scheduled push notifications based on daily time slots."""
    import json as _json
    from datetime import datetime, timedelta, timezone as _tz
    from zoneinfo import ZoneInfo as _ZoneInfo
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from database import AsyncSessionLocal
    from models import Announcement

    _brazil_tz = _ZoneInfo("America/Sao_Paulo")

    logger.info("Push scheduler started.")
    first_run = True
    while True:
        sleep_secs = 5 if first_run else 60
        await asyncio.sleep(sleep_secs)
        first_run = False
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.now(_tz.utc)
                now_brazil = now.astimezone(_brazil_tz)
                current_time = now_brazil.strftime("%H:%M")    # "HH:MM" no horário de Brasília
                current_date = now_brazil.strftime("%Y-%m-%d") # "YYYY-MM-DD" no horário de Brasília
                slot_key = f"{current_date} {current_time}"

                result = await db.execute(
                    select(Announcement)
                    .options(selectinload(Announcement.targets))
                    .where(Announcement.push_schedule_times.isnot(None))
                )
                candidates = result.scalars().all()
                logger.info(f"Scheduler tick {current_time} (Brasília): {len(candidates)} announcement(s) with time schedule.")

                for ann in candidates:
                    try:
                        times: list = _json.loads(ann.push_schedule_times or "[]")
                    except Exception:
                        continue

                    if current_time not in times:
                        continue

                    # Check if already sent for this slot today
                    try:
                        sent_map: dict = _json.loads(ann.push_schedule_sent or "{}")
                    except Exception:
                        sent_map = {}

                    if sent_map.get(slot_key):
                        continue

                    # Fire
                    try:
                        from routers.announcements import _get_subscriptions_for_announcement
                        from push_service import send_push_payload
                        subscriptions = await _get_subscriptions_for_announcement(db, ann)
                        sent = await send_push_payload(
                            db=db,
                            subscriptions=subscriptions,
                            title=f"📢 {ann.title}",
                            body=ann.body,
                            url="/",
                            tag=f"announcement-{ann.id}",
                        )
                        # Mark slot as sent; keep only last 7 days to avoid unbounded growth
                        sent_map[slot_key] = True
                        cutoff = (now - timedelta(days=7)).astimezone(_brazil_tz).strftime("%Y-%m-%d")
                        sent_map = {k: v for k, v in sent_map.items() if k[:10] >= cutoff}
                        ann.push_schedule_sent = _json.dumps(sent_map)
                        await db.commit()
                        logger.info(f"Scheduled push '{ann.title}' at {current_time} (Brasília): {sent} sent.")
                    except Exception as e:
                        logger.error(f"Scheduled push failed for '{ann.title}': {e}")
        except Exception as e:
            logger.error(f"Push scheduler error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    task = loop.create_task(_push_scheduler())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="ApontaMentto API",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,  # evita 307 redirect no preflight CORS
)  # noqa

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled errors return a proper JSONResponse that travels
    through the CORS middleware — otherwise ServerErrorMiddleware swallows them
    above the CORS layer and browsers see 'No Access-Control-Allow-Origin'."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(time_entries.router, prefix="/api/time-entries", tags=["time-entries"])
app.include_router(daily_records.router, prefix="/api/daily-records", tags=["daily-records"])
app.include_router(justifications.router, prefix="/api/justifications", tags=["justifications"])
app.include_router(punch_logs.router, prefix="/api/punch-logs", tags=["punch-logs"])
app.include_router(geocode.router, prefix="/api/geocode", tags=["geocode"])
app.include_router(time_bank.router, prefix="/api/time-bank", tags=["time-bank"])
app.include_router(admin_data.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_punches.router, prefix="/api/admin", tags=["admin"])
app.include_router(timesheets.router, prefix="/api/timesheets", tags=["timesheets"])
app.include_router(announcements.router, prefix="/api/announcements", tags=["announcements"])
app.include_router(push.router, prefix="/api/push", tags=["push"])
app.include_router(ai_chat.router, prefix="/api/ai", tags=["ai"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
