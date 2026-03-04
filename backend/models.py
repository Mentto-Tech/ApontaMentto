import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SAEnum, Float, ForeignKey, String, Text
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
    created_at = Column(DateTime, default=datetime.utcnow)

    time_entries = relationship("TimeEntry", back_populates="user")


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
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="time_entries")
    project = relationship("Project", back_populates="time_entries")
    location = relationship("Location", back_populates="time_entries")
