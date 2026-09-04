from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

try:
    from sqlalchemy.dialects.postgresql import JSONB
    JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
except Exception:
    JSON_TYPE = JSON

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    profile_data = Column(JSON_TYPE, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    meetings = relationship("Meeting", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    shared_mashwaras = relationship("SharedMashwara", back_populates="user")
