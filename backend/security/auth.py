import os
import uuid
import logging
import jwt
from jwt import PyJWKClient
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User

logger = logging.getLogger("boardroom_ai.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Auto error is False so we can support optional authentication for Guest mode
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "default-mashwara-jwt-secret-key-change-in-prod")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200")) # 30 days

# Neon Auth Configuration & JWKS URL normalization
NEON_AUTH_URL = os.getenv(
    "NEON_AUTH_URL",
    os.getenv("NEON_AUTH_BASE_URL", "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth")
)
_raw_jwks = os.getenv("NEON_AUTH_JWKS_URL", f"{NEON_AUTH_URL}/.well-known/jwks.json")
if _raw_jwks.endswith(".well-known/jwks.js"):
    NEON_AUTH_JWKS_URL = _raw_jwks[:-3] + ".json"
else:
    NEON_AUTH_JWKS_URL = _raw_jwks

_jwks_client = None

def get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        try:
            _jwks_client = PyJWKClient(NEON_AUTH_JWKS_URL, cache_keys=True)
        except Exception as e:
            logger.warning(f"Could not initialize PyJWKClient with {NEON_AUTH_JWKS_URL}: {e}")
    return _jwks_client

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password with safe truncation to 72 bytes to prevent bcrypt ValueError."""
    if isinstance(plain_password, str):
        # bcrypt has a 72 byte limit; truncate safely in bytes
        plain_password = plain_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash password with safe truncation to 72 bytes."""
    if isinstance(password, str):
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_optional_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User | None:
    """
    Optional authentication dependency.
    - If Authorization header is absent -> returns None (Guest mode)
    - If valid local Mashwara AI JWT is supplied -> returns authenticated User
    - If valid Neon Auth JWKS token is supplied -> finds or provisions User and returns User
    - If token is supplied but invalid or expired -> raises 401 error
    """
    if not token:
        return None

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user_id: str | None = None
    neon_email: str | None = None
    neon_name: str | None = None

    # 1. Try local Mashwara AI JWT
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        # 2. Try validating as Neon Auth JWT token via JWKS
        client = get_jwks_client()
        if client and token.count(".") == 2:
            try:
                signing_key = client.get_signing_key_from_jwt(token)
                neon_payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["EdDSA", "RS256", "ES256", "HS256"],
                    options={"verify_aud": False}
                )
                neon_email = neon_payload.get("email")
                neon_name = neon_payload.get("name") or neon_payload.get("user", {}).get("name", "")
                user_id = neon_payload.get("sub")
            except Exception as jwks_err:
                logger.debug(f"Token is not a valid Neon Auth JWKS token: {jwks_err}")
                raise credentials_exception
        else:
            raise credentials_exception

    # Find user by ID if present
    if user_id:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalars().first()
        if user:
            return user

    # Find or provision user by email if verified via Neon Auth
    if neon_email:
        result = await db.execute(select(User).filter(User.email == neon_email))
        user = result.scalars().first()
        if user:
            return user
        # Auto-provision user account
        user = User(
            id=str(uuid.uuid4()),
            email=neon_email,
            hashed_password="",
            profile_data={"name": neon_name or ""}
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    raise credentials_exception

async def get_current_user(
    user: User | None = Depends(get_optional_current_user)
) -> User:
    """
    Strict authentication dependency.
    Raises 401 if user is not authenticated.
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
