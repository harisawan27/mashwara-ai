"""
Mashwara AI — Attachment & AttachmentContext Models
====================================================
First-class database models for private document attachments and evidence contexts.
AttachmentContext owns the authorization scope, exact document batch, and Gemini FileSearchStore.
Attachment represents an individual verified uploaded file.
"""

import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from database import Base


class AttachmentContext(Base):
    """
    Authoritative container for a single composer send / selected attachment batch.
    Owns the security scope, lifecycle status, and the isolated Gemini FileSearchStore.
    """
    __tablename__ = "attachment_contexts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=True, index=True)

    guest_scope_id = Column(String(64), nullable=True, index=True)
    guest_scope_secret_hash = Column(String(64), nullable=True) # SHA-256 of guest secret

    gemini_store_name = Column(String(255), nullable=True) # e.g. fileSearchStores/mashwara-...
    status = Column(String(32), default="active", nullable=False, index=True) # active, sealed, deleted

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True, index=True) # 24h retention for guest contexts
    sealed_at = Column(DateTime, nullable=True) # Timestamp when the message/consultation was sent

    # Relationships
    user = relationship("User", back_populates="attachment_contexts")
    session = relationship("ChatSession", back_populates="attachment_contexts")
    attachments = relationship(
        "Attachment",
        back_populates="context",
        cascade="all, delete-orphan",
        order_by="Attachment.created_at"
    )
    chat_messages = relationship("ChatMessage", back_populates="attachment_context")


class Attachment(Base):
    """
    Individual verified file belonging to an AttachmentContext.
    Does not duplicate context-owned authorization, expiry, or store references.
    """
    __tablename__ = "attachments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    attachment_context_id = Column(
        String,
        ForeignKey("attachment_contexts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    display_filename = Column(String(255), nullable=False)
    mime_type = Column(String(128), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    storage_key = Column(String(512), unique=True, nullable=False, index=True)

    status = Column(String(32), default="pending", nullable=False, index=True) # pending, uploaded, processing, ready, failed, deleted
    error_message = Column(String, nullable=True)

    gemini_file_name = Column(String(255), nullable=True) # Gemini file resource or document name

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    context = relationship("AttachmentContext", back_populates="attachments")
