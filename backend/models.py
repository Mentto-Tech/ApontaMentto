
import enum
import datetime
from typing import List

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Time,
    UniqueConstraint,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserCategory(str, enum.Enum):
    PJ = "pj"
    CLT = "clt"
    ESTAGIARIO = "estagiario"
    DONO = "dono"


# Association table for many-to-many relationship between User and Project
user_project = Table(
    "user_project",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id"), nullable=False),
    Column("project_id", String, ForeignKey("projects.id"), nullable=False),
    UniqueConstraint("user_id", "project_id", name="uq_user_project"),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    hourly_rate: Mapped[float] = mapped_column(Float, nullable=True)
    category: Mapped[UserCategory] = mapped_column(
        Enum(UserCategory), nullable=False, default=UserCategory.CLT
    )
    weekly_hours: Mapped[float] = mapped_column(Float, nullable=True)

    projects: Mapped[List["Project"]] = relationship(
        secondary=user_project, back_populates="users"
    )
    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="user"
    )
    daily_records: Mapped[List["DailyRecord"]] = relationship(
        "DailyRecord", back_populates="user"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    color: Mapped[str] = mapped_column(String)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)

    users: Mapped[List["User"]] = relationship(
        secondary=user_project, back_populates="projects"
    )
    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="project"
    )


class Location(Base):
    __tablename__ = "locations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    address = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    time_entries = relationship("TimeEntry", back_populates="location")


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(String, primary_key=True)
    date = Column(String, nullable=False, index=True)    # YYYY-MM-DD
    start_time = Column(String, nullable=False)           # HH:mm
    end_time = Column(String, nullable=False)             # HH:mm
    notes = Column(Text, default="")
    entry_type = Column(String, default="work", nullable=False)  # "work" | "break"
    is_overtime = Column(Boolean, default=False, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="time_entries")
    project = relationship("Project", back_populates="time_entries")
    location = relationship("Location", back_populates="time_entries")


class DailyRecord(Base):
    """Optional clock-in / clock-out per day, independent of activities."""
    __tablename__ = "daily_records"
    __table_args__ = (
        UniqueConstraint("date", "user_id", name="uq_daily_record_date_user"),
    )

    id = Column(String, primary_key=True)
    date = Column(String, nullable=False, index=True)     # YYYY-MM-DD
    clock_in = Column(String, nullable=True)               # HH:mm
    clock_out = Column(String, nullable=True)              # HH:mm
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="daily_records")
