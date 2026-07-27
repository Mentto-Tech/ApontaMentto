import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import admin_data, announcements, auth, daily_records, geocode, justifications, locations, projects, punch_logs, push, time_entries, users, time_bank, timesheets

logger = logging.getLogger(__name__)


async def _push_scheduler():
    """Background task: fires scheduled push notifications for active announcements."""
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import Announcement
    from push_service import dispatch_announcement_push

    logger.info("Push scheduler started.")
    while True:
        await asyncio.sleep(60)
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.utcnow()
                result = await db.execute(
                    select(Announcement).where(
                        Announcement.push_repeat_interval_minutes.isnot(None),
                    )
                )
                candidates = result.scalars().all()
                logger.debug(f"Scheduler tick: {len(candidates)} announcement(s) with repeat schedule.")

                for ann in candidates:
                    # Skip if not active
                    if not ann.is_active:
                        logger.debug(f"Skipping '{ann.title}': not active.")
                        continue

                    # Expire if past repeat_until
                    if ann.push_repeat_until and ann.push_repeat_until < now:
                        logger.info(f"Schedule expired for '{ann.title}', clearing.")
                        ann.push_repeat_interval_minutes = None
                        ann.push_repeat_until = None
                        await db.commit()
                        continue

                    # Check interval
                    if ann.push_last_sent_at:
                        next_send = ann.push_last_sent_at + timedelta(minutes=ann.push_repeat_interval_minutes)
                        if now < next_send:
                            logger.debug(f"Skipping '{ann.title}': next send at {next_send}.")
                            continue

                    # Fire
                    try:
                        sent = await dispatch_announcement_push(db, ann)
                        ann.push_last_sent_at = now
                        await db.commit()
                        logger.info(f"Scheduled push '{ann.title}': {sent} sent.")
                    except Exception as e:
                        logger.error(f"Scheduled push failed for '{ann.title}': {e}")
        except Exception as e:
            logger.error(f"Push scheduler error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_push_scheduler())
    yield
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
app.include_router(timesheets.router, prefix="/api/timesheets", tags=["timesheets"])
app.include_router(announcements.router, prefix="/api/announcements", tags=["announcements"])
app.include_router(push.router, prefix="/api/push", tags=["push"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
