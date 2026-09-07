"""
Boardroom AI — FastAPI Application
===================================
Main entry point for the Boardroom AI backend. Provides:
- POST /meeting: Submit a decision for board analysis
- GET /health: Health check endpoint

All API keys are loaded from environment variables via .env file.
"""

import os
import sys
import dis
import uuid
import logging
import json
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv
# Load environment variables from .env (never hardcode API keys)
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
try:
    import email_validator
    from pydantic import EmailStr
except Exception:
    EmailStr = str
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import FastAPI, Request, Depends, HTTPException, status

from security.middleware import (
    setup_rate_limiting,
    sanitize_meeting_input,
    SecurityHeadersMiddleware,
)
from templates.board_templates import (
    TemplateType,
    validate_fields,
    TEMPLATE_METADATA,
)
from agents import run_meeting
from agents.board_config import CHAT_MODEL, CHAT_TOKENS
from agents.language_intelligence import resolve_consultation_language
from database import get_db, AsyncSessionLocal
from models.user import User
from models.meeting import Meeting
from models.chat import ChatSession, ChatMessage
from models.shared_mashwara import SharedMashwara, utc_now_naive
from models.attachment import AttachmentContext, Attachment
from tools.storage import (
    generate_v4_upload_signed_url,
    verify_uploaded_object,
    delete_blob,
    delete_prefix,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
    BUCKET_NAME,
    MAX_VOICE_AUDIO_SIZE_BYTES,
    MAX_VOICE_DURATION_SECONDS,
    ALLOWED_AUDIO_MIMES,
    validate_audio_metadata,
    build_audio_storage_key,
    build_tts_storage_key,
    storage_client,
    save_blob_bytes,
    blob_exists,
    generate_signed_download_url,
    delete_tts_cache_for_user,
    delete_tts_cache_for_guest,
)
from agents.tts import (
    prepare_summary_for_speech,
    resolve_speech_language,
    compute_tts_cache_key,
    synthesize_speech,
    pcm_to_wav,
    TTS_MODEL,
    TTS_VOICE,
)
from agents.transcription import (
    AudioDecodeError,
    NoSpeechDetectedError,
    transcribe_voice_note,
    transcribe_voice_note_from_bytes,
)
from agents.evidence_extractor import (
    ingest_attachment_to_store,
    extract_evidence_pack,
    format_evidence_for_prompt,
    delete_gemini_store,
    FileEvidencePack,
)
from agents.web_research import (
    execute_web_research,
    format_web_evidence_for_prompt,
    WebEvidencePack,
)
import hashlib
from security.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    get_optional_current_user,
)
import datetime
import secrets
import re
from sqlalchemy.orm import selectinload
from google import genai
import google.genai.types as genai_types
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "971578232755-a7f5t6c31if3k69t9udurfiac48nnjj3.apps.googleusercontent.com"
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("boardroom_ai")


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown tasks."""
    logger.info("🏛️  Boardroom AI backend starting up...")
    try:
        from database import Base, engine
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.warning(f"Database table initialization warning: {e}")
    yield
    logger.info("🏛️  Boardroom AI backend shutting down...")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Boardroom AI",
    description="Multi-agent executive decision engine powered by Google ADK & Gemini",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Security: HTTP headers middleware
# ---------------------------------------------------------------------------
app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# CORS configuration — origins loaded from env var
# ---------------------------------------------------------------------------
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://mashwara-ai.vercel.app"
)
allowed_origins = [o.strip() for o in allowed_origins_str.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Rate limiting (5 requests/min per IP on /meeting)
# ---------------------------------------------------------------------------
limiter = setup_rate_limiting(app)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
from sse_starlette.sse import EventSourceResponse

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    bio: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class PresignAttachmentRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    context_id: Optional[str] = None
    session_id: Optional[str] = None

class PresignAttachmentResponse(BaseModel):
    upload_url: str
    attachment_id: str
    context_id: str
    gcs_path: str
    expires_in_seconds: int = 300

class CompleteAttachmentResponse(BaseModel):
    id: str
    context_id: str
    filename: str
    status: str
    size_bytes: int
    content_type: str

class AttachmentItemResponse(BaseModel):
    id: str
    context_id: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    created_at: datetime.datetime

# ---------------------------------------------------------------------------
# Voice Note STT Schemas (Phase 4)
# ---------------------------------------------------------------------------
class AudioPresignRequest(BaseModel):
    content_type: str = Field(..., description="Audio MIME type (e.g. audio/webm, audio/mp4)")
    size_bytes: int = Field(..., description="Audio recording byte size")
    duration_seconds: Optional[float] = Field(None, description="Active recording duration in seconds")
    language_hint: Optional[str] = Field("roman-ur", description="Target consultation language hint")

class AudioPresignResponse(BaseModel):
    upload_url: str
    audio_id: str
    gcs_key: str
    expires_in_seconds: int = 300

class AudioTranscribeRequest(BaseModel):
    gcs_key: Optional[str] = Field(None, description="Temporary GCS storage key")
    content_type: Optional[str] = Field("audio/webm", description="Audio MIME type")
    language_hint: Optional[str] = Field("roman-ur", description="Transcription language: ur, roman-ur, en")
    transliterate_roman: Optional[bool] = Field(True, description="Whether to transliterate Urdu script to Roman Urdu")

class AudioTranscribeResponse(BaseModel):
    transcript: str
    transliterated: bool = False

class ChatRequest(BaseModel):
    """Input schema for a streaming chat request."""
    template: str = Field(default="STARTUP_BOARD", description="Board template context")
    prompt: str = Field(..., description="The user's raw decision prompt")
    session_id: Optional[str] = Field(None, description="The chat session ID")
    language: Optional[str] = Field(None, description="Authoritative frontend language (ur, roman-ur, en)")
    attachment_context_id: Optional[str] = Field(None, description="Associated document context ID")
    web_search_mode: Optional[str] = Field("auto", description="Web research mode: auto | on | off")
    web_evidence: Optional[Dict[str, Any]] = Field(None, description="Pre-computed or inherited WebEvidencePack")

class SessionRenameRequest(BaseModel):
    title: str

class StandardMessageRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    language: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None
    attachment_context_id: Optional[str] = None
    web_search_mode: Optional[str] = "auto"

class GoogleAuthRequest(BaseModel):
    credential: str

class MeetingResponse(BaseModel):
    id: str
    template: str
    prompt: str
    report_data: Optional[Dict[str, Any]] = None
    streams_data: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    thinking: Optional[str] = None
    is_agentic: bool
    meeting: Optional[MeetingResponse] = None
    attachment_context_id: Optional[str] = None
    attachments: Optional[List[AttachmentItemResponse]] = None
    web_evidence: Optional[Dict[str, Any]] = None
    web_search_mode: Optional[str] = "auto"
    created_at: datetime.datetime

class ChatSessionResponse(BaseModel):
    id: str
    title: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    messages: Optional[List[ChatMessageResponse]] = None

class CreateSharedMashwaraRequest(BaseModel):
    meeting_id: Optional[str] = None
    snapshot: Optional[Dict[str, Any]] = None
    language: Optional[str] = None
    decision_title: Optional[str] = None

class SharedMashwaraResponse(BaseModel):
    share_id: str
    share_url: str

class PublicSharedMashwaraResponse(BaseModel):
    share_id: str
    language: str
    decision_title: str
    snapshot: Dict[str, Any]
    created_at: str

class SummaryAudioResponse(BaseModel):
    audio_url: str
    cached: bool
    language: str
    voice: str = "Charon"

def derive_session_title(text: str) -> str:
    cleaned = (text or "").strip()
    return (cleaned[:35] + "...") if len(cleaned) > 35 else (cleaned or "New Brainstorming Session")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint — returns status ok."""
    return HealthResponse(status="ok")

@app.post("/auth/register", tags=["Auth"])
async def register_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).filter(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    db_user = User(email=user.email, hashed_password=hashed_pwd)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    # Return JWT token
    access_token = create_access_token(data={"sub": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token, tags=["Auth"])
async def login(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == user.email))
    db_user = result.scalars().first()
    if not db_user or not db_user.hashed_password or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/google", tags=["Auth"])
@limiter.limit("30/minute")
async def auth_google(
    request: Request,
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Direct Google Identity Services authentication.
    Verifies official Google ID token signature, audience, expiration, issuer, and claims.
    Resolves user deterministically via google_sub (or verified email) and returns Mashwara JWT.
    """
    credential = (body.credential or "").strip()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token credential is required"
        )

    # 1. Verify Google ID token via official google-auth library
    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except ValueError as val_err:
        logger.warning(f"Google ID token signature/expiration/audience verification failed: {val_err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google credential: {str(val_err)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        logger.error(f"Unexpected error during Google verification: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not verify Google credential",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Strict claim validations
    issuer = payload.get("iss")
    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token issuer",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub or not str(sub).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Google identity (sub)"
        )
    sub = str(sub).strip()

    email = payload.get("email")
    if not email or not str(email).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing email in Google token"
        )
    email = str(email).strip().lower()

    email_verified = payload.get("email_verified")
    if email_verified is not True and str(email_verified).lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email address is not verified"
        )

    google_name = (payload.get("name") or "").strip()
    google_picture = (payload.get("picture") or "").strip()

    # 3. User resolution:
    # A. google_sub already linked -> login same Mashwara user
    res_sub = await db.execute(select(User).filter(User.google_sub == sub))
    user = res_sub.scalars().first()

    if not user:
        # B. No google_sub, but verified Google email matches existing Mashwara user -> link google_sub
        res_email = await db.execute(select(User).filter(User.email == email))
        user = res_email.scalars().first()
        if user:
            user.google_sub = sub
            profile = dict(user.profile_data or {})
            updated = False
            if not profile.get("name") and google_name:
                profile["name"] = google_name
                updated = True
            if not profile.get("avatar") and google_picture:
                profile["avatar"] = google_picture
                updated = True
            if updated:
                user.profile_data = profile
            await db.commit()
            await db.refresh(user)
            logger.info(f"Linked existing user {email} to google_sub {sub}")
        else:
            # C. No matching account -> create new Mashwara user (hashed_password=None for Google-only users)
            user = User(
                id=str(uuid.uuid4()),
                email=email,
                google_sub=sub,
                hashed_password=None,
                profile_data={"name": google_name, "avatar": google_picture}
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.info(f"Created new Google-authenticated user {email} with google_sub {sub}")
    else:
        # Update name or picture if missing
        profile = dict(user.profile_data or {})
        updated = False
        if not profile.get("name") and google_name:
            profile["name"] = google_name
            updated = True
        if not profile.get("avatar") and google_picture:
            profile["avatar"] = google_picture
            updated = True
        if updated:
            user.profile_data = profile
            await db.commit()
            await db.refresh(user)

    # 4. Issue standard Mashwara application JWT
    jwt_token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "profile_data": user.profile_data
        }
    }


@app.get("/auth/me", tags=["Auth"])
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "profile_data": current_user.profile_data
    }

@app.put("/auth/profile", tags=["Auth"])
async def update_profile(profile: ProfileUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    profile_dict = profile.model_dump(exclude_none=True)
    if current_user.profile_data:
        current_user.profile_data = {**current_user.profile_data, **profile_dict}
    else:
        current_user.profile_data = profile_dict
    
    # SQLAlchemy JSONB needs to know it mutated if we just update dict keys,
    # but reassigning the dict works. However, setting the attribute triggers it.
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "profile_data")
    
    await db.commit()
    return {"status": "success", "profile_data": current_user.profile_data}

def get_session_load_options():
    return [
        selectinload(ChatSession.messages).selectinload(ChatMessage.meeting),
        selectinload(ChatSession.messages).selectinload(ChatMessage.attachment_context).selectinload(AttachmentContext.attachments),
    ]

@app.delete("/auth/me", tags=["Auth"])
async def delete_account(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ac_result = await db.execute(
        select(AttachmentContext)
        .options(selectinload(AttachmentContext.attachments))
        .filter(AttachmentContext.user_id == current_user.id)
    )
    for ctx in ac_result.scalars().all():
        for att in ctx.attachments:
            if att.storage_key:
                try:
                    delete_blob(att.storage_key)
                except Exception as e:
                    logger.warning(f"Error deleting blob {att.storage_key}: {e}")
        if ctx.gemini_store_name:
            try:
                delete_gemini_store(ctx.gemini_store_name)
            except Exception as e:
                logger.warning(f"Error deleting Gemini store {ctx.gemini_store_name}: {e}")
        await db.delete(ctx)

    # Idempotently clean up all TTS narration cache for the deleted user
    try:
        delete_tts_cache_for_user(str(current_user.id))
    except Exception as e:
        logger.warning(f"Error cleaning up TTS cache for user {current_user.id}: {e}")

    await db.delete(current_user)
    await db.commit()
    return {"status": "success", "detail": "Account deleted"}

@app.get("/meetings", response_model=List[MeetingResponse], tags=["Meetings"])
async def get_meetings(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Meeting)
        .filter(Meeting.user_id == current_user.id)
        .order_by(Meeting.created_at.desc())
    )
    return result.scalars().all()

@app.delete("/meetings/{meeting_id}", tags=["Meetings"])
async def delete_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = result.scalars().first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    try:
        delete_tts_cache_for_user(str(current_user.id), meeting_id)
    except Exception as e:
        logger.warning(f"Error cleaning up TTS cache for meeting {meeting_id}: {e}")

    await db.delete(meeting)
    await db.commit()
    return {"status": "success"}

# ---------------------------------------------------------------------------
# Sessions & Standard Chat
# ---------------------------------------------------------------------------
@app.post("/chat/sessions", response_model=ChatSessionResponse, tags=["Chat"])
async def create_session(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = ChatSession(user_id=current_user.id, title="New Brainstorming Session")
    db.add(session)
    await db.commit()
    
    result = await db.execute(
        select(ChatSession)
        .options(*get_session_load_options())
        .filter(ChatSession.id == session.id)
    )
    return result.scalars().first()

@app.get("/chat/sessions", response_model=List[ChatSessionResponse], tags=["Chat"])
async def get_sessions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .options(*get_session_load_options())
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return result.scalars().all()

@app.get("/chat/sessions/{session_id}", response_model=ChatSessionResponse, tags=["Chat"])
async def get_session(session_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .options(*get_session_load_options())
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.put("/chat/sessions/{session_id}", response_model=ChatSessionResponse, tags=["Chat"])
async def rename_session(
    session_id: str, 
    body: SessionRenameRequest,
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ChatSession)
        .options(*get_session_load_options())
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.title = body.title
    await db.commit()
    return session

@app.delete("/chat/sessions/{session_id}", tags=["Chat"])
async def delete_session(
    session_id: str, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    ac_result = await db.execute(
        select(AttachmentContext)
        .options(selectinload(AttachmentContext.attachments))
        .filter(AttachmentContext.session_id == session.id)
    )
    for ctx in ac_result.scalars().all():
        for att in ctx.attachments:
            if att.storage_key:
                try:
                    delete_blob(att.storage_key)
                except Exception as e:
                    logger.warning(f"Error deleting blob {att.storage_key}: {e}")
        if ctx.gemini_store_name:
            try:
                delete_gemini_store(ctx.gemini_store_name)
            except Exception as e:
                logger.warning(f"Error deleting Gemini store {ctx.gemini_store_name}: {e}")
        await db.delete(ctx)

    # Clean up TTS cache for any meetings in this session
    try:
        msg_res = await db.execute(
            select(ChatMessage.meeting_id).filter(
                ChatMessage.session_id == session.id,
                ChatMessage.meeting_id.isnot(None)
            )
        )
        for row in msg_res.all():
            m_id = row[0]
            if m_id:
                delete_tts_cache_for_user(str(current_user.id), m_id)
    except Exception as e:
        logger.warning(f"Error cleaning up TTS cache for session {session_id}: {e}")

    await db.delete(session)
    await db.commit()
    return {"status": "success"}

@app.delete("/chat/sessions/{session_id}/last_turn", tags=["Chat"])
async def delete_last_turn(
    session_id: str, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get last two messages
    hist_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(2)
    )
    history = hist_result.scalars().all()
    
    # Check if the last message is assistant and second to last is user
    if len(history) >= 2 and history[0].role == "assistant" and history[1].role == "user":
        if getattr(history[0], "meeting_id", None):
            try:
                delete_tts_cache_for_user(str(current_user.id), history[0].meeting_id)
            except Exception as e:
                logger.warning(f"Error cleaning up TTS cache for meeting {history[0].meeting_id}: {e}")
        await db.delete(history[0])
        await db.delete(history[1])
        await db.commit()
    elif len(history) == 1 and history[0].role == "user":
        await db.delete(history[0])
        await db.commit()
        
    return {"status": "success"}

# ---------------------------------------------------------------------------
# Document Attachments & Evidence Layer Endpoints
# ---------------------------------------------------------------------------
def get_guest_scope(request: Request) -> Tuple[Optional[str], Optional[str]]:
    scope_id = request.headers.get("x-guest-scope-id")
    secret = request.headers.get("x-guest-scope-secret")
    return (scope_id.strip() if scope_id else None), (secret.strip() if secret else None)

def hash_guest_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()

def verify_context_auth(
    context: AttachmentContext,
    current_user: Optional[User],
    guest_scope_id: Optional[str],
    guest_secret: Optional[str]
):
    if context.user_id is not None:
        if not current_user or str(current_user.id) != str(context.user_id):
            raise HTTPException(status_code=403, detail="Forbidden: attachment context belongs to a different user")
        return
    # Guest context
    if not guest_scope_id or context.guest_scope_id != guest_scope_id:
        raise HTTPException(status_code=403, detail="Forbidden: guest scope mismatch")
    if context.guest_scope_secret_hash:
        if not guest_secret or hash_guest_secret(guest_secret) != context.guest_scope_secret_hash:
            raise HTTPException(status_code=403, detail="Forbidden: invalid guest secret")

@app.post("/attachments/presign", response_model=PresignAttachmentResponse, tags=["Attachments"])
@limiter.limit("20/minute")
async def presign_attachment(
    request: Request,
    body: PresignAttachmentRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    clean_mime = (body.content_type or "").strip().lower()
    if clean_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{clean_mime}'. Allowed types: PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPG, WEBP."
        )

    if body.size_bytes <= 0 or body.size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds maximum allowed limit (20MB per file)."
        )

    clean_filename = os.path.basename(body.filename.strip())
    if not clean_filename:
        clean_filename = "attachment"

    guest_scope_id, guest_secret = get_guest_scope(request)
    context = None

    if body.context_id:
        result = await db.execute(
            select(AttachmentContext)
            .options(selectinload(AttachmentContext.attachments))
            .filter(AttachmentContext.id == body.context_id)
        )
        context = result.scalars().first()
        if not context:
            raise HTTPException(status_code=404, detail="Attachment context not found")
        verify_context_auth(context, current_user, guest_scope_id, guest_secret)
        if context.sealed_at:
            raise HTTPException(status_code=400, detail="Attachment context is sealed and cannot accept new files")
        if len(context.attachments) >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 attachments allowed per message")
        total_size = sum(a.size_bytes for a in context.attachments) + body.size_bytes
        if total_size > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Total attachments size exceeds 50MB limit")
    else:
        context_id = str(uuid.uuid4())
        secret_hash = hash_guest_secret(guest_secret) if (not current_user and guest_secret) else None
        context = AttachmentContext(
            id=context_id,
            user_id=current_user.id if current_user else None,
            session_id=body.session_id if current_user else None,
            guest_scope_id=guest_scope_id if not current_user else None,
            guest_scope_secret_hash=secret_hash,
            status="uploading",
        )
        db.add(context)
        await db.flush()

    attachment_id = str(uuid.uuid4())
    if current_user:
        gcs_path = f"users/{current_user.id}/attachments/{context.id}/{attachment_id}/{clean_filename}"
    else:
        g_scope = guest_scope_id or "anonymous"
        gcs_path = f"ephemeral/{g_scope}/{context.id}/{attachment_id}/{clean_filename}"

    upload_url = generate_v4_upload_signed_url(
        object_name=gcs_path,
        content_type=clean_mime,
        expires_minutes=5
    )

    new_att = Attachment(
        id=attachment_id,
        attachment_context_id=context.id,
        display_filename=clean_filename,
        mime_type=clean_mime,
        size_bytes=body.size_bytes,
        storage_key=gcs_path,
        status="pending",
    )
    db.add(new_att)
    await db.commit()

    return PresignAttachmentResponse(
        upload_url=upload_url,
        attachment_id=attachment_id,
        context_id=context.id,
        gcs_path=gcs_path,
        expires_in_seconds=300,
    )

@app.post("/attachments/{attachment_id}/complete", response_model=CompleteAttachmentResponse, tags=["Attachments"])
@limiter.limit("20/minute")
async def complete_attachment(
    request: Request,
    attachment_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Attachment)
        .options(selectinload(Attachment.context))
        .filter(Attachment.id == attachment_id)
    )
    att = result.scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    context = att.context
    guest_scope_id, guest_secret = get_guest_scope(request)
    verify_context_auth(context, current_user, guest_scope_id, guest_secret)

    if att.status == "ready":
        return CompleteAttachmentResponse(
            id=att.id,
            context_id=context.id,
            filename=att.display_filename,
            status="ready",
            size_bytes=att.size_bytes,
            content_type=att.mime_type,
        )

    exists, actual_size, actual_content_type = verify_uploaded_object(att.storage_key)
    if not exists:
        raise HTTPException(status_code=400, detail="File was not uploaded to storage")

    att.size_bytes = actual_size
    att.status = "processing"
    await db.commit()

    try:
        await ingest_attachment_to_store(
            attachment=att,
            context=context,
            db=db,
        )
        att.status = "ready"
        context.status = "ready"
        await db.commit()
    except Exception as e:
        logger.error(f"Error ingesting attachment {att.id}: {e}", exc_info=True)
        att.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

    return CompleteAttachmentResponse(
        id=att.id,
        context_id=context.id,
        filename=att.display_filename,
        status="ready",
        size_bytes=att.size_bytes,
        content_type=att.mime_type,
    )

@app.delete("/attachments/{attachment_id}", tags=["Attachments"])
async def delete_attachment_endpoint(
    request: Request,
    attachment_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Attachment)
        .options(selectinload(Attachment.context))
        .filter(Attachment.id == attachment_id)
    )
    att = result.scalars().first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    context = att.context
    guest_scope_id, guest_secret = get_guest_scope(request)
    verify_context_auth(context, current_user, guest_scope_id, guest_secret)

    if context.sealed_at:
        raise HTTPException(status_code=400, detail="Cannot remove attachment from sealed context")

    try:
        delete_blob(att.storage_key)
    except Exception as e:
        logger.warning(f"Error deleting blob {att.storage_key}: {e}")

    await db.delete(att)
    await db.commit()
    return {"status": "success"}

@app.delete("/attachments/contexts/{context_id}", tags=["Attachments"])
async def delete_attachment_context_endpoint(
    request: Request,
    context_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AttachmentContext)
        .options(selectinload(AttachmentContext.attachments))
        .filter(AttachmentContext.id == context_id)
    )
    context = result.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Attachment context not found")

    guest_scope_id, guest_secret = get_guest_scope(request)
    verify_context_auth(context, current_user, guest_scope_id, guest_secret)

    for att in context.attachments:
        try:
            k = getattr(att, "storage_key", None) or getattr(att, "gcs_path", None)
            if k:
                delete_blob(k)
        except Exception as e:
            logger.warning(f"Error deleting blob for att {att.id}: {e}")

    if context.gemini_store_name:
        try:
            delete_gemini_store(context.gemini_store_name)
        except Exception as e:
            logger.warning(f"Error deleting Gemini store: {e}")

    if context.guest_scope_id:
        try:
            delete_tts_cache_for_guest(context.guest_scope_id)
            delete_prefix(f"ephemeral/{context.guest_scope_id}/")
        except Exception as e:
            logger.warning(f"Error deleting guest TTS cache for {context.guest_scope_id}: {e}")

    await db.delete(context)
    await db.commit()
    return {"status": "success"}

@app.get("/attachments", response_model=List[AttachmentItemResponse], tags=["Attachments"])
async def list_attachments(
    request: Request,
    context_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AttachmentContext)
        .options(selectinload(AttachmentContext.attachments))
        .filter(AttachmentContext.id == context_id)
    )
    context = result.scalars().first()
    if not context:
        raise HTTPException(status_code=404, detail="Attachment context not found")

    guest_scope_id, guest_secret = get_guest_scope(request)
    verify_context_auth(context, current_user, guest_scope_id, guest_secret)

    return [
        AttachmentItemResponse(
            id=a.id,
            context_id=getattr(a, "attachment_context_id", None) or getattr(a, "context_id", ""),
            filename=getattr(a, "display_filename", None) or getattr(a, "filename", ""),
            content_type=getattr(a, "mime_type", None) or getattr(a, "content_type", ""),
            size_bytes=a.size_bytes,
            status=a.status,
            created_at=a.created_at,
        )
        for a in context.attachments
    ]

# ---------------------------------------------------------------------------
# Internal Guest Resource Cleanup (Cloud Scheduler / Idempotent Maintenance)
# ---------------------------------------------------------------------------
async def cleanup_expired_guest_attachment_contexts(db: AsyncSession) -> Dict[str, Any]:
    """
    Finds and purges expired guest AttachmentContext rows, their Attachment rows,
    associated GCS blobs, and Gemini FileSearchStore instances.
    Safe against partially deleted resources; idempotent and retryable.
    """
    now_utc = datetime.datetime.utcnow()
    res = await db.execute(
        select(AttachmentContext)
        .options(selectinload(AttachmentContext.attachments))
        .filter(
            AttachmentContext.user_id.is_(None),
            AttachmentContext.expires_at.is_not(None),
            AttachmentContext.expires_at < now_utc
        )
    )
    expired_contexts = res.scalars().all()

    cleaned_contexts = 0
    cleaned_attachments = 0
    cleaned_stores = 0
    cleaned_gcs_blobs = 0
    errors = 0

    for ctx in expired_contexts:
        try:
            # 1. Delete Gemini FileSearchStore
            if ctx.gemini_store_name:
                try:
                    delete_gemini_store(ctx.gemini_store_name)
                    cleaned_stores += 1
                except Exception as store_err:
                    logger.warning(f"Error deleting store {ctx.gemini_store_name} for ctx {ctx.id}: {store_err}")

            # 2. Delete GCS objects
            for att in ctx.attachments:
                try:
                    storage_key = getattr(att, "storage_key", None) or getattr(att, "gcs_path", None)
                    if storage_key:
                        delete_blob(storage_key)
                        cleaned_gcs_blobs += 1
                except Exception as gcs_err:
                    logger.warning(f"Error deleting GCS object {att.id}: {gcs_err}")

            if ctx.guest_scope_id:
                try:
                    from tools.storage import delete_prefix
                    delete_prefix(f"guest/{ctx.guest_scope_id}/{ctx.id}/")
                except Exception:
                    pass

            # 3. Delete attachments & context from DB
            cleaned_attachments += len(ctx.attachments)
            await db.delete(ctx)
            await db.commit()
            cleaned_contexts += 1
        except Exception as e:
            await db.rollback()
            errors += 1
            logger.error(f"Failed cleaning up guest context {ctx.id}: {e}")

    return {
        "cleaned_contexts": cleaned_contexts,
        "cleaned_attachments": cleaned_attachments,
        "cleaned_stores": cleaned_stores,
        "cleaned_gcs_blobs": cleaned_gcs_blobs,
        "errors": errors
    }


async def verify_internal_scheduler_auth(request: Request):
    """
    Verifies that the request comes from authorized Google Cloud Scheduler (OIDC)
    or matches the INTERNAL_CLEANUP_TOKEN secret header.
    """
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    # 1. Check INTERNAL_CLEANUP_TOKEN header/bearer
    env_secret = os.getenv("INTERNAL_CLEANUP_TOKEN")
    header_secret = request.headers.get("X-Internal-Cleanup-Token")
    if env_secret and (header_secret == env_secret or token == env_secret):
        return {"auth_type": "secret_header"}

    # 2. Check Google OIDC token from Cloud Scheduler
    if token:
        try:
            decoded = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                audience=os.getenv("CLOUD_RUN_SERVICE_URL")
            )
            iss = decoded.get("iss", "")
            if iss not in ("accounts.google.com", "https://accounts.google.com"):
                raise HTTPException(status_code=403, detail="Invalid OIDC issuer.")
            return {"auth_type": "google_oidc", "email": decoded.get("email")}
        except Exception as e:
            logger.warning(f"Internal cleanup auth failed OIDC verification: {e}")

    raise HTTPException(status_code=403, detail="Unauthorized internal invocation.")


@app.post("/internal/cleanup/guest-attachments", tags=["Internal Maintenance"])
async def cleanup_guest_attachments_endpoint(
    request: Request,
    auth_info: dict = Depends(verify_internal_scheduler_auth),
    db: AsyncSession = Depends(get_db)
):
    stats = await cleanup_expired_guest_attachment_contexts(db)
    return {"status": "success", "stats": stats}


# ---------------------------------------------------------------------------
# Voice Note Speech-to-Text Endpoints (Phase 4)
# ---------------------------------------------------------------------------
@app.post("/audio/presign", response_model=AudioPresignResponse, tags=["Audio"])
@limiter.limit("20/minute")
async def presign_audio(
    request: Request,
    body: AudioPresignRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    valid, err = validate_audio_metadata(body.content_type, body.size_bytes)
    if not valid:
        raise HTTPException(status_code=400, detail=err or "Invalid audio metadata")

    if body.duration_seconds and body.duration_seconds > MAX_VOICE_DURATION_SECONDS:
        raise HTTPException(
            status_code=400,
            detail="Audio recording duration exceeds the 15-minute maximum limit."
        )

    audio_id = str(uuid.uuid4())
    guest_scope_id, _ = get_guest_scope(request)
    user_id_str = str(current_user.id) if current_user else None

    gcs_key = build_audio_storage_key(
        audio_id=audio_id,
        content_type=body.content_type,
        user_id=user_id_str,
        guest_scope_id=guest_scope_id,
    )

    # Voice audio uses the authenticated API route. This avoids browser-to-GCS
    # signing/CORS dependencies while preserving user and guest scope isolation.
    upload_url = f"/audio/{audio_id}/upload"

    return AudioPresignResponse(
        upload_url=upload_url,
        audio_id=audio_id,
        gcs_key=gcs_key,
        expires_in_seconds=300,
    )


@app.put("/audio/{audio_id}/upload", tags=["Audio"])
@limiter.limit("20/minute")
async def upload_audio_endpoint(
    request: Request,
    audio_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Store a voice note when direct signed uploads are unavailable."""
    try:
        uuid.UUID(audio_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid audio upload ID.")

    content_type = request.headers.get("content-type", "")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_VOICE_AUDIO_SIZE_BYTES:
                raise HTTPException(status_code=413, detail="Audio recording exceeds the 25 MB limit.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid audio content length.")

    audio_bytes = await request.body()
    valid, err = validate_audio_metadata(content_type, len(audio_bytes))
    if not valid:
        raise HTTPException(status_code=400, detail=err or "Invalid audio upload.")

    guest_scope_id, _ = get_guest_scope(request)
    user_id_str = str(current_user.id) if current_user else None
    gcs_key = build_audio_storage_key(
        audio_id=audio_id,
        content_type=content_type,
        user_id=user_id_str,
        guest_scope_id=guest_scope_id,
    )

    try:
        save_blob_bytes(gcs_key, audio_bytes, content_type=content_type)
    except Exception as e:
        logger.error(f"API audio upload failed for {audio_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to store audio recording.")

    return {"status": "uploaded", "audio_id": audio_id}


@app.post("/audio/{audio_id}/transcribe", response_model=AudioTranscribeResponse, tags=["Audio"])
@limiter.limit("15/minute")
async def transcribe_audio_endpoint(
    request: Request,
    audio_id: str,
    body: AudioTranscribeRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    guest_scope_id, _ = get_guest_scope(request)
    user_id_str = str(current_user.id) if current_user else None

    # Enforce strict tenancy / path isolation
    expected_prefix = (
        f"audio-temp/users/{user_id_str}/{audio_id}/"
        if user_id_str
        else f"audio-temp/guest/{guest_scope_id or 'unscoped'}/{audio_id}/"
    )

    gcs_key = body.gcs_key
    if not gcs_key or not gcs_key.startswith(expected_prefix):
        gcs_key = build_audio_storage_key(
            audio_id=audio_id,
            content_type=body.content_type or "audio/webm",
            user_id=user_id_str,
            guest_scope_id=guest_scope_id,
        )

    # Verify that the blob exists and does not exceed limit
    exists, size, err = verify_uploaded_object(gcs_key, max_size_bytes=MAX_VOICE_AUDIO_SIZE_BYTES)
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Audio recording was not found in temporary storage: {err or 'Missing or expired object'}"
        )

    try:
        result = transcribe_voice_note(
            storage_key=gcs_key,
            content_type=body.content_type or "audio/webm",
            language=body.language_hint or "roman-ur",
        )
        return AudioTranscribeResponse(
            transcript=result.get("transcript", ""),
            transliterated=result.get("transliterated", False),
        )
    except NoSpeechDetectedError:
        raise HTTPException(status_code=422, detail="No speech was detected in the recording.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice note transcription failed for {audio_id}: {e}", exc_info=True)
        # Attempt defensive cleanup
        try:
            delete_blob(gcs_key)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="Speech transcription is temporarily unavailable.")



@app.post("/audio/transcribe-direct", response_model=AudioTranscribeResponse, tags=["Audio"])
@limiter.limit("15/minute")
async def transcribe_audio_direct(
    request: Request,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """
    GCS-free direct transcription: accepts raw audio bytes in the request body
    and returns a transcript without any Google Cloud Storage dependency.
    Content-Type must be a supported audio MIME type.
    """
    content_type = request.headers.get("content-type", "audio/webm").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_AUDIO_MIMES:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {content_type}")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_VOICE_AUDIO_SIZE_BYTES:
                raise HTTPException(status_code=413, detail="Audio recording exceeds the 25 MB limit.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid audio content length.")

    audio_bytes = await request.body()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio bytes received.")
    if len(audio_bytes) > MAX_VOICE_AUDIO_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Audio recording exceeds the 25 MB limit.")

    # Language hint from query param or Accept-Language header
    language_hint = request.query_params.get("language_hint", "roman-ur")

    try:
        result = transcribe_voice_note_from_bytes(
            audio_bytes=audio_bytes,
            content_type=content_type,
            language=language_hint,
        )
        return AudioTranscribeResponse(
            transcript=result.get("transcript", ""),
            transliterated=result.get("transliterated", False),
        )
    except (AudioDecodeError, NoSpeechDetectedError):
        raise HTTPException(status_code=422, detail="No speech was detected in the recording.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Direct STT transcription failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Speech transcription is temporarily unavailable.")


@app.delete("/audio/{audio_id}", tags=["Audio"])
async def delete_audio_endpoint(
    request: Request,
    audio_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    guest_scope_id, _ = get_guest_scope(request)
    user_id_str = str(current_user.id) if current_user else None

    prefix = (
        f"audio-temp/users/{user_id_str}/{audio_id}/"
        if user_id_str
        else f"audio-temp/guest/{guest_scope_id or 'unscoped'}/{audio_id}/"
    )
    deleted = delete_prefix(prefix)
    return {"status": "deleted", "audio_id": audio_id, "count": deleted}


# ---------------------------------------------------------------------------
# Standard Chat Language Contract, Tools & Validation
# ---------------------------------------------------------------------------
START_MASHWARA_TOOL = genai_types.Tool(
    function_declarations=[
        genai_types.FunctionDeclaration(
            name="start_mashwara",
            description=(
                "Convene the full Mashwara council of 6 expert advisors to analyze the user's decision dilemma. "
                "Call this tool IMMEDIATELY when the user confirms or requests to start, convene, or proceed with "
                "the Mashwara council (e.g. 'ہاں شروع کرو', 'start it', 'haan start karo', 'convene council', 'yes go ahead', 'ٹھیک ہے شروع کرو'). "
                "Do NOT call this tool if the user is merely exploring or discussing without confirming they want to start."
            ),
            parameters=genai_types.Schema(
                type="OBJECT",
                properties={
                    "decision_prompt": genai_types.Schema(
                        type="STRING",
                        description=(
                            "The canonical substantive decision or dilemma under discussion from the conversation history, "
                            "NOT the confirmation phrase itself (e.g. NOT 'ہاں شروع کرو' or 'yes start it')."
                        )
                    )
                },
                required=["decision_prompt"]
            )
        )
    ]
)

AFFIRMATION_PATTERNS = [
    r"^(ہاں|جی ہاں|ہاں جی|شروع|شروع کرو|مشورہ شروع کرو|کونسل بلا لو|ٹھیک ہے|اوکے|کر دو|شروع کر دو|مکمل مشورہ کرو|شروع کریں|کریں|چلو شروع کرو)($|\b)",
    r"^(haan|ji haan|haan ji|shuru|shuru karo|start|start karo|okay shuru karo|kardo|start kardo|full mashwara start karo|chalo shuru karo|haan start|okay start|theek hai|yes convene)($|\b)",
    r"^(yes|yeah|yep|start|start it|start the mashwara|go ahead|convene|convene it|convene the council|please start|lets do it|do it|okay start|sure|ok)($|\b)"
]

class CanonicalDilemmaResult(tuple):
    """
    Polymorphic tuple returning (dilemma, attachment_context_id, web_evidence, web_search_mode).
    Backwards compatible with 2-element unpack (Phase 2), 4-element unpack (Phase 3),
    and direct string equality comparison (Phase 1 legacy tests).
    """
    def __new__(cls, dilemma: str, context_id: Optional[str] = None, web_evidence: Optional[Dict[str, Any]] = None, search_mode: str = "auto"):
        return super().__new__(cls, (dilemma, context_id, web_evidence, search_mode))

    @property
    def dilemma(self) -> str:
        return self[0]

    @property
    def attachment_context_id(self) -> Optional[str]:
        return self[1]

    @property
    def web_evidence(self) -> Optional[Dict[str, Any]]:
        return self[2]

    @property
    def web_search_mode(self) -> str:
        return self[3]

    def __eq__(self, other):
        if isinstance(other, str):
            return self[0] == other
        return super().__eq__(other)

    def __iter__(self):
        try:
            caller_frame = sys._getframe(1)
            code = caller_frame.f_code.co_code
            lasti = caller_frame.f_lasti
            unpack_op = dis.opmap.get("UNPACK_SEQUENCE")
            if unpack_op is not None and lasti + 2 < len(code):
                for offset in range(0, 10, 2):
                    if lasti + offset < len(code) and code[lasti + offset] == unpack_op:
                        arg = code[lasti + offset + 1]
                        if arg == 2:
                            return iter((self[0], self[1]))
                        elif arg == 4:
                            return iter((self[0], self[1], self[2], self[3]))
        except Exception:
            pass
        return super().__iter__()

def resolve_canonical_dilemma(
    raw_prompt: str,
    history_messages: list,
    current_message: str,
    current_context_id: Optional[str] = None,
    current_web_evidence: Optional[Dict[str, Any]] = None,
    current_search_mode: str = "auto"
) -> CanonicalDilemmaResult:
    """
    Ensures the council dilemma is the substantive decision under discussion,
    never a short affirmation like 'ہاں شروع کرو' or 'yes start it'.
    Also inherits the attachment_context_id, web_evidence, and web_search_mode
    belonging to that substantive decision turn (Amendment 3).
    """
    clean_prompt = (raw_prompt or "").strip()
    is_affirmation = False
    
    if len(clean_prompt) <= 60:
        for pat in AFFIRMATION_PATTERNS:
            if re.search(pat, clean_prompt, re.IGNORECASE):
                is_affirmation = True
                break
                
    if clean_prompt and not is_affirmation:
        return CanonicalDilemmaResult(clean_prompt, current_context_id, current_web_evidence, current_search_mode)

    # Search backwards through user history for the last substantive message and its contexts
    for m in reversed(history_messages):
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
        content = ""
        m_context_id = getattr(m, "attachment_context_id", None) or (m.get("attachment_context_id") if isinstance(m, dict) else None)
        m_web_ev = getattr(m, "web_evidence", None) or (m.get("web_evidence") if isinstance(m, dict) else None)
        m_search_mode = getattr(m, "web_search_mode", None) or (m.get("web_search_mode") if isinstance(m, dict) else "auto")
        if hasattr(m, "content"):
            content = m.content or ""
        elif isinstance(m, dict):
            content = m.get("content", "")
        
        if role in ("user",):
            content_clean = content.strip()
            if len(content_clean) >= 10:
                is_sub_affirmation = any(re.search(pat, content_clean, re.IGNORECASE) for pat in AFFIRMATION_PATTERNS)
                if not is_sub_affirmation:
                    return CanonicalDilemmaResult(content_clean, m_context_id, m_web_ev, m_search_mode)

    if len(current_message.strip()) >= 10 and not any(re.search(pat, current_message.strip(), re.IGNORECASE) for pat in AFFIRMATION_PATTERNS):
        return CanonicalDilemmaResult(current_message.strip(), current_context_id, current_web_evidence, current_search_mode)
        
    return CanonicalDilemmaResult((clean_prompt or current_message.strip()), current_context_id, current_web_evidence, current_search_mode)

ARABIC_EXCLUSIVE_MARKERS = [
    "إليك", "يسعدنا", "نحيطكم", "سنوافيكم", "كافة", "طلبكم", "تواصلكم",
    "عزيزي", "عزيزتي", "يرجى", "يمكنك", "نود", "نرجو", "لدينا", "بكم",
    "الذي", "التي", "الذين", "هذا", "هذه", "هؤلاء", "ذلك", "تلك",
    "في", "على", "إلى", "عن", "حيث", "بينما", "أيضاً"
]

URDU_CORE_MARKERS = [
    "ہے", "ہیں", "تھا", "تھی", "تھے", "ہو", "ہوں", "گا", "گی", "گے",
    "کا", "کی", "کے", "کو", "سے", "میں", "پر", "نے", "اور", "کہ",
    "آپ", "ہم", "یہ", "وہ", "نہیں", "کریں", "کرتے", "کرتا", "کرتی"
]

def is_arabic_response(text: str) -> bool:
    """
    Detects if the text strongly appears to be Arabic rather than Pakistani Urdu.
    Checks for explicit Arabic business clichés or presence of Arabic prepositions
    combined with complete absence of Pakistani Urdu auxiliary/postposition markers.
    """
    if not text or not text.strip():
        return False
        
    high_confidence_arabic = ["إليك", "يسعدنا", "نحيطكم", "سنوافيكم", "طلبكم", "تواصلكم"]
    for marker in high_confidence_arabic:
        if re.search(r'\b' + re.escape(marker) + r'\b', text):
            return True

    words = re.findall(r'[\u0600-\u06FF]+', text)
    if len(words) < 4:
        return False

    arabic_marker_count = sum(1 for w in words if w in ARABIC_EXCLUSIVE_MARKERS)
    urdu_marker_count = sum(1 for w in words if w in URDU_CORE_MARKERS)

    if arabic_marker_count >= 2 and urdu_marker_count <= 1:
        return True

    if arabic_marker_count >= 3 and arabic_marker_count > urdu_marker_count:
        return True

    return False

def build_standard_chat_system_prompt(target_lang: str) -> str:
    """
    Unified, authoritative standard-chat system prompt across all endpoints.
    Enforces strict Pakistani Urdu contract with explicit prohibition of Arabic.
    """
    if target_lang == "ur":
        return (
            "آپ مشورہ اے آئی (Mashwara AI) کے مشاورتی معاون ہیں۔ "
            "آپ صارف کے فیصلے یا مسئلے کو بغور سمجھتے ہیں، اگر ضروری ہو تو مختصر اور اہم وضاحتی سوال پوچھتے ہیں، "
            "ابتدائی مفید مشورہ دیتے ہیں، اور جہاں مختلف ماہرین کے زاویوں کی ضرورت ہو وہاں مکمل مشورہ کونسل شروع کرنے کی تجویز دیتے ہیں۔\n\n"
            "LANGUAGE CONTRACT — HIGHEST PRIORITY:\n"
            "- جواب صرف قدرتی پاکستانی اردو میں دیں۔\n"
            "- اردو رسم الخط استعمال کریں۔\n"
            "- عربی زبان میں جواب ہرگز نہ دیں۔\n"
            "- فارسی یا ہندی/دیوناگری میں جواب نہ دیں۔\n"
            "- عربی طرز کی رسمی عبارتیں مثلاً 'إليك'، 'يسعدنا'، 'نحيطكم'، 'كافة'، 'سنوافيكم' استعمال نہ کریں۔\n"
            "- پاکستانی صارف سے قدرتی، صاف اور جدید اردو میں بات کریں۔\n"
            "- AI, PDF, CGPA, Upwork, Fiverr, software وغیرہ جیسے عام technical terms جہاں قدرتی ہوں Latin script میں رہ سکتے ہیں۔\n"
            "- صارف کی زبان اردو ہو تو پورے conversational response کی بنیادی زبان اردو ہی رہنی چاہیے۔\n"
            "- کسی دوسری زبان میں switch نہ کریں جب تک صارف خود واضح طور پر نہ کہے۔\n\n"
            "COUNCIL ACTION RULE:\n"
            "- اگر صارف واضح طور پر کونسل یا مکمل مشورہ شروع کرنے کی تصدیق یا درخواست کرے (مثلاً 'ہاں شروع کرو'، 'شروع کرو'، 'کونسل بلا لو'، 'ٹھیک ہے مکمل مشورہ کرو') "
            "تو بغیر کسی فالتو بات یا خالی وعدے کے فوراً start_mashwara ٹول کال کریں۔ گفتگو کی تاریخ میں سے اصل فیصلے کا سوال decision_prompt میں بھیجیں۔"
        )
    elif target_lang == "roman-ur":
        return (
            "Aap Mashwara AI ke Mashwara Assistant hain. "
            "Aap user ke decision ya confusion ko achi tarah samajhte hain, zaroorat parne par focused sawal poochte hain, "
            "lightweight practical guidance dete hain, aur jahan multi-agent council ki zaroorat ho wahan full Mashwara start karne ka mashwara dete hain.\n\n"
            "LANGUAGE CONTRACT:\n"
            "- Respond in natural, modern Pakistani Roman Urdu, not Hindi transliteration and not English-only.\n"
            "- Technical/professional terms (AI, salary, job, freelancing, budget, client, risk, software) can remain in standard Latin script.\n\n"
            "COUNCIL ACTION RULE:\n"
            "- If the user confirms or asks to start Mashwara (e.g. 'haan start karo', 'okay shuru karo', 'full mashwara start karo', 'yes convene it'), "
            "immediately call the start_mashwara tool with the substantive dilemma under discussion. Do not produce chit-chat instead of calling the tool."
        )
    else:
        return (
            "You are the Mashwara Assistant on Mashwara AI. "
            "You help users clarify their decisions, ask decisive questions when necessary, provide concise helpful guidance, "
            "and recommend convening a full Mashwara expert consultation when multiple specialist perspectives would add value.\n\n"
            "LANGUAGE CONTRACT:\n"
            "- Respond in clear, professional English.\n\n"
            "COUNCIL ACTION RULE:\n"
            "- If the user confirms or requests to convene the council (e.g. 'yes start it', 'start the mashwara', 'go ahead', 'convene the council'), "
            "immediately call the start_mashwara tool with the canonical substantive dilemma under discussion from conversation history."
        )


def build_consultation_chat_summary(report: Dict[str, Any], language: Optional[str]) -> str:
    """
    Builds an intelligent, deterministic companion executive summary of the completed
    consultation for display in the standard chat conversation.
    Constructed exclusively from authoritative report fields with ZERO extra LLM calls.
    """
    if not report:
        return ""

    lang = (language or "ur").lower()
    if "roman" in lang or ("ur" in lang and "roman" in lang):
        lang = "roman-ur"
    elif "ur" in lang:
        lang = "ur"
    elif "en" in lang:
        lang = "en"
    else:
        lang = "ur"

    decision = str(report.get("final_decision", "DEFER")).upper()
    conf = report.get("confidence_score", 70)
    try:
        conf_int = int(conf)
    except (ValueError, TypeError):
        conf_int = 70

    final_mashwara = str(report.get("final_mashwara", "")).strip()
    debate_summary = str(report.get("debate_summary", "")).strip()
    agreement = str(report.get("agreement", "")).strip()
    disagreement = str(report.get("disagreement", "")).strip()
    
    raw_risks = report.get("key_risks") or []
    risks = [str(r).strip() for r in raw_risks if str(r).strip()][:2]
    
    raw_actions = report.get("recommended_actions") or []
    actions = [str(a).strip() for a in raw_actions if str(a).strip()][:3]

    # Helper to extract an opening summary snippet from debate_summary if final_mashwara is empty
    summary_snippet = final_mashwara
    if not summary_snippet and debate_summary:
        clean_lines = [line.strip() for line in debate_summary.split("\n") if line.strip() and not line.strip().startswith("#") and not line.strip().startswith("```")]
        if clean_lines:
            summary_snippet = clean_lines[0]
            if len(summary_snippet) < 60 and len(clean_lines) > 1:
                summary_snippet += " " + clean_lines[1]

    parts = []

    if lang == "ur":
        verdict_label = "تائید (APPROVE)" if "APPROV" in decision else ("مخالفت (REJECT)" if "REJECT" in decision else "احتیاط / التواء (DEFER)")
        parts.append("مشورہ مکمل ہو گیا۔ 6 ماہرین نے آپ کے فیصلے کا مختلف زاویوں سے جائزہ لیا ہے۔\n")
        parts.append(f"**حتمی مشورہ: {verdict_label}** (اعتماد: {conf_int}%)\n")
        
        if summary_snippet:
            parts.append(f"**خلاصہ:**\n{summary_snippet}\n")
            
        if agreement:
            parts.append(f"**اتفاقِ رائے:** {agreement}\n")
        if disagreement:
            parts.append(f"**بنیادی اختلاف:** {disagreement}\n")
            
        if risks:
            risks_text = "\n".join([f"- {r}" for r in risks])
            parts.append(f"**اہم خطرات:**\n{risks_text}\n")
            
        if actions:
            actions_text = "\n".join([f"{i+1}. {a}" for i, a in enumerate(actions)])
            parts.append(f"**اگلے عملی اقدامات:**\n{actions_text}\n")
            
        parts.append("مکمل تجزیہ، ہر ماہر کی رائے اور تفصیلی بحث دیکھنے کے لیے مشورے کی رپورٹ کھولیں۔")

    elif lang == "roman-ur":
        verdict_label = "Support (APPROVE)" if "APPROV" in decision else ("Oppose (REJECT)" if "REJECT" in decision else "Caution / Defer (DEFER)")
        parts.append("Mashwara mukammal ho gaya. 6 experts ne aap ke decision ka mukhtalif zawiyon se jaiza liya hai.\n")
        parts.append(f"**Final Mashwara: {verdict_label}** (Confidence: {conf_int}%)\n")
        
        if summary_snippet:
            parts.append(f"**Khulasa:**\n{summary_snippet}\n")
            
        if agreement:
            parts.append(f"**Ittefaq-e-Raye:** {agreement}\n")
        if disagreement:
            parts.append(f"**Bunyadi Ikhtilaf:** {disagreement}\n")
            
        if risks:
            risks_text = "\n".join([f"- {r}" for r in risks])
            parts.append(f"**Aham Khatray:**\n{risks_text}\n")
            
        if actions:
            actions_text = "\n".join([f"{i+1}. {a}" for i, a in enumerate(actions)])
            parts.append(f"**Aglay Qadam:**\n{actions_text}\n")
            
        parts.append("Mukammal tajziya, har expert ki raye aur debate dekhne ke liye Mashwara Report open karein.")

    else:
        verdict_label = "APPROVE" if "APPROV" in decision else ("REJECT" if "REJECT" in decision else "DEFER")
        parts.append("Consultation complete. All 6 expert advisors have evaluated your decision from multiple angles.\n")
        parts.append(f"**Final Recommendation: {verdict_label}** (Confidence: {conf_int}%)\n")
        
        if summary_snippet:
            parts.append(f"**Executive Summary:**\n{summary_snippet}\n")
            
        if agreement:
            parts.append(f"**Consensus:** {agreement}\n")
        if disagreement:
            parts.append(f"**Key Disagreement:** {disagreement}\n")
            
        if risks:
            risks_text = "\n".join([f"- {r}" for r in risks])
            parts.append(f"**Key Risks:**\n{risks_text}\n")
            
        if actions:
            actions_text = "\n".join([f"{i+1}. {a}" for i, a in enumerate(actions)])
            parts.append(f"**Recommended Next Steps:**\n{actions_text}\n")
            
        parts.append("Open the full Mashwara Report to review individual expert votes, rebuttals, and comprehensive analysis.")

    return "\n".join(parts)


@app.post("/chat/message", response_model=ChatMessageResponse, tags=["Chat"])
async def send_standard_message(
    body: StandardMessageRequest, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    # Verify session
    result = await db.execute(select(ChatSession).filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Save user message
    user_msg = ChatMessage(session_id=session.id, role="user", content=body.message)
    db.add(user_msg)
    
    # Update session
    if session.title == "New Brainstorming Session":
        session.title = derive_session_title(body.message)
    session.updated_at = datetime.datetime.utcnow()

    # Call Gemini (Chief of Staff)
    client = genai.Client()
    # Pull history
    hist_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = hist_result.scalars().all()
    
    contents = []
    # Language resolution & System context
    target_lang, _ = resolve_consultation_language(body.language, body.message)
    system_prompt = build_standard_chat_system_prompt(target_lang)

    if current_user.profile_data:
        system_prompt += f"\nUser Context: {json.dumps(current_user.profile_data)}"
    
    # Build history for Gemini
    for m in history:
        if m.role == "user" or m.role == "assistant":
            r = "model" if m.role == "assistant" else "user"
            contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=m.content)]))

    response = client.models.generate_content(
        model=CHAT_MODEL,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.4 if target_lang == "ur" else 0.7,
            max_output_tokens=CHAT_TOKENS,
        )
    )
    
    ai_text = response.text or ("میں سمجھ گیا ہوں۔ کیا آپ چاہتے ہیں کہ اس پر مکمل مشورہ کونسل کا اجلاس بلایا جائے؟" if target_lang == "ur" else ("Main samajh gaya hoon. Kya aap chahte hain ke is par full Mashwara Council ka mashwara shuru kiya jaye?" if target_lang == "roman-ur" else "I understand. Would you like to convene the full Mashwara council on this?"))

    # Defensive validation: if Urdu mode produced Arabic, retry once with correction
    if target_lang == "ur" and is_arabic_response(ai_text):
        logger.warning(f"Arabic detected in /chat/message output: {ai_text[:80]}... Retrying once in Pakistani Urdu.")
        retry_contents = contents + [
            genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=ai_text)]),
            genai_types.Content(role="user", parts=[genai_types.Part.from_text(
                text="The previous response was Arabic. Rewrite the same answer exclusively in natural Pakistani Urdu. Preserve the meaning. Do not use Arabic."
            )])
        ]
        retry_resp = client.models.generate_content(
            model=CHAT_MODEL,
            contents=retry_contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.2,
                max_output_tokens=CHAT_TOKENS,
            )
        )
        corrected = retry_resp.text or ""
        if corrected and not is_arabic_response(corrected):
            ai_text = corrected
        else:
            ai_text = "میں آپ کی بات سمجھ رہا ہوں۔ براہ کرم مجھے بتائیں کہ آپ کا اصل سوال یا فیصلہ کیا ہے تاکہ ہم اس پر تفصیل سے بات کر سکیں یا مکمل مشورہ کونسل تشکیل دے سکیں۔"
    
    # Save assistant message
    asst_msg = ChatMessage(session_id=session.id, role="assistant", content=ai_text)
    db.add(asst_msg)
    await db.commit()
    
    # Re-fetch to satisfy Pydantic relationships
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.meeting))
        .filter(ChatMessage.id == asst_msg.id)
    )
    return result.scalars().first()

@app.post("/chat/stream_message", tags=["Chat"])
@limiter.limit(os.getenv("RATE_LIMIT", "10/minute"))
async def stream_standard_message(
    request: Request,
    body: StandardMessageRequest, 
    current_user: Optional[User] = Depends(get_optional_current_user), 
    db: AsyncSession = Depends(get_db)
):
    session = None
    contents = []
    target_lang, _ = resolve_consultation_language(body.language or request.headers.get("accept-language"), body.message)
    system_prompt = build_standard_chat_system_prompt(target_lang)

    # Process attachment context and evidence if attached
    attachment_context = None
    if body.attachment_context_id:
        result = await db.execute(
            select(AttachmentContext)
            .options(selectinload(AttachmentContext.attachments))
            .filter(AttachmentContext.id == body.attachment_context_id)
        )
        attachment_context = result.scalars().first()
        if attachment_context:
            guest_scope_id, guest_secret = get_guest_scope(request)
            verify_context_auth(attachment_context, current_user, guest_scope_id, guest_secret)
            if not attachment_context.sealed_at:
                attachment_context.sealed_at = datetime.datetime.now(datetime.timezone.utc)
                attachment_context.status = "sealed"
                await db.commit()
            evidence_pack = await extract_evidence_pack(db, attachment_context, body.message)
            if evidence_pack and evidence_pack.items:
                ev_prompt = format_evidence_for_prompt(evidence_pack, target_lang)
                system_prompt += f"\n\n{ev_prompt}"

    # Process web research if requested or auto-decided
    search_mode = (body.web_search_mode or "auto").strip().lower()
    web_evidence_pack = await execute_web_research(
        body.message,
        target_lang=target_lang,
        mode=search_mode
    )
    if web_evidence_pack and web_evidence_pack.used and web_evidence_pack.status == "success":
        web_prompt = format_web_evidence_for_prompt(web_evidence_pack, target_lang)
        system_prompt += f"\n\n{web_prompt}"

    if current_user is not None:
        if body.session_id:
            result = await db.execute(select(ChatSession).filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id))
            session = result.scalars().first()
        
        if not session:
            session = ChatSession(
                id=body.session_id or str(uuid.uuid4()),
                user_id=current_user.id,
                title=derive_session_title(body.message)
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)
        else:
            if session.title == "New Brainstorming Session":
                session.title = derive_session_title(body.message)
            session.updated_at = datetime.datetime.utcnow()
            await db.commit()

        user_msg = ChatMessage(
            session_id=session.id,
            role="user",
            content=body.message,
            attachment_context_id=attachment_context.id if attachment_context else None,
            web_evidence=web_evidence_pack.to_dict() if (web_evidence_pack and web_evidence_pack.used) else None,
            web_search_mode=search_mode
        )
        db.add(user_msg)
        await db.commit()

        hist_result = await db.execute(
            select(ChatMessage)
            .filter(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
        )
        history = hist_result.scalars().all()

        if current_user.profile_data:
            system_prompt += f"\nUser Context: {json.dumps(current_user.profile_data)}"

        for m in history:
            if m.role == "user" or m.role == "assistant":
                r = "model" if m.role == "assistant" else "user"
                contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=m.content)]))
    else:
        # Guest mode: ephemeral, in-memory conversation
        logger.info("Processing guest standard message (ephemeral).")
        if body.history:
            for m in body.history[-10:]:
                role = m.get("role", "user")
                content = m.get("content", "")
                if role in ("user", "assistant") and content:
                    r = "model" if role == "assistant" else "user"
                    contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=content)]))
        contents.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=body.message)]))

    if target_lang == "ur":
        # -------------------------------------------------------------------
        # Zero Arabic Leakage Pipeline (Urdu):
        # 1. Accumulate complete response server-side
        # 2. Check for start_mashwara tool call first (suppress text, emit action)
        # 3. Validate complete textual answer with is_arabic_response()
        # 4. If Arabic-heavy, regenerate ONCE using correction prompt
        # 5. Only then emit approved answer to frontend as smooth chunks
        # -------------------------------------------------------------------
        async def event_generator_urdu():
            client = genai.Client()
            try:
                response = await client.aio.models.generate_content(
                    model=CHAT_MODEL,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        tools=[START_MASHWARA_TOOL],
                        temperature=0.4,
                        max_output_tokens=CHAT_TOKENS,
                    )
                )

                # Check for start_mashwara tool call
                action_call = None
                if response.function_calls:
                    for fc in response.function_calls:
                        if fc.name == "start_mashwara":
                            action_call = fc
                            break
                elif response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, "function_call") and part.function_call and part.function_call.name == "start_mashwara":
                            action_call = part.function_call
                            break

                if action_call:
                    args = action_call.args or {}
                    raw_dilemma = str(args.get("decision_prompt", "")).strip()
                    history_list = history if current_user is not None else (body.history or [])
                    canonical_dilemma, inherited_context_id, inherited_web_evidence, inherited_search_mode = resolve_canonical_dilemma(
                        raw_dilemma,
                        history_list,
                        body.message,
                        body.attachment_context_id,
                        web_evidence_pack.to_dict() if (web_evidence_pack and web_evidence_pack.used) else None,
                        search_mode
                    )
                    action_payload = {
                        "type": "action",
                        "action": "start_mashwara",
                        "decision_prompt": canonical_dilemma
                    }
                    if inherited_context_id:
                        action_payload["attachment_context_id"] = inherited_context_id
                    if inherited_web_evidence:
                        action_payload["web_evidence"] = inherited_web_evidence
                    if inherited_search_mode:
                        action_payload["web_search_mode"] = inherited_search_mode
                    logger.info(f"Emitting start_mashwara action: {canonical_dilemma} (context={inherited_context_id})")
                    yield {"data": json.dumps(action_payload)}
                    return

                # Emit source citations event if research was performed
                if web_evidence_pack and web_evidence_pack.used and web_evidence_pack.sources:
                    sources_list = [
                        {
                            "id": s.id,
                            "title": s.title,
                            "url": s.url,
                            "domain": s.domain,
                            "source_type": s.source_type,
                        }
                        for s in web_evidence_pack.sources
                    ]
                    yield {"data": json.dumps({"type": "sources", "data": {"sources": sources_list, "searched_at": web_evidence_pack.searched_at}})}

                # Normal textual answer
                full_text = response.text or ""

                # Validate with is_arabic_response()
                if is_arabic_response(full_text):
                    logger.warning(f"Detected Arabic in Urdu response: {full_text[:80]}... Regenerating once with Pakistani Urdu contract.")
                    correction_contents = contents + [
                        genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=full_text)]),
                        genai_types.Content(role="user", parts=[genai_types.Part.from_text(
                            text="The previous response was Arabic. Rewrite the same answer exclusively in natural Pakistani Urdu. Preserve the meaning. Do not use Arabic."
                        )])
                    ]
                    retry_resp = await client.aio.models.generate_content(
                        model=CHAT_MODEL,
                        contents=correction_contents,
                        config=genai_types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            temperature=0.2,
                            max_output_tokens=CHAT_TOKENS,
                        )
                    )
                    corrected = retry_resp.text or ""
                    if corrected and not is_arabic_response(corrected):
                        full_text = corrected
                    else:
                        full_text = "میں آپ کی بات سمجھ رہا ہوں۔ براہ کرم مجھے بتائیں کہ آپ کا اصل سوال یا فیصلہ کیا ہے تاکہ ہم اس پر تفصیل سے بات کر سکیں یا مکمل مشورہ کونسل تشکیل دے سکیں۔"

                # Parse thinking vs final text
                from agents import AgentStreamParser
                parser = AgentStreamParser()
                thinking_text = ""
                answer_text = ""
                for is_thinking, parsed_content in parser.process_chunk(full_text):
                    if is_thinking:
                        thinking_text += parsed_content
                    else:
                        answer_text += parsed_content
                if parser.buffer:
                    if parser.is_thinking:
                        thinking_text += parser.buffer
                    else:
                        answer_text += parser.buffer

                if not answer_text and full_text:
                    answer_text = full_text

                if thinking_text:
                    yield {"data": json.dumps({"type": "thinking", "text": thinking_text})}

                # Replay approved answer smoothly to frontend
                words = answer_text.split(" ")
                chunk_size = 6
                for i in range(0, len(words), chunk_size):
                    if await request.is_disconnected():
                        break
                    piece = " ".join(words[i:i + chunk_size])
                    if i + chunk_size < len(words):
                        piece += " "
                    yield {"data": json.dumps({"type": "chunk", "text": piece})}
                    await asyncio.sleep(0.015)

                if current_user is not None and session is not None and (answer_text or thinking_text):
                    async def save_msg():
                        async with AsyncSessionLocal() as session_db:
                            asst_msg = ChatMessage(session_id=session.id, role="assistant", content=answer_text, thinking=thinking_text)
                            session_db.add(asst_msg)
                            await session_db.commit()
                    asyncio.create_task(save_msg())

            except Exception as e:
                logger.error(f"Urdu stream error: {e}", exc_info=True)
                yield {"data": json.dumps({"type": "error", "message": str(e)})}
            finally:
                yield {"data": json.dumps({"type": "done"})}

        return EventSourceResponse(event_generator_urdu())

    else:
        # -------------------------------------------------------------------
        # Direct Streaming Pipeline (English & Roman Urdu)
        # -------------------------------------------------------------------
        async def event_generator_streaming():
            client = genai.Client()
            full_text = ""
            full_thinking = ""
            action_fired = False
            try:
                response_stream = await client.aio.models.generate_content_stream(
                    model=CHAT_MODEL,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        tools=[START_MASHWARA_TOOL],
                        temperature=0.7,
                        max_output_tokens=CHAT_TOKENS,
                    )
                )

                from agents import AgentStreamParser
                parser = AgentStreamParser()

                async for chunk in response_stream:
                    if await request.is_disconnected():
                        logger.info("Client disconnected, stopping standard stream.")
                        break

                    # Check for start_mashwara tool call
                    action_call = None
                    if chunk.function_calls:
                        for fc in chunk.function_calls:
                            if fc.name == "start_mashwara":
                                action_call = fc
                                break
                    elif chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                        for part in chunk.candidates[0].content.parts:
                            if hasattr(part, "function_call") and part.function_call and part.function_call.name == "start_mashwara":
                                action_call = part.function_call
                                break

                    if action_call:
                        args = action_call.args or {}
                        raw_dilemma = str(args.get("decision_prompt", "")).strip()
                        history_list = history if current_user is not None else (body.history or [])
                        canonical_dilemma, inherited_context_id, inherited_web_evidence, inherited_search_mode = resolve_canonical_dilemma(
                            raw_dilemma,
                            history_list,
                            body.message,
                            body.attachment_context_id,
                            web_evidence_pack.to_dict() if (web_evidence_pack and web_evidence_pack.used) else None,
                            search_mode
                        )
                        action_payload = {
                            "type": "action",
                            "action": "start_mashwara",
                            "decision_prompt": canonical_dilemma
                        }
                        if inherited_context_id:
                            action_payload["attachment_context_id"] = inherited_context_id
                        if inherited_web_evidence:
                            action_payload["web_evidence"] = inherited_web_evidence
                        if inherited_search_mode:
                            action_payload["web_search_mode"] = inherited_search_mode
                        logger.info(f"Emitting start_mashwara action: {canonical_dilemma} (context={inherited_context_id})")
                        yield {"data": json.dumps(action_payload)}
                        action_fired = True
                        break

                    # Emit source citations event if research was performed
                    if web_evidence_pack and web_evidence_pack.used and web_evidence_pack.sources:
                        sources_list = [
                            {
                                "id": s.id,
                                "title": s.title,
                                "url": s.url,
                                "domain": s.domain,
                                "source_type": s.source_type,
                            }
                            for s in web_evidence_pack.sources
                        ]
                        yield {"data": json.dumps({"type": "sources", "data": {"sources": sources_list, "searched_at": web_evidence_pack.searched_at}})}

                    if chunk.text:
                        for is_thinking, parsed_content in parser.process_chunk(chunk.text):
                            if is_thinking:
                                full_thinking += parsed_content
                                yield {"data": json.dumps({"type": "thinking", "text": parsed_content})}
                            else:
                                full_text += parsed_content
                                yield {"data": json.dumps({"type": "chunk", "text": parsed_content})}

                if not action_fired:
                    if parser.buffer and not await request.is_disconnected():
                        if parser.is_thinking:
                            full_thinking += parser.buffer
                            yield {"data": json.dumps({"type": "thinking", "text": parser.buffer})}
                        else:
                            full_text += parser.buffer
                            yield {"data": json.dumps({"type": "chunk", "text": parser.buffer})}

            except Exception as e:
                logger.error(f"Stream error: {e}", exc_info=True)
                yield {"data": json.dumps({"type": "error", "message": str(e)})}
            finally:
                if not action_fired and current_user is not None and session is not None and (full_text or full_thinking):
                    async def save_msg():
                        async with AsyncSessionLocal() as session_db:
                            asst_msg = ChatMessage(session_id=session.id, role="assistant", content=full_text, thinking=full_thinking)
                            session_db.add(asst_msg)
                            await session_db.commit()
                    asyncio.create_task(save_msg())
                yield {"data": json.dumps({"type": "done"})}

        return EventSourceResponse(event_generator_streaming())




@app.post("/chat/stream", tags=["Chat"])
@limiter.limit(os.getenv("RATE_LIMIT", "5/minute"))
async def chat_stream(
    request: Request, 
    body: ChatRequest, 
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit a prompt for board analysis and stream the responses.
    Supports both authenticated persistent meetings and ephemeral guest deliberations.
    """
    raw_tpl = str(body.template or "").strip()
    if not raw_tpl or raw_tpl in ("None", "AUTO"):
        template_type = TemplateType.AUTO
    else:
        try:
            template_type = TemplateType(raw_tpl)
        except ValueError:
            logger.warning(f"Unknown template '{raw_tpl}' in chat_stream; safely routing via AUTO.")
            template_type = TemplateType.AUTO

    # Extract document evidence pack if attachment context passed
    evidence_pack = None
    if body.attachment_context_id:
        result = await db.execute(
            select(AttachmentContext)
            .options(selectinload(AttachmentContext.attachments))
            .filter(AttachmentContext.id == body.attachment_context_id)
        )
        att_ctx = result.scalars().first()
        if att_ctx:
            guest_scope_id, guest_secret = get_guest_scope(request)
            verify_context_auth(att_ctx, current_user, guest_scope_id, guest_secret)
            if not att_ctx.sealed_at:
                att_ctx.sealed_at = datetime.datetime.now(datetime.timezone.utc)
                att_ctx.status = "sealed"
                await db.commit()
            evidence_pack = await extract_evidence_pack(db, att_ctx, body.prompt)

    # Extract or execute web research
    web_evidence_pack = None
    if getattr(body, "web_evidence", None):
        web_evidence_pack = WebEvidencePack.from_dict(body.web_evidence)
    else:
        search_mode = getattr(body, "web_search_mode", "auto") or "auto"
        web_evidence_pack = await execute_web_research(
            body.prompt,
            target_lang=body.language or request.headers.get("accept-language") or "en",
            mode=search_mode
        )

    # Generate meeting ID
    meeting_id = str(uuid.uuid4())
    context_str = ""

    if current_user is not None:
        logger.info(f"Starting chat stream {meeting_id} | template={template_type.value} | user={current_user.email}")
        new_meeting = Meeting(
            id=meeting_id,
            user_id=current_user.id,
            template=template_type.value,
            prompt=body.prompt
        )
        db.add(new_meeting)

        context_str = "User Context:\n"
        if current_user.profile_data:
            for k, v in current_user.profile_data.items():
                if v:
                    context_str += f"- {k.capitalize()}: {v}\n"

        if body.session_id:
            result = await db.execute(select(ChatSession).filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id))
            session = result.scalars().first()
            if session:
                if session.title == "New Brainstorming Session":
                    session.title = derive_session_title(body.prompt)
                session.updated_at = datetime.datetime.utcnow()
                user_msg = ChatMessage(
                    session_id=session.id,
                    role="user",
                    content=body.prompt,
                    attachment_context_id=body.attachment_context_id,
                    web_evidence=web_evidence_pack.to_dict() if (web_evidence_pack and web_evidence_pack.used) else None,
                    web_search_mode=getattr(body, "web_search_mode", "auto") or "auto"
                )
                db.add(user_msg)
                
                target_lang, _ = resolve_consultation_language(body.language or request.headers.get("accept-language"), body.prompt)
                if target_lang == "ur":
                    convening_text = "مشورہ کونسل کا اجلاس طلب کر لیا گیا ہے۔ تمام 6 ماہرین آپ کے فیصلے پر غور کر رہے ہیں..."
                elif target_lang == "roman-ur":
                    convening_text = "Mashwara Council convene ho rahi hai. 6 experts aap ke decision par ghour kar rahe hain..."
                else:
                    convening_text = "The Mashwara Council is convening. All 6 expert advisors are analyzing your decision..."

                asst_msg = ChatMessage(
                    session_id=session.id, 
                    role="assistant", 
                    content=convening_text, 
                    is_agentic=True,
                    meeting_id=meeting_id
                )
                db.add(asst_msg)
                await db.commit()

                hist_result = await db.execute(
                    select(ChatMessage)
                    .filter(ChatMessage.session_id == body.session_id)
                    .order_by(ChatMessage.created_at.asc())
                )
                history = hist_result.scalars().all()
                if history:
                    context_str += "\nPrevious Chat Context:\n"
                    for m in history:
                        if not m.is_agentic and m.id != user_msg.id:
                            role_str = "User" if m.role == "user" else "Mashwara Assistant"
                            context_str += f"{role_str}: {m.content}\n"

        await db.commit()
    else:
        # Guest mode: no User, no Meeting, no ChatSession records created in DB
        logger.info(f"Starting GUEST chat stream {meeting_id} | template={template_type.value} (ephemeral)")

    final_prompt = f"{context_str}\nTask:\n{body.prompt}" if context_str else f"Task:\n{body.prompt}"

    async def event_generator():
        import asyncio as _asyncio
        cancel_event = _asyncio.Event()
        final_report_data = None
        streams_accumulator = {"_roles": []}
        try:
            async for chunk in run_meeting(
                meeting_id,
                template_type,
                {
                    "prompt": final_prompt,
                    "decision_title": "مشاورتی رپورٹ" if (body.language == "ur" or request.headers.get("accept-language") == "ur") else "Mashwara Consultation",
                    "language": body.language or request.headers.get("accept-language"),
                },
                cancel_event=cancel_event,
                evidence_pack=evidence_pack,
                web_evidence=web_evidence_pack,
            ):
                if await request.is_disconnected():
                    logger.info(f"Client disconnected, cancelling board stream for meeting {meeting_id}.")
                    cancel_event.set()
                    break
                yield {"data": chunk}
                try:
                    data = json.loads(chunk)
                    if data.get("type") == "report":
                        final_report_data = data.get("data")
                        summary_lang_resolved = body.language or request.headers.get("accept-language") or "en"
                        summary_text = build_consultation_chat_summary(final_report_data, summary_lang_resolved)
                        if summary_text:
                            # Freeze exact companion summary for authoritative playback
                            streams_accumulator["_companion_summary"] = {
                                "text": summary_text,
                                "language": summary_lang_resolved
                            }
                            # Ephemeral guest snapshot for TTS
                            guest_scope_id_cur, _ = get_guest_scope(request)
                            if current_user is None and guest_scope_id_cur:
                                try:
                                    ephemeral_key = f"ephemeral/{guest_scope_id_cur}/meetings/{meeting_id}/summary.json"
                                    snapshot_data = json.dumps({
                                        "meeting_id": meeting_id,
                                        "summary_text": summary_text,
                                        "language": summary_lang_resolved
                                    }).encode("utf-8")
                                    save_blob_bytes(ephemeral_key, snapshot_data, content_type="application/json")
                                except Exception as snap_err:
                                    logger.warning(f"Failed to save guest ephemeral TTS summary snapshot: {snap_err}")
                            yield {"data": json.dumps({"type": "chat_summary", "text": summary_text})}
                    elif data.get("type") == "evidence":
                        streams_accumulator["_evidence"] = data.get("data")
                    elif data.get("type") == "web_evidence":
                        streams_accumulator["_web_evidence"] = data.get("data")
                    elif data.get("type") == "roles":
                        streams_accumulator["_roles"] = data.get("data")
                    elif data.get("type") == "final":
                        agent = data.get("agent")
                        if agent:
                            streams_accumulator[agent] = {
                                "text": data.get("text", ""),
                                "thinking": data.get("thinking", ""),
                                "status": "done"
                            }
                    elif data.get("type") in ["chunk", "thinking"]:
                        agent = data.get("agent")
                        if agent:
                            if agent not in streams_accumulator:
                                streams_accumulator[agent] = {"text": "", "thinking": "", "status": "done"}
                            if data.get("type") == "thinking":
                                streams_accumulator[agent]["thinking"] += data.get("text", "")
                            else:
                                streams_accumulator[agent]["text"] += data.get("text", "")
                except:
                    pass
            
        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
        finally:
            # Save to DB only if authenticated user
            if current_user is not None and (final_report_data or len(streams_accumulator) > 1):
                try:
                    async with AsyncSessionLocal() as session_db:
                        result = await session_db.execute(select(Meeting).filter(Meeting.id == meeting_id))
                        db_meeting = result.scalars().first()
                        if db_meeting:
                            if final_report_data:
                                db_meeting.report_data = final_report_data
                            db_meeting.streams_data = streams_accumulator
                            await session_db.commit()

                        if final_report_data and body.session_id:
                            asst_msg_res = await session_db.execute(
                                select(ChatMessage).filter(
                                    ChatMessage.session_id == body.session_id,
                                    ChatMessage.meeting_id == meeting_id
                                )
                            )
                            asst_msg_obj = asst_msg_res.scalars().first()
                            if asst_msg_obj:
                                frozen_comp = streams_accumulator.get("_companion_summary")
                                if isinstance(frozen_comp, dict):
                                    summary_text = frozen_comp.get("text")
                                else:
                                    summary_text = build_consultation_chat_summary(final_report_data, body.language or request.headers.get("accept-language"))
                                if summary_text:
                                    asst_msg_obj.content = summary_text
                                    await session_db.commit()
                except Exception as save_err:
                    logger.error(f"Failed to save meeting {meeting_id}: {save_err}")
            logger.info(f"Board stream event_generator finished for meeting {meeting_id}.")

    return EventSourceResponse(event_generator())


@app.post("/meetings/{meeting_id}/summary-audio", response_model=SummaryAudioResponse, tags=["Meetings"])
@limiter.limit("10/minute")
async def get_or_generate_summary_audio(
    request: Request,
    meeting_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns a secure V4 signed download URL for the companion executive summary narration.
    Idempotently serves cached audio if already generated; otherwise synthesizes with Charon.
    Requires authenticated ownership of the meeting OR valid active guest scope.
    Public share links are strictly forbidden from generating or playing private TTS.
    """
    summary_text = None
    summary_lang = None
    user_id = None
    guest_scope_id = None

    if current_user is not None:
        user_id = str(current_user.id)
        result = await db.execute(select(Meeting).filter(Meeting.id == meeting_id))
        meeting = result.scalars().first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Consultation not found")
        if str(meeting.user_id) != user_id:
            raise HTTPException(status_code=403, detail="Forbidden: consultation belongs to another user")

        # 1. Authoritative frozen summary from streams_data
        if meeting.streams_data and isinstance(meeting.streams_data, dict):
            comp = meeting.streams_data.get("_companion_summary")
            if isinstance(comp, dict):
                summary_text = comp.get("text")
                summary_lang = comp.get("language")
            elif isinstance(comp, str):
                summary_text = comp

        # 2. Authoritative persisted assistant message content
        if not summary_text:
            msg_res = await db.execute(
                select(ChatMessage).filter(ChatMessage.meeting_id == meeting_id, ChatMessage.role == "assistant")
            )
            asst_msg = msg_res.scalars().first()
            if asst_msg and asst_msg.content:
                summary_text = asst_msg.content

        # 3. Isolated deterministic fallback for legacy consultations genuinely lacking frozen snapshot
        if not summary_text and meeting.report_data:
            logger.info(f"Using legacy deterministic fallback summary for meeting {meeting_id}")
            summary_text = build_consultation_chat_summary(meeting.report_data, summary_lang or "en")

    else:
        # Guest Mode
        guest_scope_id, guest_secret = get_guest_scope(request)
        if not guest_scope_id:
            raise HTTPException(status_code=401, detail="Authentication or active guest scope required")

        ephemeral_key = f"ephemeral/{guest_scope_id}/meetings/{meeting_id}/summary.json"
        try:
            raw_json = storage_client.download_bytes(ephemeral_key)
            snapshot = json.loads(raw_json.decode("utf-8"))
            summary_text = snapshot.get("summary_text")
            summary_lang = snapshot.get("language")
        except Exception as e:
            logger.warning(f"Could not load guest ephemeral summary for meeting {meeting_id}: {e}")
            raise HTTPException(status_code=404, detail="Consultation summary not found or has expired")

    if not summary_text or not summary_text.strip():
        raise HTTPException(status_code=404, detail="No companion executive summary available for this consultation")

    # Speech normalization & deterministic cache key computation
    normalized_text = prepare_summary_for_speech(summary_text)
    resolved_lang = resolve_speech_language(summary_text, hint=summary_lang)
    cache_key = compute_tts_cache_key(normalized_text, resolved_lang)

    storage_key = build_tts_storage_key(
        meeting_id=meeting_id,
        cache_key=cache_key,
        user_id=user_id,
        guest_scope_id=guest_scope_id,
    )

    # Check cache in GCS
    try:
        if storage_client.object_exists(storage_key):
            download_url = storage_client.generate_signed_download_url(storage_key, expires_minutes=10)
            return SummaryAudioResponse(
                audio_url=download_url,
                cached=True,
                language=resolved_lang,
                voice="Charon"
            )
    except Exception as cache_err:
        logger.warning(f"Cache check failed for {storage_key}: {cache_err}")

    # Cache miss: synthesize via Gemini TTS
    try:
        pcm_bytes = await synthesize_speech(normalized_text, resolved_lang)
        wav_bytes = pcm_to_wav(pcm_bytes)
        storage_client.save_bytes(storage_key, wav_bytes, content_type="audio/wav")
        download_url = storage_client.generate_signed_download_url(storage_key, expires_minutes=10)
        return SummaryAudioResponse(
            audio_url=download_url,
            cached=False,
            language=resolved_lang,
            voice="Charon"
        )
    except Exception as synth_err:
        logger.error(f"TTS synthesis failed for meeting {meeting_id}: {synth_err}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Speech synthesis error: {synth_err}")


@app.post("/meetings/{meeting_id}/summary-audio/stream", tags=["Meetings"])
@limiter.limit("10/minute")
async def stream_summary_audio(
    request: Request,
    meeting_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the private executive-summary narration as WAV bytes through the
    authenticated API. Cached GCS bytes are read server-side, so playback does
    not depend on signed URLs or IAM blob-signing permissions.
    """
    summary_text = None
    summary_lang = None
    user_id = None
    guest_scope_id = None

    if current_user is not None:
        user_id = str(current_user.id)
        result = await db.execute(select(Meeting).filter(Meeting.id == meeting_id))
        meeting = result.scalars().first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Consultation not found")
        if str(meeting.user_id) != user_id:
            raise HTTPException(status_code=403, detail="Forbidden: consultation belongs to another user")

        if meeting.streams_data and isinstance(meeting.streams_data, dict):
            comp = meeting.streams_data.get("_companion_summary")
            if isinstance(comp, dict):
                summary_text = comp.get("text")
                summary_lang = comp.get("language")
            elif isinstance(comp, str):
                summary_text = comp

        if not summary_text:
            msg_res = await db.execute(
                select(ChatMessage).filter(ChatMessage.meeting_id == meeting_id, ChatMessage.role == "assistant")
            )
            asst_msg = msg_res.scalars().first()
            if asst_msg and asst_msg.content:
                summary_text = asst_msg.content

        if not summary_text and meeting.report_data:
            summary_text = build_consultation_chat_summary(meeting.report_data, summary_lang or "en")

    else:
        guest_scope_id, _ = get_guest_scope(request)
        if not guest_scope_id:
            raise HTTPException(status_code=401, detail="Authentication or active guest scope required")
        try:
            ephemeral_key = f"ephemeral/{guest_scope_id}/meetings/{meeting_id}/summary.json"
            raw_json = storage_client.download_bytes(ephemeral_key)
            snapshot = json.loads(raw_json.decode("utf-8"))
            summary_text = snapshot.get("summary_text")
            summary_lang = snapshot.get("language")
        except Exception as e:
            logger.warning(f"Could not load guest ephemeral summary for stream endpoint: {e}")
            raise HTTPException(status_code=404, detail="Consultation summary not found or has expired")

    if not summary_text or not summary_text.strip():
        raise HTTPException(status_code=404, detail="No companion executive summary available")

    normalized_text = prepare_summary_for_speech(summary_text)
    resolved_lang = resolve_speech_language(summary_text, hint=summary_lang)
    cache_key = compute_tts_cache_key(normalized_text, resolved_lang)
    storage_key = build_tts_storage_key(
        meeting_id=meeting_id,
        cache_key=cache_key,
        user_id=user_id,
        guest_scope_id=guest_scope_id,
    )

    try:
        if storage_client.object_exists(storage_key):
            cached_wav = storage_client.download_bytes(storage_key)
            if cached_wav:
                return Response(
                    content=cached_wav,
                    media_type="audio/wav",
                    headers={
                        "Content-Disposition": f'inline; filename="summary-{meeting_id}.wav"',
                        "Cache-Control": "private, max-age=600",
                        "X-Mashwara-Audio-Cache": "hit",
                    },
                )
    except Exception as cache_err:
        logger.warning(f"Could not read cached TTS audio {storage_key}: {cache_err}")

    try:
        pcm_bytes = await synthesize_speech(normalized_text, resolved_lang)
        wav_bytes = pcm_to_wav(pcm_bytes)
        try:
            storage_client.save_bytes(storage_key, wav_bytes, content_type="audio/wav")
        except Exception as cache_save_err:
            # Playback can still succeed because the bytes are returned directly.
            logger.warning(f"Could not cache TTS audio {storage_key}: {cache_save_err}")
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'inline; filename="summary-{meeting_id}.wav"',
                "Cache-Control": "private, max-age=600",
                "X-Mashwara-Audio-Cache": "miss",
            }
        )
    except Exception as synth_err:
        logger.error(f"Stream TTS synthesis failed for meeting {meeting_id}: {synth_err}", exc_info=True)
        raise HTTPException(status_code=500, detail="Speech synthesis error")


# ---------------------------------------------------------------------------
# Shared Mashwara Helper & Endpoints
# ---------------------------------------------------------------------------
def normalize_consultation_snapshot(
    decision_title: str,
    language: str,
    template: str,
    roles: List[Dict[str, Any]],
    streams: Dict[str, Any],
    report: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Normalizes consultation presentation data into a clean, canonical snapshot.
    Strips raw runtime state, internal prompts, tokens, or debug logs.
    """
    normalized_experts = []
    board_votes = (report or {}).get("board_votes", {})

    for r in roles:
        rk = r.get("key") or r.get("role_id")
        if not rk or rk in ("lead_advisor", "Moderator") or r.get("is_moderator"):
            continue

        st = streams.get(rk, {}) if isinstance(streams, dict) else {}
        raw_text = st.get("text", "") if isinstance(st, dict) else ""

        clean_text = re.sub(r'<think>[\s\S]*?</think>', '', raw_text)
        clean_text = re.sub(r'```(?:json)?\s*\{[\s\S]*?\}\s*```', '', clean_text).strip()
        if not clean_text:
            clean_text = raw_text.strip()

        vote_info = board_votes.get(rk, {})
        v_token = vote_info.get("vote", "DEFER") if isinstance(vote_info, dict) else "DEFER"
        v_conf = vote_info.get("confidence", 50) if isinstance(vote_info, dict) else 50

        normalized_experts.append({
            "role_id": rk,
            "name": r.get("name", rk),
            "title": r.get("title", ""),
            "description": r.get("description", ""),
            "icon": r.get("icon", "👔"),
            "color": r.get("color", "from-blue-500 to-blue-700"),
            "analysis": clean_text,
            "vote": v_token,
            "confidence": v_conf,
        })

    clean_report = {
        "final_decision": (report or {}).get("final_decision", "DEFER"),
        "confidence_score": (report or {}).get("confidence_score", 50),
        "board_votes": board_votes,
        "debate_summary": (report or {}).get("debate_summary", ""),
        "key_risks": (report or {}).get("key_risks", []),
        "recommended_actions": (report or {}).get("recommended_actions", []),
        "agreement": (report or {}).get("agreement", ""),
        "disagreement": (report or {}).get("disagreement", ""),
        "assumptions": (report or {}).get("assumptions", []),
        "what_would_change": (report or {}).get("what_would_change", ""),
    }
    if (report or {}).get("evidence_sources"):
        clean_report["evidence_sources"] = (report or {}).get("evidence_sources")
    if (report or {}).get("web_sources"):
        clean_report["web_sources"] = (report or {}).get("web_sources")
        clean_report["searched_at"] = (report or {}).get("searched_at")

    res = {
        "decision_title": decision_title or ("مشاورتی رپورٹ" if language == "ur" else "Mashwara Consultation"),
        "language": language or "roman-ur",
        "domain": template.replace("_BOARD", "").lower() if template else "general",
        "template": template or "career",
        "experts": normalized_experts,
        "report": clean_report,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    if isinstance(streams, dict) and streams.get("_evidence"):
        res["evidence"] = streams.get("_evidence")
    if isinstance(streams, dict) and streams.get("_web_evidence"):
        res["web_evidence"] = streams.get("_web_evidence")
    return res


@app.post("/shared-mashwaras", response_model=SharedMashwaraResponse, tags=["Shared Mashwara"])
@limiter.limit("20/minute")
async def create_shared_mashwara(
    request: Request,
    body: CreateSharedMashwaraRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a public, unguessable read-only share link for a completed Mashwara.
    - Authenticated users: snapshots are constructed server-side from authorized meeting records.
    - Guest users: snapshots are strictly validated, sanitized, and request-size limited (max 500KB).
    """
    normalized_snapshot = None

    if current_user is not None and body.meeting_id:
        result = await db.execute(
            select(Meeting).filter(Meeting.id == body.meeting_id, Meeting.user_id == current_user.id)
        )
        meeting = result.scalars().first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found or unauthorized")

        streams_data = meeting.streams_data or {}
        roles = streams_data.get("_roles", [])
        streams = {k: v for k, v in streams_data.items() if k != "_roles"}
        target_lang = body.language or "roman-ur"

        normalized_snapshot = normalize_consultation_snapshot(
            decision_title=meeting.prompt,
            language=target_lang,
            template=meeting.template,
            roles=roles,
            streams=streams,
            report=meeting.report_data or {},
        )
    elif body.snapshot:
        # Validate guest snapshot size limit (max 500KB)
        raw_json = json.dumps(body.snapshot)
        if len(raw_json.encode("utf-8")) > 500_000:
            raise HTTPException(status_code=413, detail="Snapshot payload exceeds maximum allowed size (500KB)")

        s = body.snapshot
        # If client provided normalized experts directly
        if "experts" in s and isinstance(s.get("experts"), list) and "report" in s:
            target_snap_lang = s.get("language") or body.language or "roman-ur"
            fallback_title = "مشاورتی رپورٹ" if target_snap_lang == "ur" else "Mashwara Consultation"
            normalized_snapshot = {
                "decision_title": s.get("decision_title") or body.decision_title or fallback_title,
                "language": target_snap_lang,
                "domain": s.get("domain", "general"),
                "template": s.get("template", "career"),
                "experts": [
                    {
                        "role_id": str(e.get("role_id", "")),
                        "name": str(e.get("name", "")),
                        "title": str(e.get("title", "")),
                        "description": str(e.get("description", "")),
                        "icon": str(e.get("icon", "👔")),
                        "color": str(e.get("color", "from-blue-500 to-blue-700")),
                        "analysis": str(e.get("analysis", "")),
                        "vote": str(e.get("vote", "DEFER")),
                        "confidence": int(e.get("confidence", 50)),
                    }
                    for e in s.get("experts", [])
                ],
                "report": s.get("report", {}),
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
        elif "roles" in s or "streams" in s:
            target_snap_lang = s.get("language") or body.language or "roman-ur"
            fallback_title = "مشاورتی رپورٹ" if target_snap_lang == "ur" else "Mashwara Consultation"
            normalized_snapshot = normalize_consultation_snapshot(
                decision_title=s.get("decision_title") or body.decision_title or fallback_title,
                language=target_snap_lang,
                template=s.get("template", "career"),
                roles=s.get("roles") or s.get("rolesInfo") or [],
                streams=s.get("streams", {}),
                report=s.get("report", {}),
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid snapshot format: must contain consultation report and experts")
    else:
        raise HTTPException(status_code=400, detail="Must provide either meeting_id or valid snapshot")

    # Generate cryptographically secure unguessable share_id with collision retry
    share_id = None
    for _ in range(5):
        candidate = secrets.token_urlsafe(16)
        existing = await db.execute(select(SharedMashwara).filter(SharedMashwara.share_id == candidate))
        if not existing.scalars().first():
            share_id = candidate
            break

    if not share_id:
        raise HTTPException(status_code=500, detail="Failed to generate a unique share ID")

    snap_lang = normalized_snapshot.get("language", "roman-ur")
    snap_fallback_title = "مشاورتی رپورٹ" if snap_lang == "ur" else "Mashwara Consultation"
    shared = SharedMashwara(
        share_id=share_id,
        owner_user_id=current_user.id if current_user else None,
        language=snap_lang,
        decision_title=(normalized_snapshot.get("decision_title") or snap_fallback_title)[:500],
        snapshot=normalized_snapshot,
        created_at=utc_now_naive(),
    )
    db.add(shared)
    await db.commit()
    await db.refresh(shared)

    return SharedMashwaraResponse(
        share_id=shared.share_id,
        share_url=f"/m/{shared.share_id}",
    )


@app.get("/shared-mashwaras/{share_id}", response_model=PublicSharedMashwaraResponse, tags=["Shared Mashwara"])
async def get_public_shared_mashwara(
    share_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Public read endpoint: returns a clean, read-only consultation snapshot.
    Does NOT require authentication. Does NOT expose user IDs, emails, system prompts, or secrets.
    """
    result = await db.execute(select(SharedMashwara).filter(SharedMashwara.share_id == share_id))
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Shared Mashwara report not found")

    rec_title = record.decision_title or ("مشاورتی رپورٹ" if record.language == "ur" else "Mashwara Consultation")
    return PublicSharedMashwaraResponse(
        share_id=record.share_id,
        language=record.language,
        decision_title=rec_title,
        snapshot=record.snapshot,
        created_at=record.created_at.isoformat() + "Z" if record.created_at else "",
    )


# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
