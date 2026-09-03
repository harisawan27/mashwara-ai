import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Gracefully fallback to local SQLite if DATABASE_URL is not configured (e.g. Hugging Face Spaces default)
if not DATABASE_URL:
    DATABASE_URL = "sqlite+aiosqlite:///./boardroom.db"

is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {}

# Handle asyncpg sslmode for PostgreSQL
if not is_sqlite:
    if "?sslmode=require" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "")
    connect_args = {"ssl": True}

# Create async SQLAlchemy engine
engine = create_async_engine(DATABASE_URL, echo=False, connect_args=connect_args)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    """Dependency to get the database session."""
    async with AsyncSessionLocal() as session:
        yield session
