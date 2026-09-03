import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def add_column():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if "?sslmode=require" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "")
        
    engine = create_async_engine(DATABASE_URL, connect_args={"ssl": True})
    
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN thinking VARCHAR;"))
            print("Successfully added thinking column!")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate column name" in str(e).lower() or "42701" in str(e):
                print("Column already exists!")
            else:
                print("Error:", e)

if __name__ == "__main__":
    asyncio.run(add_column())
