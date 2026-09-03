from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

try:
    from sqlalchemy.dialects.postgresql import JSONB
    JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
except Exception:
    JSON_TYPE = JSON

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    template = Column(String, nullable=False)
    prompt = Column(String, nullable=False)
    report_data = Column(JSON_TYPE, nullable=True)  # Store the final synthesized report
    streams_data = Column(JSON_TYPE, nullable=True) # Store individual agent streams and roles
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="meetings")
    chat_message = relationship("ChatMessage", back_populates="meeting", uselist=False, primaryjoin="Meeting.id==ChatMessage.meeting_id")
