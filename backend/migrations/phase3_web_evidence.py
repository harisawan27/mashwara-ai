"""
Phase 3 Database Migration: Add web_evidence and web_search_mode to chat_messages
================================================================================
Idempotent script to apply schema changes to PostgreSQL (Neon) or SQLite.
Run with: python -m migrations.phase3_web_evidence
"""

import asyncio
import logging
from sqlalchemy import text
from database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mashwara_ai.migration")


async def run_phase3_migration():
    logger.info("Starting Phase 3 database migration...")
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        logger.info(f"Database dialect: {dialect}")

        if dialect == "postgresql":
            # Neon PostgreSQL
            await conn.execute(text("""
                ALTER TABLE chat_messages 
                ADD COLUMN IF NOT EXISTS web_evidence JSONB;
            """))
            logger.info("Executed: ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS web_evidence JSONB;")

            await conn.execute(text("""
                ALTER TABLE chat_messages 
                ADD COLUMN IF NOT EXISTS web_search_mode VARCHAR(16) DEFAULT 'auto';
            """))
            logger.info("Executed: ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS web_search_mode VARCHAR(16) DEFAULT 'auto';")

        else:
            # SQLite (for local test environments)
            columns_res = await conn.execute(text("PRAGMA table_info(chat_messages);"))
            columns = [row[1] for row in columns_res.fetchall()]

            if "web_evidence" not in columns:
                await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN web_evidence JSON;"))
                logger.info("Added web_evidence column to SQLite chat_messages table.")

            if "web_search_mode" not in columns:
                await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN web_search_mode VARCHAR(16) DEFAULT 'auto';"))
                logger.info("Added web_search_mode column to SQLite chat_messages table.")

    logger.info("Phase 3 database migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(run_phase3_migration())
