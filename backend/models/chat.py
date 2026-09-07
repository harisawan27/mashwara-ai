from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

try:
    from sqlalchemy.dialects.postgresql import JSONB
    JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
except Exception:
    JSON_TYPE = JSON

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New Session")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")
    attachment_contexts = relationship("AttachmentContext", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String, nullable=False) # "user", "assistant"
    content = Column(String, nullable=False)
    thinking = Column(String, nullable=True)
    is_agentic = Column(Boolean, default=False)
    meeting_id = Column(String, ForeignKey("meetings.id", use_alter=True), nullable=True)
    attachment_context_id = Column(String, ForeignKey("attachment_contexts.id", ondelete="SET NULL"), nullable=True)
    web_evidence = Column(JSON_TYPE, nullable=True)
    web_search_mode = Column(String(16), nullable=True, default="auto")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")
    meeting = relationship("Meeting", back_populates="chat_message", uselist=False, foreign_keys=[meeting_id])
    attachment_context = relationship("AttachmentContext", back_populates="chat_messages")

    @property
    def attachments(self):
        return self.attachment_context.attachments if self.attachment_context else []
