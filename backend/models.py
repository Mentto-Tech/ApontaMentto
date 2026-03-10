import enum
from datetime import datetime

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
from sqlalchemy.orm import relationship

from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.user, nullable=False)
    hourly_rate = Column(Float, nullable=True)
    overtime_hourly_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    time_entries = relationship("TimeEntry", back_populates="user")
    daily_records = relationship("DailyRecord", back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    color = Column(String, default="#0f766e")
    created_at = Column(DateTime, default=datetime.utcnow)

    time_entries = relationship("TimeEntry", back_populates="project")


class Location(Base):
    __tablename__ = "locations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    address = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="daily_records")
