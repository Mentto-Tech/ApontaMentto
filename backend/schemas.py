from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


# ---------------------------------------------------------------------------
# Base model: exposes camelCase aliases so the frontend works without
# any client-side transformation.
# ---------------------------------------------------------------------------
class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class UserOut(CamelModel):
    id: str
    name: str
    email: str
    role: str
    hourly_rate: Optional[float] = None
    overtime_hourly_rate: Optional[float] = None


class UserUpdateRate(CamelModel):
    hourly_rate: Optional[float] = None
    overtime_hourly_rate: Optional[float] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
class ProjectIn(BaseModel):
    name: str
    description: str = ""
    color: str = "#0f766e"


class ProjectOut(CamelModel):
    id: str
    name: str
    description: str
    color: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------
class LocationIn(BaseModel):
    name: str
    address: str = ""


class LocationOut(CamelModel):
    id: str
    name: str
    address: str
    created_at: datetime


# ---------------------------------------------------------------------------
# TimeEntry
# ---------------------------------------------------------------------------
class TimeEntryIn(CamelModel):
    date: str
    start_time: str
    end_time: str
    project_id: Optional[str] = None
    location_id: Optional[str] = None
    notes: str = ""
    entry_type: str = "work"       # "work" | "break"
    is_overtime: bool = False


class TimeEntryOut(CamelModel):
    id: str
    date: str
    start_time: str
    end_time: str
    project_id: Optional[str] = None
    location_id: Optional[str] = None
    notes: str
    entry_type: str = "work"
    is_overtime: bool = False
    user_id: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# DailyRecord (clock-in / clock-out)
# ---------------------------------------------------------------------------
class DailyRecordIn(CamelModel):
    date: str
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None


class DailyRecordOut(CamelModel):
    id: str
    date: str
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    user_id: str
    created_at: datetime


TokenResponse.model_rebuild()
