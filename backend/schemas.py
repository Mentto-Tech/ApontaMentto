from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, computed_field, field_validator
from pydantic.alias_generators import to_camel

from models import UserCategory


def _as_utc_datetime(v: Any):
    if v is None:
        return None
    if isinstance(v, datetime):
        # DB stores naive UTC; make it explicit so clients don't treat it as local time
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc)
    return v


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
# Auth (keep access_token snake_case to match frontend)
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
    user: UserOut


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
class UserOut(CamelModel):
    id: str
    username: str
    email: str
    role: str
    hourly_rate: Optional[float] = None
    overtime_hourly_rate: Optional[float] = None
    category: Optional[UserCategory] = None
    weekly_hours: Optional[float] = None
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _created_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)

    @computed_field(return_type=bool)
    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @computed_field(return_type=str)
    @property
    def name(self) -> str:
        # Frontend profile screens still use `name`.
        return self.username


class UserAdminUpdate(CamelModel):
    hourly_rate: Optional[float] = None
    overtime_hourly_rate: Optional[float] = None
    category: Optional[UserCategory] = None
    weekly_hours: Optional[float] = None


class UserMeUpdate(CamelModel):
    name: Optional[str] = None
    email: Optional[str] = None


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
class ProjectIn(CamelModel):
    name: str
    description: str = ""
    color: str = "#6366f1"
    is_internal: bool = False

    @field_validator("description", mode="before")
    @classmethod
    def _none_to_empty_description(cls, v: Any):
        return "" if v is None else v

    @field_validator("color", mode="before")
    @classmethod
    def _none_to_default_color(cls, v: Any):
        return "#6366f1" if v is None else v


class ProjectOut(ProjectIn):
    id: str
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _created_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------
class LocationIn(CamelModel):
    name: str
    address: str = ""

    @field_validator("address", mode="before")
    @classmethod
    def _none_to_empty_address(cls, v: Any):
        return "" if v is None else v


class LocationOut(LocationIn):
    id: str
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _created_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Time Entries
# ---------------------------------------------------------------------------
class TimeEntryIn(CamelModel):
    date: str
    start_time: str
    end_time: str
    project_id: Optional[str] = None
    location_id: Optional[str] = None
    notes: str = ""
    entry_type: str = "work"  # "work" | "break"
    is_overtime: bool = False

    @field_validator("notes", mode="before")
    @classmethod
    def _none_to_empty_notes(cls, v: Any):
        return "" if v is None else v


class TimeEntryOut(TimeEntryIn):
    id: str
    user_id: Optional[str] = None
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _created_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Daily Records (clock-in / clock-out)
# ---------------------------------------------------------------------------
class DailyRecordIn(CamelModel):
    date: str
    # Legacy fields (kept for backward compatibility)
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None

    # Folha de ponto (2 entradas / 2 saídas)
    in1: Optional[str] = None
    out1: Optional[str] = None
    in2: Optional[str] = None
    out2: Optional[str] = None
    overtime_minutes: Optional[int] = None

    # Captura de localização do dispositivo (opcional)
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    geo_accuracy: Optional[float] = None
    geo_source: Optional[str] = None
    lunch: Optional[str] = None  # HH:mm-HH:mm format for lunch break


class DailyRecordOut(DailyRecordIn):
    id: str
    user_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _datetimes_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Absence Justifications
# ---------------------------------------------------------------------------
class AbsenceJustificationOut(CamelModel):
    id: str
    date: str
    reason_text: Optional[str] = None
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    user_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _datetimes_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Punch Logs
# ---------------------------------------------------------------------------
class PunchLogOut(CamelModel):
    id: str
    user_id: str
    daily_record_id: Optional[str] = None
    date: str
    field: str
    time_value: Optional[str] = None
    overtime_minutes: Optional[int] = None
    recorded_at: Optional[datetime] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    geo_accuracy: Optional[float] = None
    geo_source: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    @field_validator("recorded_at", mode="before")
    @classmethod
    def _recorded_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


# ---------------------------------------------------------------------------
# Time Bank
# ---------------------------------------------------------------------------
class TimeBankEntryIn(CamelModel):
    date: str
    amount_minutes: int
    description: str
    entry_type: str = "manual_add"


class TimeBankEntryOut(CamelModel):
    id: str
    user_id: str
    daily_record_id: Optional[str] = None
    date: str
    amount_minutes: int
    description: str
    entry_type: str
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _created_at_as_utc(cls, v: Any):
        return _as_utc_datetime(v)


class TimeBankBalanceOut(CamelModel):
    total_balance_minutes: int
    entries: List[TimeBankEntryOut]


# ---------------------------------------------------------------------------
# Admin import/export payloads
# ---------------------------------------------------------------------------
class AdminExport(CamelModel):
    version: str
    exported_at: str
    users: List[UserOut]
    projects: List[ProjectOut]
    locations: List[LocationOut]
    time_entries: List[TimeEntryOut]
    daily_records: List[DailyRecordOut]


class AdminImportResult(CamelModel):
    ok: bool
    imported: Dict[str, int]


# ---------------------------------------------------------------------------
# Timesheet signing
# ---------------------------------------------------------------------------
class TimesheetSignRequestOut(CamelModel):
    id: str
    user_id: str
    month: str
    status: str
    expires_at: Optional[datetime] = None
    manager_signed_at: Optional[datetime] = None
    employee_signed_at: Optional[datetime] = None
    created_by_admin_id: str

    @field_validator("expires_at", "manager_signed_at", "employee_signed_at", mode="before")
    @classmethod
    def _dt_utc(cls, v: Any):
        return _as_utc_datetime(v)


class TimesheetSignedPdfOut(CamelModel):
    id: str
    user_id: str
    month: str
    signed_at: Optional[datetime] = None
    sign_request_id: Optional[str] = None

    @field_validator("signed_at", mode="before")
    @classmethod
    def _dt_utc(cls, v: Any):
        return _as_utc_datetime(v)


class CreateSignRequestIn(CamelModel):
    user_id: str
    month: str                  # YYYY-MM
    manager_signature: str      # dataURL base64 PNG


class EmployeeSignIn(BaseModel):
    token: str
    employee_signature: str     # dataURL base64 PNG


