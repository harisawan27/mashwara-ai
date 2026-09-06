"""
Boardroom AI — FastAPI Application
===================================
Main entry point for the Boardroom AI backend. Provides:
- POST /meeting: Submit a decision for board analysis
- GET /health: Health check endpoint

All API keys are loaded from environment variables via .env file.
"""

import os
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
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
try:
    import email_validator
    from pydantic import EmailStr
except Exception:
    EmailStr = str
from typing import Dict, Any, List, Optional
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
from agents.board_config import CHAT_MODEL
from agents.language_intelligence import resolve_consultation_language
from database import get_db, AsyncSessionLocal
from models.user import User
from models.meeting import Meeting
from models.chat import ChatSession, ChatMessage
from models.shared_mashwara import SharedMashwara, utc_now_naive
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

class ChatRequest(BaseModel):
    """Input schema for a streaming chat request."""
    template: str = Field(default="STARTUP_BOARD", description="Board template context")
    prompt: str = Field(..., description="The user's raw decision prompt")
    session_id: Optional[str] = Field(None, description="The chat session ID")
    language: Optional[str] = Field(None, description="Authoritative frontend language (ur, roman-ur, en)")

class SessionRenameRequest(BaseModel):
    title: str

class StandardMessageRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    language: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None

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

@app.delete("/auth/me", tags=["Auth"])
async def delete_account(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.meeting))
        .filter(ChatSession.id == session.id)
    )
    return result.scalars().first()

@app.get("/chat/sessions", response_model=List[ChatSessionResponse], tags=["Chat"])
async def get_sessions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.meeting))
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return result.scalars().all()

@app.get("/chat/sessions/{session_id}", response_model=ChatSessionResponse, tags=["Chat"])
async def get_session(session_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.meeting))
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
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.meeting))
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
        await db.delete(history[0])
        await db.delete(history[1])
        await db.commit()
    elif len(history) == 1 and history[0].role == "user":
        await db.delete(history[0])
        await db.commit()
        
    return {"status": "success"}


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
    r"^(ہاں|جی ہاں|ہاں جی|شروع کرو|مشورہ شروع کرو|کونسل بلا لو|ٹھیک ہے|اوکے|کر دو|شروع کر دو|مکمل مشورہ کرو|شروع کریں|کریں|چلو شروع کرو)",
    r"^(haan|ji haan|haan ji|shuru karo|start karo|okay shuru karo|kardo|start kardo|full mashwara start karo|chalo shuru karo|haan start|okay start|theek hai|yes convene)",
    r"^(yes|yeah|yep|start it|start the mashwara|go ahead|convene it|convene the council|please start|lets do it|do it|okay start|sure)"
]

def resolve_canonical_dilemma(raw_prompt: str, history_messages: list, current_message: str) -> str:
    """
    Ensures the council dilemma is the substantive decision under discussion,
    never a short affirmation like 'ہاں شروع کرو' or 'yes start it'.
    """
    clean_prompt = (raw_prompt or "").strip()
    is_affirmation = False
    
    if len(clean_prompt) < 15:
        for pat in AFFIRMATION_PATTERNS:
            if re.search(pat, clean_prompt, re.IGNORECASE):
                is_affirmation = True
                break
                
    if clean_prompt and not is_affirmation:
        return clean_prompt

    # Search backwards through user history for the last substantive message
    for m in reversed(history_messages):
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
        content = ""
        if hasattr(m, "content"):
            content = m.content or ""
        elif isinstance(m, dict):
            content = m.get("content", "")
        
        if role in ("user",):
            content_clean = content.strip()
            if len(content_clean) >= 10:
                is_sub_affirmation = any(re.search(pat, content_clean, re.IGNORECASE) for pat in AFFIRMATION_PATTERNS)
                if not is_sub_affirmation:
                    return content_clean

    if len(current_message.strip()) >= 10 and not any(re.search(pat, current_message.strip(), re.IGNORECASE) for pat in AFFIRMATION_PATTERNS):
        return current_message.strip()
        
    return clean_prompt or current_message.strip()

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
            temperature=0.4 if target_lang == "ur" else 0.7
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
                temperature=0.2
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

        user_msg = ChatMessage(session_id=session.id, role="user", content=body.message)
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
                        temperature=0.4
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
                    canonical_dilemma = resolve_canonical_dilemma(raw_dilemma, history_list, body.message)
                    logger.info(f"Emitting start_mashwara action: {canonical_dilemma}")
                    yield {"data": json.dumps({
                        "type": "action",
                        "action": "start_mashwara",
                        "decision_prompt": canonical_dilemma
                    })}
                    yield {"data": json.dumps({"type": "done"})}
                    return

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
                            temperature=0.2
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
                        temperature=0.7
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
                        canonical_dilemma = resolve_canonical_dilemma(raw_dilemma, history_list, body.message)
                        logger.info(f"Emitting start_mashwara action: {canonical_dilemma}")
                        yield {"data": json.dumps({
                            "type": "action",
                            "action": "start_mashwara",
                            "decision_prompt": canonical_dilemma
                        })}
                        action_fired = True
                        break

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
    try:
        template_type = TemplateType(body.template)
    except ValueError:
        template_type = TemplateType.STARTUP_BOARD

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
                user_msg = ChatMessage(session_id=session.id, role="user", content=body.prompt)
                db.add(user_msg)
                
                template_name_formatted = template_type.value.replace("_", " ").title()
                asst_msg = ChatMessage(
                    session_id=session.id, 
                    role="assistant", 
                    content=f"Mashwara Council is convening to analyze this decision.", 
                    is_agentic=True,
                    meeting_id=meeting_id
                )
                db.add(asst_msg)
                await db.commit()
                
                client = genai.Client()
                try:
                    summary_prompt = f"Write a professional, 1 paragraph consultation confirmation in {body.language or 'Urdu'} confirming that the Mashwara Council is convening to analyze the following decision. Be concise, engaging and supportive.\n\nDecision:\n{body.prompt}"
                    response = client.models.generate_content(
                        model=CHAT_MODEL,
                        contents=summary_prompt,
                    )
                    if response.text:
                        asst_msg.content = response.text
                        await db.commit()
                except Exception as e:
                    logger.error(f"Failed to generate summary: {e}")

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
                cancel_event=cancel_event
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
                async def save_meeting():
                    async with AsyncSessionLocal() as session_db:
                        result = await session_db.execute(select(Meeting).filter(Meeting.id == meeting_id))
                        db_meeting = result.scalars().first()
                        if db_meeting:
                            if final_report_data:
                                db_meeting.report_data = final_report_data
                            db_meeting.streams_data = streams_accumulator
                            await session_db.commit()
                import asyncio
                asyncio.create_task(save_meeting())
            logger.info(f"Board stream event_generator finished for meeting {meeting_id}.")

    return EventSourceResponse(event_generator())


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

    return {
        "decision_title": decision_title or ("مشاورتی رپورٹ" if language == "ur" else "Mashwara Consultation"),
        "language": language or "roman-ur",
        "domain": template.replace("_BOARD", "").lower() if template else "general",
        "template": template or "career",
        "experts": normalized_experts,
        "report": clean_report,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


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
