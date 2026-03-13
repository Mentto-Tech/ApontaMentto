from datetime import date, datetime, time
from typing import List, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from models import UserCategory


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
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class UserBase(CamelModel):
    username: str
    email: str
    is_active: bool = True
    is_admin: bool = False
    hourly_rate: Optional[float] = None
    category: UserCategory = UserCategory.CLT
    weekly_hours: Optional[float] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(UserBase):
    password: Optional[str] = None


class UserUpdateAdmin(CamelModel):
    hourly_rate: Optional[float] = None
    category: Optional[UserCategory] = None
    weekly_hours: Optional[float] = None


class UserInDB(UserBase):
    id: int
    hashed_password: str

    class Config:
        from_attributes = True


class UserOut(UserBase):
    id: int


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
class ProjectBase(CamelModel):
    name: str
    color: str
    is_internal: bool = False


class ProjectCreate(ProjectBase):
    pass


class ProjectIn(ProjectBase):
    pass


class ProjectOut(ProjectBase):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------
class LocationBase(CamelModel):
    name: str


class LocationCreate(LocationBase):
    pass


class LocationIn(LocationBase):
    pass


class LocationOut(LocationBase):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# TimeEntry
# ---------------------------------------------------------------------------
class TimeEntryBase(CamelModel):
    start_time: time
    end_time: time
    description: str


class TimeEntryCreate(TimeEntryBase):
    project_id: int
    location_id: int


class TimeEntryIn(TimeEntryBase):
    project_id: int
    location_id: int


class TimeEntryOut(TimeEntryBase):
    id: int
    project: ProjectOut
    location: LocationOut

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# DailyRecord
# ---------------------------------------------------------------------------
class DailyRecordBase(CamelModel):
    date: date
    work_model: str
    total_hours: float


class DailyRecordCreate(DailyRecordBase):
    pass


class DailyRecordIn(DailyRecordBase):
    pass


class DailyRecordOut(DailyRecordBase):
    id: int
    time_entries: List[TimeEntryOut] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Admin Data (Export/Import)
# ---------------------------------------------------------------------------
class AdminData(BaseModel):
    users: List[UserOut]
    projects: List[ProjectOut]
    locations: List[LocationOut]
    time_entries: List[TimeEntryOut]
    daily_records: List[DailyRecordOut]


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
