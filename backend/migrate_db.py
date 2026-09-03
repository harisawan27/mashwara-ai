import asyncio
from sqlalchemy import text
from database import engine

async def migrate():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE meetings ADD COLUMN streams_data JSONB;"))
            print("Successfully added streams_data column.")
        except Exception as e:
            if "already exists" in str(e) or "Duplicate column" in str(e):
                print("Column already exists.")
            else:
                print(f"Error (might be sqlite syntax or exists): {e}")
                # Try SQLite syntax if JSONB fails or something
                try:
                    await conn.execute(text("ALTER TABLE meetings ADD COLUMN streams_data JSON;"))
                    print("Added as JSON for SQLite.")
                except Exception as e2:
                    print(f"Fallback error: {e2}")

if __name__ == "__main__":
    asyncio.run(migrate())
