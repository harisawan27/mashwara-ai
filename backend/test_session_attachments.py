"""Regression coverage for attachment metadata in authenticated chat history."""

import sys
import unittest
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import Base, get_db
from main import app
from models.attachment import Attachment, AttachmentContext
from models.chat import ChatMessage, ChatSession
from models.user import User
from security.auth import create_access_token


class TestSessionAttachments(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with self.sessions() as db:
            owner = User(id="history-owner", email="owner@example.test")
            other = User(id="other-owner", email="other@example.test")
            history = ChatSession(id="with-attachments", user=owner, title="Evidence history")
            empty = ChatSession(id="without-attachments", user=owner, title="Plain history")
            context = AttachmentContext(
                id="evidence-context", user=owner, session=history, status="ready"
            )
            attachment = Attachment(
                id="evidence-file", context=context, display_filename="offer.pdf",
                mime_type="application/pdf", size_bytes=128,
                storage_key="private/test/offer.pdf", status="ready",
            )
            messages = [
                ChatMessage(
                    id=f"evidence-message-{index}", session=history, role="user",
                    content="Review my offer", attachment_context=context,
                )
                for index in range(3)
            ]
            plain = ChatMessage(
                id="plain-message", session=empty, role="user", content="Career question"
            )
            db.add_all([owner, other, history, empty, context, attachment, *messages, plain])
            await db.commit()

        async def isolated_db():
            async with self.sessions() as db:
                yield db

        self.previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = isolated_db
        self.origin = "https://mashwara-ai.vercel.app"
        self.headers = {
            "Origin": self.origin,
            "Authorization": "Bearer " + create_access_token({"sub": "history-owner"}),
        }
        self.client = AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="https://api.example.test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.previous_overrides)
        await self.engine.dispose()

    def assert_history(self, history):
        self.assertEqual(history["id"], "with-attachments")
        self.assertEqual(len(history["messages"]), 3)
        for message in history["messages"]:
            self.assertEqual(len(message["attachments"]), 1)
            item = message["attachments"][0]
            self.assertEqual(item["context_id"], "evidence-context")
            self.assertEqual(item["filename"], "offer.pdf")
            self.assertEqual(item["content_type"], "application/pdf")
            self.assertEqual(item["status"], "ready")
            self.assertEqual(item["size_bytes"], 128)
            self.assertNotIn("storage_key", item)
            self.assertNotIn("attachment_context_id", item)
            self.assertNotIn("display_filename", item)
            self.assertNotIn("mime_type", item)

    async def test_list_serializes_nested_orm_attachments(self):
        response = await self.client.get("/chat/sessions", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], self.origin)
        history = next(item for item in response.json() if item["id"] == "with-attachments")
        self.assert_history(history)

    async def test_detail_serializes_nested_orm_attachments(self):
        response = await self.client.get("/chat/sessions/with-attachments", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], self.origin)
        self.assert_history(response.json())

    async def test_plain_history_still_loads(self):
        response = await self.client.get("/chat/sessions/without-attachments", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["messages"][0]["attachments"], [])

    async def test_attachment_list_keeps_existing_public_field_names(self):
        response = await self.client.get(
            "/attachments", params={"context_id": "evidence-context"}, headers=self.headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]["filename"], "offer.pdf")
        self.assertEqual(response.json()[0]["context_id"], "evidence-context")

    async def test_other_user_cannot_read_history(self):
        headers = dict(self.headers)
        headers["Authorization"] = "Bearer " + create_access_token({"sub": "other-owner"})
        response = await self.client.get("/chat/sessions/with-attachments", headers=headers)
        self.assertEqual(response.status_code, 404)
        response = await self.client.get("/chat/sessions", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


if __name__ == "__main__":
    unittest.main()
