"""
Unit Tests for Shared Mashwara Reports
=======================================
Tests:
- Snapshot normalization & sanitization
- Unguessable token generation
- POST /shared-mashwaras payload validation & size limit
- GET /shared-mashwaras/{share_id} public snapshot & 404 behavior
"""

import sys
import os
import unittest
import asyncio
from pathlib import Path

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from main import normalize_consultation_snapshot, app
from models.shared_mashwara import SharedMashwara


class TestSharedMashwaraSnapshot(unittest.TestCase):
    def test_normalize_consultation_snapshot(self):
        roles = [
            {
                "key": "career_advisor",
                "name": "Career Musheer",
                "title": "Career Strategy",
                "description": "Career planning",
                "icon": "🧭",
                "color": "from-blue-500 to-blue-700",
            },
            {
                "key": "lead_advisor",
                "name": "Lead Musheer",
                "is_moderator": True,
            }
        ]
        streams = {
            "career_advisor": {
                "text": "Yeh faisla behtar hai.<think>internal thought</think>\n```json\n{\"position\":\"support\"}\n```",
                "status": "done"
            }
        }
        report = {
            "final_decision": "APPROVE",
            "confidence_score": 82,
            "board_votes": {
                "career_advisor": {"vote": "YES", "confidence": 85}
            },
            "debate_summary": "Tammam musheereen ne ittefaq kiya.",
            "key_risks": ["Cash flow risk"],
            "recommended_actions": ["30 din ka test karein"]
        }

        snapshot = normalize_consultation_snapshot(
            decision_title="90k job vs freelancing",
            language="roman-ur",
            template="career",
            roles=roles,
            streams=streams,
            report=report
        )

        self.assertEqual(snapshot["decision_title"], "90k job vs freelancing")
        self.assertEqual(snapshot["language"], "roman-ur")
        self.assertEqual(len(snapshot["experts"]), 1)
        
        expert = snapshot["experts"][0]
        self.assertEqual(expert["role_id"], "career_advisor")
        self.assertEqual(expert["name"], "Career Musheer")
        self.assertEqual(expert["vote"], "YES")
        self.assertEqual(expert["confidence"], 85)
        self.assertNotIn("<think>", expert["analysis"])
        self.assertNotIn("```json", expert["analysis"])
        self.assertIn("Yeh faisla behtar hai.", expert["analysis"])

        # Moderator excluded from individual expert cards
        self.assertFalse(any(e["role_id"] == "lead_advisor" for e in snapshot["experts"]))
        
        # Report verified
        self.assertEqual(snapshot["report"]["final_decision"], "APPROVE")
        self.assertEqual(snapshot["report"]["confidence_score"], 82)
        self.assertEqual(snapshot["report"]["key_risks"], ["Cash flow risk"])

    def test_snapshot_does_not_contain_secrets(self):
        snapshot = normalize_consultation_snapshot(
            decision_title="Test",
            language="en",
            template="career",
            roles=[],
            streams={},
            report={}
        )
        # Verify forbidden keys are absent
        forbidden = ["api_key", "password", "token", "secret", "user_id", "email"]
        for k in forbidden:
            self.assertNotIn(k, snapshot)


class TestSharedMashwaraAPI(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from httpx import AsyncClient, ASGITransport
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from database import Base, get_db

        self.test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        self.TestSessionLocal = async_sessionmaker(bind=self.test_engine, expire_on_commit=False)

        async with self.test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def override_get_db():
            async with self.TestSessionLocal() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        from database import get_db
        await self.client.aclose()
        app.dependency_overrides.pop(get_db, None)
        await self.test_engine.dispose()

    async def test_create_and_read_shared_mashwara(self):
        sample_snapshot = {
            "decision_title": "Online store vs freelancing",
            "language": "roman-ur",
            "domain": "career",
            "template": "career",
            "experts": [
                {
                    "role_id": "career_advisor",
                    "name": "Career Musheer",
                    "title": "Career Strategy",
                    "description": "Planning",
                    "icon": "🧭",
                    "color": "from-blue-500 to-blue-700",
                    "analysis": "Pehle job ko thoda time dein.",
                    "vote": "support",
                    "confidence": 80
                }
            ],
            "report": {
                "final_decision": "APPROVE",
                "confidence_score": 80,
                "board_votes": {"career_advisor": {"vote": "YES", "confidence": 80}},
                "debate_summary": "Mutafiqqa faisla yeh hai ke pehle market test karein.",
                "key_risks": ["Demand uncertainty"],
                "recommended_actions": ["Test with 10 clients"]
            }
        }

        # 1. Create share link
        res = await self.client.post("/shared-mashwaras", json={"snapshot": sample_snapshot})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("share_id", data)
        self.assertIn("share_url", data)
        share_id = data["share_id"]
        self.assertEqual(data["share_url"], f"/m/{share_id}")
        self.assertGreaterEqual(len(share_id), 16)

        # 2. Read public snapshot
        read_res = await self.client.get(f"/shared-mashwaras/{share_id}")
        self.assertEqual(read_res.status_code, 200)
        read_data = read_res.json()
        self.assertEqual(read_data["share_id"], share_id)
        self.assertEqual(read_data["language"], "roman-ur")
        self.assertEqual(read_data["decision_title"], "Online store vs freelancing")
        self.assertEqual(len(read_data["snapshot"]["experts"]), 1)
        self.assertEqual(read_data["snapshot"]["experts"][0]["name"], "Career Musheer")
        self.assertEqual(read_data["snapshot"]["report"]["final_decision"], "APPROVE")
        
        # Verify no owner or sensitive metadata leaked
        self.assertNotIn("owner_user_id", read_data)
        self.assertNotIn("email", read_data)

        # Verify created_at in database is naive UTC
        from sqlalchemy import select
        async with self.TestSessionLocal() as session:
            db_res = await session.execute(select(SharedMashwara).filter(SharedMashwara.share_id == share_id))
            db_record = db_res.scalars().first()
            self.assertIsNotNone(db_record)
            self.assertIsNotNone(db_record.created_at)
            self.assertIsNone(db_record.created_at.tzinfo, "DB created_at must be a timezone-naive datetime")

    async def test_read_nonexistent_share_id_returns_404(self):
        res = await self.client.get("/shared-mashwaras/completely_nonexistent_token_123")
        self.assertEqual(res.status_code, 404)

    async def test_size_limit_exceeded_returns_413(self):
        huge_text = "A" * 600_000
        huge_snapshot = {
            "decision_title": "Huge",
            "language": "en",
            "report": {"data": huge_text},
            "experts": []
        }
        res = await self.client.post("/shared-mashwaras", json={"snapshot": huge_snapshot})
        self.assertEqual(res.status_code, 413)

    async def test_malformed_snapshot_returns_400(self):
        res = await self.client.post("/shared-mashwaras", json={"snapshot": {"random": "bad_data"}})
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()

