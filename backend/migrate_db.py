import asyncio
from sqlalchemy import text
from database import engine

async def run_step(sql: str, description: str):
    async with engine.begin() as conn:
        try:
            await conn.execute(text(sql))
            print(f"SUCCESS: {description}")
        except Exception as e:
            err_msg = str(e).lower()
            if "already exists" in err_msg or "duplicate column" in err_msg:
                print(f"ALREADY APPLIED: {description}")
            else:
                print(f"NOTICE ({description}): {e}")

async def migrate():
    print("Starting database migration...")
    # 1. Add streams_data to meetings (legacy)
    await run_step("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS streams_data JSONB;", "Add streams_data column to meetings")
    
    # 2. Add google_sub to users (PostgreSQL syntax)
    await run_step("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);", "Add google_sub column to users")
    
    # 3. Create unique index ix_users_google_sub on users (google_sub)
    await run_step("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub);", "Create unique index ix_users_google_sub")
    
    # 4. Make hashed_password nullable for social sign-in users
    await run_step("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;", "Make hashed_password column nullable")
    
    print("Database migration finished.")

if __name__ == "__main__":
    asyncio.run(migrate())
