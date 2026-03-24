import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import admin_data, auth, daily_records, justifications, locations, projects, punch_logs, time_entries, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


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
app.include_router(admin_data.router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
