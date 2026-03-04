import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, locations, projects, time_entries, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="ApontaMentto API", version="1.0.0", lifespan=lifespan)  # noqa

_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in _origins_env.split(",")] if _origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(time_entries.router, prefix="/api/time-entries", tags=["time-entries"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
