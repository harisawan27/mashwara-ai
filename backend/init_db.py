import asyncio
from database import engine, Base
import models # Ensure models are imported

async def init_models():
    async with engine.begin() as conn:
        # Create tables
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(init_models())
    print("Database tables created successfully!")
