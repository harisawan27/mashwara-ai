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

    # 5. Phase 2: Create attachment_contexts table
    await run_step("""
    CREATE TABLE IF NOT EXISTS attachment_contexts (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR REFERENCES chat_sessions(id) ON DELETE CASCADE,
        guest_scope_id VARCHAR(64),
        guest_scope_secret_hash VARCHAR(64),
        gemini_store_name VARCHAR(255),
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
        expires_at TIMESTAMP WITHOUT TIME ZONE,
        sealed_at TIMESTAMP WITHOUT TIME ZONE
    );
    """, "Create attachment_contexts table")

    # 6. Phase 2: Create indexes on attachment_contexts
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachment_contexts_user_id ON attachment_contexts(user_id);", "Create index ix_attachment_contexts_user_id")
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachment_contexts_session_id ON attachment_contexts(session_id);", "Create index ix_attachment_contexts_session_id")
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachment_contexts_guest_scope_id ON attachment_contexts(guest_scope_id);", "Create index ix_attachment_contexts_guest_scope_id")
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachment_contexts_status ON attachment_contexts(status);", "Create index ix_attachment_contexts_status")

    # 7. Phase 2: Create attachments table
    await run_step("""
    CREATE TABLE IF NOT EXISTS attachments (
        id VARCHAR PRIMARY KEY,
        attachment_context_id VARCHAR NOT NULL REFERENCES attachment_contexts(id) ON DELETE CASCADE,
        display_filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size_bytes BIGINT NOT NULL,
        storage_key VARCHAR(512) UNIQUE NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        gemini_file_name VARCHAR(255),
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """, "Create attachments table")

    # 8. Phase 2: Create indexes on attachments
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachments_context_id ON attachments(attachment_context_id);", "Create index ix_attachments_context_id")
    await run_step("CREATE INDEX IF NOT EXISTS ix_attachments_status ON attachments(status);", "Create index ix_attachments_status")

    # 9. Phase 2: Add attachment_context_id to chat_messages
    await run_step("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_context_id VARCHAR REFERENCES attachment_contexts(id) ON DELETE SET NULL;", "Add attachment_context_id column to chat_messages")
    await run_step("CREATE INDEX IF NOT EXISTS ix_chat_messages_attachment_context_id ON chat_messages(attachment_context_id);", "Create index ix_chat_messages_attachment_context_id")

    print("Database migration finished.")

if __name__ == "__main__":
    asyncio.run(migrate())
