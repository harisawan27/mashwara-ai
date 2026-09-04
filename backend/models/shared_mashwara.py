"""
Mashwara AI — Shared Mashwara Model
====================================
Persistent model for public, read-only consultation snapshots.
Uses cryptographically secure unguessable share IDs.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base

try:
    from sqlalchemy.dialects.postgresql import JSONB
    JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
except Exception:
    JSON_TYPE = JSON


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SharedMashwara(Base):
    __tablename__ = "shared_mashwaras"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    share_id = Column(String(64), unique=True, index=True, nullable=False)
    owner_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    language = Column(String(16), nullable=False, default="roman-ur")
    decision_title = Column(String(500), nullable=True)
    snapshot = Column(JSON_TYPE, nullable=False)
    created_at = Column(
        DateTime(timezone=False),
        nullable=False,
        default=utc_now_naive,
    )

    user = relationship("User", back_populates="shared_mashwaras", foreign_keys=[owner_user_id])
