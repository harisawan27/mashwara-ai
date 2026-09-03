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
from database import get_db, AsyncSessionLocal
from models.user import User
from models.meeting import Meeting
from models.chat import ChatSession, ChatMessage
from security.auth import get_password_hash, verify_password, create_access_token, get_current_user
import datetime
from sqlalchemy.orm import selectinload
from google import genai
import google.genai.types as genai_types

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
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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

class SessionRenameRequest(BaseModel):
    title: str

class StandardMessageRequest(BaseModel):
    session_id: str
    message: str

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
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

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
        session.title = body.message[:30] + "..." if len(body.message) > 30 else body.message
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
    # System context
    system_prompt = "You are the Chief of Staff for a CEO. You help them brainstorm and refine proposals before they present them to the Board of Directors. Be concise, professional, and helpful."
    if current_user.profile_data:
        system_prompt += f"\nUser Context: {json.dumps(current_user.profile_data)}"
    
    # Build history for Gemini
    for m in history:
        if m.role == "user" or m.role == "assistant":
            # For Gemini, role is "user" or "model"
            r = "model" if m.role == "assistant" else "user"
            contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=m.content)]))

    response = client.models.generate_content(
        model='gemini-3.1-flash-lite',
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7
        )
    )
    
    ai_text = response.text or "I understand. Would you like me to convene the board on this?"
    
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
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    user_msg = ChatMessage(session_id=session.id, role="user", content=body.message)
    db.add(user_msg)
    
    if session.title == "New Brainstorming Session":
        session.title = body.message[:30] + "..." if len(body.message) > 30 else body.message
    session.updated_at = datetime.datetime.utcnow()
    await db.commit()

    hist_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = hist_result.scalars().all()
    
    contents = []
    system_prompt = "You are the Chief of Staff for a CEO. You help them brainstorm and refine proposals. IMPORTANT: Before you answer, you MUST write your internal thought process wrapped in <think>...</think> tags."
    if current_user.profile_data:
        system_prompt += f"\nUser Context: {json.dumps(current_user.profile_data)}"
    
    for m in history:
        if m.role == "user" or m.role == "assistant":
            r = "model" if m.role == "assistant" else "user"
            contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=m.content)]))

    async def event_generator():
        client = genai.Client()
        full_text = ""
        full_thinking = ""
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model='gemini-3.1-flash-lite',
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
            if full_text or full_thinking:
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit a prompt for board analysis and stream the responses.
    """
    try:
        template_type = TemplateType(body.template)
    except ValueError:
        template_type = TemplateType.STARTUP_BOARD

    # Generate meeting ID and Save to DB
    meeting_id = str(uuid.uuid4())
    logger.info(f"Starting chat stream {meeting_id} | template={template_type.value} | user={current_user.email}")
    
    new_meeting = Meeting(
        id=meeting_id,
        user_id=current_user.id,
        template=template_type.value,
        prompt=body.prompt
    )
    db.add(new_meeting)

    # Prepare Context Prompt for the board
    context_str = "User Context:\n"
    if current_user.profile_data:
        for k, v in current_user.profile_data.items():
            if v:
                context_str += f"- {k.capitalize()}: {v}\n"

    # Optional: Link to chat session
    user_msg = None
    asst_msg = None
    if body.session_id:
        result = await db.execute(select(ChatSession).filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id))
        session = result.scalars().first()
        if session:
            session.updated_at = datetime.datetime.utcnow()
            user_msg = ChatMessage(session_id=session.id, role="user", content=body.prompt)
            db.add(user_msg)
            
            # The assistant message holds the meeting UI
            template_name_formatted = template_type.value.replace("_", " ").title()
            asst_msg = ChatMessage(
                session_id=session.id, 
                role="assistant", 
                content=f"I am convening the {template_name_formatted} to analyze this decision.", 
                is_agentic=True,
                meeting_id=meeting_id
            )
            db.add(asst_msg)
            await db.commit() # Commit immediately so it is not lost if the user cancels early
            
            # Generate a 1-2 paragraph executive summary
            client = genai.Client()
            try:
                summary_prompt = f"Write a professional, 1-2 paragraph executive summary confirming that you are convening the {template_name_formatted} to analyze the following decision. Do not use Markdown headings. Be concise and engaging.\n\nDecision:\n{body.prompt}"
                response = client.models.generate_content(
                    model='gemini-3.1-flash-lite',
                    contents=summary_prompt,
                )
                if response.text:
                    asst_msg.content = response.text
                    await db.commit()
            except Exception as e:
                logger.error(f"Failed to generate summary: {e}")

            # If session is provided, add chat history as context
            hist_result = await db.execute(
                select(ChatMessage)
                .filter(ChatMessage.session_id == body.session_id)
                .order_by(ChatMessage.created_at.asc())
            )
            history = hist_result.scalars().all()
            if history:
                context_str += "\nPrevious Chat Context:\n"
                for m in history:
                    if not m.is_agentic and m.id != user_msg.id: # Ignore agent reports
                        role_str = "User" if m.role == "user" else "Chief of Staff"
                        context_str += f"{role_str}: {m.content}\n"

    await db.commit()
    final_prompt = f"{context_str}\nTask:\n{body.prompt}"

    async def event_generator():
        import asyncio as _asyncio
        cancel_event = _asyncio.Event()
        final_report_data = None
        streams_accumulator = {"_roles": []}
        try:
            async for chunk in run_meeting(meeting_id, template_type, {"prompt": final_prompt, "decision_title": "Chat Session"}, cancel_event=cancel_event):
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
                        # Clean split of text + thinking after full collection
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
            # Save whatever was accumulated (even on disconnect)
            if final_report_data or len(streams_accumulator) > 1:
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
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
