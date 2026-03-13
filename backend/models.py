import datetime
import enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class UserCategory(str, enum.Enum):
    pj = "pj"
    clt = "clt"
    estagiario = "estagiario"
    dono = "dono"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="userrole"),
        nullable=False,
        default=UserRole.user,
    )

    hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overtime_hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[UserCategory] = mapped_column(
        SAEnum(UserCategory, name="usercategory"),
        nullable=False,
        default=UserCategory.clt,
    )
    weekly_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="user", cascade="all, delete-orphan"
    )
    daily_records: Mapped[List["DailyRecord"]] = relationship(
        "DailyRecord", back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="project"
    )


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="location"
    )


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    start_time: Mapped[str] = mapped_column(String, nullable=False)  # HH:mm
    end_time: Mapped[str] = mapped_column(String, nullable=False)  # HH:mm
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entry_type: Mapped[str] = mapped_column(String, nullable=False, default="work")
    is_overtime: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    project_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("projects.id"), nullable=True
    )
    location_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("locations.id"), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="time_entries")
    project: Mapped[Optional[Project]] = relationship("Project", back_populates="time_entries")
    location: Mapped[Optional[Location]] = relationship("Location", back_populates="time_entries")


class DailyRecord(Base):
    """Optional clock-in / clock-out per day, independent of activities."""

    __tablename__ = "daily_records"
    __table_args__ = (
        UniqueConstraint("date", "user_id", name="uq_daily_record_date_user"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    clock_in: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    clock_out: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="daily_records")
