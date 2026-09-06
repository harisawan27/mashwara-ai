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

class NeonAuthExchangeRequest(BaseModel):
    session_token: str

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

@app.get("/auth/neon/config", tags=["Auth"])
async def get_neon_auth_config():
    """Returns the public Neon Auth base URL and JWKS URL for client-side OAuth."""
    neon_url = os.getenv(
        "NEON_AUTH_URL",
        os.getenv("NEON_AUTH_BASE_URL", "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth")
    )
    raw_jwks = os.getenv("NEON_AUTH_JWKS_URL", f"{neon_url}/.well-known/jwks.json")
    if raw_jwks.endswith(".well-know"):
        jwks_url = raw_jwks + "n/jwks.json"
    elif raw_jwks.endswith(".well-known"):
        jwks_url = raw_jwks + "/jwks.json"
    elif raw_jwks.endswith(".well-known/jwks.js"):
        jwks_url = raw_jwks[:-3] + ".json"
    elif not raw_jwks.endswith(".json"):
        jwks_url = raw_jwks.rstrip("/") + "/.well-known/jwks.json"
    else:
        jwks_url = raw_jwks

    return {
        "neon_auth_url": neon_url,
        "neon_auth_jwks_url": jwks_url,
    }

@app.post("/auth/neon/exchange", tags=["Auth"])
@limiter.limit("30/minute")
async def exchange_neon_auth_session(
    request: Request,
    body: NeonAuthExchangeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Exchanges a verified, user-bound Neon Auth session token or JWT for a Mashwara AI JWT.
    Enforces deterministic user-bound credential validation:
    1. Direct Neon Auth JWT signature verification via JWKS
    2. Exact session token lookup against active neon_auth.session records
    No unverified recent-session guessing allowed.
    """
    token_val = (body.session_token or "").strip()
    if not token_val or token_val.lower() in ["recent", "google", "oauth", "none", "null", "undefined"]:
        raise HTTPException(status_code=401, detail="Valid user-bound Neon Auth credential is required")

    neon_email = None
    neon_name = ""
    neon_image = ""

    from sqlalchemy import text
    import jwt
    from jwt import PyJWKClient

    # Strategy 1: If token has 3 parts separated by dots, verify as a JWT via JWKS
    if token_val.count(".") == 2:
        try:
            neon_url = os.getenv(
                "NEON_AUTH_URL",
                os.getenv("NEON_AUTH_BASE_URL", "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth")
            )
            raw_jwks = os.getenv("NEON_AUTH_JWKS_URL", f"{neon_url}/.well-known/jwks.json")
            if raw_jwks.endswith(".well-know"):
                jwks_url = raw_jwks + "n/jwks.json"
            elif raw_jwks.endswith(".well-known"):
                jwks_url = raw_jwks + "/jwks.json"
            elif raw_jwks.endswith(".well-known/jwks.js"):
                jwks_url = raw_jwks[:-3] + ".json"
            elif not raw_jwks.endswith(".json"):
                jwks_url = raw_jwks.rstrip("/") + "/.well-known/jwks.json"
            else:
                jwks_url = raw_jwks

            jwks_client = PyJWKClient(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token_val)
            decoded = jwt.decode(
                token_val,
                signing_key.key,
                algorithms=["EdDSA", "RS256", "ES256", "HS256"],
                options={"verify_aud": False}
            )
            neon_email = decoded.get("email")
            neon_name = decoded.get("name") or decoded.get("user", {}).get("name", "")
            neon_image = decoded.get("picture") or decoded.get("image") or decoded.get("user", {}).get("image", "")
            logger.info(f"Verified Neon Auth user via JWKS token: {neon_email}")
        except Exception as jwt_err:
            logger.warning(f"JWKS token verification attempted but failed: {jwt_err}")

    # Strategy 2: Check database neon_auth.session table for this exact session token
    if not neon_email:
        try:
            query = text("""
                SELECT s.token, s."expiresAt", u.id, u.email, u.name, u.image 
                FROM neon_auth.session s
                JOIN neon_auth.user u ON s."userId" = u.id
                WHERE s.token = :token AND s."expiresAt" > NOW();
            """)
            res = await db.execute(query, {"token": token_val})
            row = res.fetchone()
            if row:
                neon_email = row.email
                neon_name = row.name or ""
                neon_image = row.image or ""
                logger.info(f"Verified Neon Auth user via database session token: {neon_email}")
        except Exception as e:
            logger.error(f"Error checking neon_auth session in DB: {e}", exc_info=True)

    if not neon_email:
        raise HTTPException(status_code=401, detail="Invalid or expired Neon Auth credential for this user")

    # Find or create user in public.users
    user_res = await db.execute(select(User).filter(User.email == neon_email))
    user = user_res.scalars().first()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=neon_email,
            hashed_password="",  # OAuth user
            profile_data={"name": neon_name, "avatar": neon_image}
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update name or avatar if not yet set
        profile = dict(user.profile_data or {})
        updated = False
        if not profile.get("name") and neon_name:
            profile["name"] = neon_name
            updated = True
        if not profile.get("avatar") and neon_image:
            profile["avatar"] = neon_image
            updated = True
        if updated:
            user.profile_data = profile
            await db.commit()

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
    if target_lang == "ur":
        system_prompt = (
            "آپ مشورہ اے آئی (Mashwara AI) کے مشاورتی معاون ہیں۔ "
            "آپ صارف کے فیصلے یا مسئلے کو بغور سمجھتے ہیں، اگر ضروری ہو تو مختصر اور اہم وضاحتی سوال پوچھتے ہیں، "
            "ابتدائی مفید مشورہ دیتے ہیں، اور جہاں مختلف ماہرین کے زاویوں کی ضرورت ہو وہاں مکمل مشورہ کونسل شروع کرنے کی تجویز دیتے ہیں۔ "
            "سلیس اور شستہ اردو میں بات کریں۔ کوئی غیر ضروری لمبا جواب نہ دیں۔"
        )
    elif target_lang == "roman-ur":
        system_prompt = (
            "Aap Mashwara AI ke Mashwara Assistant hain. "
            "Aap user ke decision ya confusion ko achi tarah samajhte hain, zaroorat parne par focused sawal poochte hain, "
            "lightweight practical guidance dete hain, aur jahan multi-agent council ki zaroorat ho wahan full Mashwara start karne ka mashwara dete hain. "
            "Natural modern Pakistani Roman Urdu mein baat karein."
        )
    else:
        system_prompt = (
            "You are the Mashwara Assistant on Mashwara AI. "
            "You help users clarify their decisions, ask decisive questions when necessary, provide concise helpful guidance, "
            "and recommend convening a full Mashwara expert consultation when multiple specialist perspectives would add value."
        )

    if current_user.profile_data:
        system_prompt += f"\nUser Context: {json.dumps(current_user.profile_data)}"
    
    # Build history for Gemini
    for m in history:
        if m.role == "user" or m.role == "assistant":
            # For Gemini, role is "user" or "model"
            r = "model" if m.role == "assistant" else "user"
            contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=m.content)]))

    response = client.models.generate_content(
        model=CHAT_MODEL,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7
        )
    )
    
    ai_text = response.text or ("میں سمجھ گیا ہوں۔ کیا آپ چاہتے ہیں کہ اس پر مکمل مشورہ کونسل کا اجلاس بلایا جائے؟" if target_lang == "ur" else ("Main samajh gaya hoon. Kya aap chahte hain ke is par full Mashwara Council ka mashwara shuru kiya jaye?" if target_lang == "roman-ur" else "I understand. Would you like to convene the full Mashwara council on this?"))
    
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
    if target_lang == "ur":
        system_prompt = (
            "آپ مشورہ اے آئی (Mashwara AI) کے مشاورتی معاون ہیں۔ "
            "آپ صارف کے فیصلے یا مسئلے کو بغور سمجھتے ہیں، اگر ضروری ہو تو مختصر اور اہم وضاحتی سوال پوچھتے ہیں، "
            "ابتدائی مفید مشورہ دیتے ہیں، اور جہاں مختلف ماہرین کے زاویوں کی ضرورت ہو وہاں مکمل مشورہ کونسل شروع کرنے کی تجویز دیتے ہیں۔ "
            "سلیس اور شستہ اردو میں بات کریں۔"
        )
    elif target_lang == "roman-ur":
        system_prompt = (
            "Aap Mashwara AI ke Mashwara Assistant hain. "
            "Aap user ke decision ya confusion ko achi tarah samajhte hain, zaroorat parne par focused sawal poochte hain, "
            "lightweight practical guidance dete hain, aur jahan multi-agent council ki zaroorat ho wahan full Mashwara start karne ka mashwara dete hain. "
            "Natural modern Pakistani Roman Urdu mein baat karein."
        )
    else:
        system_prompt = (
            "You are the Mashwara Assistant on Mashwara AI. "
            "You help users clarify their decisions, ask decisive questions when necessary, provide concise helpful guidance, "
            "and recommend convening a full Mashwara expert consultation when multiple specialist perspectives would add value."
        )

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

    async def event_generator():
        client = genai.Client()
        full_text = ""
        full_thinking = ""
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model=CHAT_MODEL,
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.7
                )
            )
            
            from agents import AgentStreamParser
            parser = AgentStreamParser()
            
            async for chunk in response_stream:
                if await request.is_disconnected():
                    logger.info("Client disconnected, stopping standard stream.")
                    break
                if chunk.text:
                    for is_thinking, parsed_content in parser.process_chunk(chunk.text):
                        if is_thinking:
                            full_thinking += parsed_content
                            yield {"data": json.dumps({"type": "thinking", "text": parsed_content})}
                        else:
                            full_text += parsed_content
                            yield {"data": json.dumps({"type": "chunk", "text": parsed_content})}
            
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
            if current_user is not None and session is not None and (full_text or full_thinking):
                async def save_msg():
                    async with AsyncSessionLocal() as session_db:
                        asst_msg = ChatMessage(session_id=session.id, role="assistant", content=full_text, thinking=full_thinking)
                        session_db.add(asst_msg)
                        await session_db.commit()
                import asyncio
                asyncio.create_task(save_msg())
            yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())




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
                    "decision_title": "Mashwara Consultation",
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
        "decision_title": decision_title or "Mashwara Consultation",
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
            normalized_snapshot = {
                "decision_title": s.get("decision_title") or body.decision_title or "Mashwara Consultation",
                "language": s.get("language") or body.language or "roman-ur",
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
            normalized_snapshot = normalize_consultation_snapshot(
                decision_title=s.get("decision_title") or body.decision_title or "Mashwara Consultation",
                language=s.get("language") or body.language or "roman-ur",
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

    shared = SharedMashwara(
        share_id=share_id,
        owner_user_id=current_user.id if current_user else None,
        language=normalized_snapshot.get("language", "roman-ur"),
        decision_title=normalized_snapshot.get("decision_title", "Mashwara Consultation")[:500],
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

    return PublicSharedMashwaraResponse(
        share_id=record.share_id,
        language=record.language,
        decision_title=record.decision_title or "Mashwara Consultation",
        snapshot=record.snapshot,
        created_at=record.created_at.isoformat() + "Z" if record.created_at else "",
    )


# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
